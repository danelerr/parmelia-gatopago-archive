import { isAddress, zeroAddress, zeroHash, type Address } from 'viem';
import { prepareInitialization, type InitializationInput } from './initialization';
import { hashSecurityPolicy, Role, signerId, SignerKind, type SecurityPolicy } from './securityPolicy';
import { assessPolicyContinuity } from './bootstrapActivation';

/** Three candidate direct signers, NOT evidence of distinct people/devices or EOA
 * control. Mixed-case input must pass EIP-55 before normalization. No RPC or key
 * generation: possession is proved separately for the exact activation proposal. */
export function independentGuardianAddresses(values: readonly string[]): readonly Address[] {
	if (!Array.isArray(values) || values.length !== 3) throw new Error('RECOVERY_NEEDS_THREE_GUARDIANS');
	const addresses = values.map((value) => {
		if (typeof value !== 'string' || !isAddress(value, { strict: true })) throw new Error('RECOVERY_ADDRESS_INVALID');
		const address = value.toLowerCase() as Address;
		if (address === zeroAddress) throw new Error('RECOVERY_ADDRESS_INVALID');
		return address;
	});
	if (new Set(addresses).size !== 3) throw new Error('RECOVERY_GUARDIANS_MUST_DIFFER');
	return Object.freeze(addresses);
}

/** Advanced candidate profile: daily spending remains passkey-only. Two of three
 * direct guardians can recover after the policy delay without the RP/domain;
 * administration needs the passkey AND guardian 1. The recovery guardians alone
 * must NOT form an administrative quorum outside the delayed recovery path.
 * This is NOT an admitted release profile, completed ceremony or exit drill. */
export function independentRecoveryPolicy(input: InitializationInput, values: readonly string[]) {
	const addresses = independentGuardianAddresses(values), initial = prepareInitialization(input);
	if (addresses.includes(initial.account.toLowerCase() as Address)) throw new Error('RECOVERY_ACCOUNT_CANNOT_GUARD_ITSELF');
	const passkey = Object.freeze({ ...initial.policy.signers[0], roles: Role.SPEND | Role.ADMIN });
	const guardians = addresses.map((key, index) => Object.freeze({ kind: SignerKind.ECDSA, verifier: zeroAddress,
		verifierCodeHash: zeroHash, key, roles: Role.RECOVERY | (index === 0 ? Role.ADMIN : 0), assisted: false }));
	const signers = Object.freeze([passkey, ...guardians].sort((a, b) => signerId(a) < signerId(b) ? -1 : 1));
	const policy: SecurityPolicy = Object.freeze({ ...initial.policy, mode: 'active', signers,
		spendThreshold: 1, adminThreshold: 2, recoveryThreshold: 2 });
	return Object.freeze({ policy, hash: hashSecurityPolicy(policy), addresses,
		continuity: assessPolicyContinuity(policy), possession: 'not_assessed' as const,
		activationReady: false as const, onchainAuthority: 'not_assessed' as const });
}
