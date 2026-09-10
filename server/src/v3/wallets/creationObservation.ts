import type { Hex } from 'viem';
import type { authorizeCreationOperation } from '../../../../shared/v3/creationOperation';
import { observeCreationReceipt } from '../../../../shared/v3/creationReceipt';
import { requireHash } from '../../../../shared/v3/deployment';
import { loadPinnedCreationProfile } from '../../../../shared/v3/initialization';
import { assessCheckpointFinality, loadPinnedFinalityPolicy, type FinalityPolicyPin } from '../../../../shared/v3/finality';
import { discardResponseBody, readJsonBounded } from '../../services/http';
import { createInspectionClient } from '../chainInspection';
import { creationProviderUrl } from './creationBundler';

type SignedCreation = ReturnType<typeof authorizeCreationOperation>;
interface Configuration {
	readonly profileDocument: string;
	readonly bundlerUrl: string;
	/** Omitted only for the lower-level receipt stage; durable processing requires it. */
	readonly finalityPolicy?: FinalityPolicyPin;
	/** Distinct operators must be verified by admission, not inferred from hostnames. */
	readonly providers: readonly { readonly operatorId: string; readonly url: string }[];
}
async function transactionHint(signed: SignedCreation, url: string, signal: AbortSignal) {
	signal.throwIfAborted();
	const timeout = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
	const response = await fetch(url, { method: 'POST', redirect: 'error', signal: timeout,
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getUserOperationReceipt', params: [signed.userOpHash] }) });
	if (!response.ok) { await discardResponseBody(response); throw new Error('Creation hint unavailable'); }
	const body = await readJsonBounded<unknown>(response, 262_144, timeout);
	if (!body || typeof body !== 'object' || Array.isArray(body) || !('jsonrpc' in body) || body.jsonrpc !== '2.0'
		|| !('id' in body) || body.id !== 1 || !('result' in body) || 'error' in body) throw new Error('Invalid creation hint');
	if (body.result === null) return null;
	const value = body.result;
	if (!value || typeof value !== 'object' || Array.isArray(value) || !('userOpHash' in value) || value.userOpHash !== signed.userOpHash
		|| !('receipt' in value) || !value.receipt || typeof value.receipt !== 'object' || !('transactionHash' in value.receipt)) throw new Error('Invalid creation hint');
	requireHash(value.receipt.transactionHash);
	return value.receipt.transactionHash;
}

/** Internal observation stage. A known transaction can be checked without the bundler.
 * Its summary/success flag is NEVER economic evidence. Two configured execution RPCs
 * must independently agree, including original composition and canonical block hashes.
 * Operator independence/admission and chain-specific finality remain separate gates.
 * No D1 projection, rebroadcast, account activation or public route is performed here.
 */
export async function reconcileCreationObservation(signed: SignedCreation, configuration: Configuration,
	signal: AbortSignal, knownTransaction?: Hex) {
	const document = configuration.profileDocument;
	const profile = loadPinnedCreationProfile(document, signed.prepared.profileDigest);
	const finalityPolicy = configuration.finalityPolicy ? Object.freeze({ ...configuration.finalityPolicy }) : undefined;
	if (finalityPolicy) loadPinnedFinalityPolicy(finalityPolicy, profile.deployment);
	if (configuration.providers.length !== 2) throw new Error('Exactly two independent creation observers required');
	const providers = configuration.providers.map((provider) => {
		if (!/^[a-z][a-z0-9_-]{1,63}$(?![\s\S])/.test(provider.operatorId)) throw new Error('Invalid observer identity');
		return Object.freeze({ operatorId: provider.operatorId, url: creationProviderUrl(provider.url) });
	});
	if (new Set(providers.map((item) => item.operatorId)).size !== 2 || new Set(providers.map((item) => new URL(item.url).hostname)).size !== 2) throw new Error('Creation observers overlap');
	const bundlerUrl = creationProviderUrl(configuration.bundlerUrl);
	if (knownTransaction !== undefined) requireHash(knownTransaction);
	const deadline = AbortSignal.any([signal, AbortSignal.timeout(40_000)]);
	const base = { finality: 'not_assessed' as const, account_readiness: 'not_assessed' as const,
		provider_ids: Object.freeze(providers.map((item) => item.operatorId)) };
	let transaction = knownTransaction;
	try {
		deadline.throwIfAborted();
		if (transaction === undefined) transaction = await transactionHint(signed, bundlerUrl, deadline) ?? undefined;
		if (transaction === undefined) return Object.freeze({ ...base, status: 'not_observed' as const, transaction_hash: null });
		// All siblings are awaited even on an error; no request-scoped promises escape.
		const observations = await Promise.allSettled(providers.map((provider) => observeCreationReceipt(
			createInspectionClient(provider.url, deadline), signed, transaction!, document)));
		deadline.throwIfAborted();
		const [a, b] = observations;
		if (a.status === 'rejected' || b.status === 'rejected') return Object.freeze({ ...base, status: 'unavailable' as const, transaction_hash: transaction });
		if (JSON.stringify(a.value) !== JSON.stringify(b.value)) return Object.freeze({ ...base, status: 'disagreement' as const, transaction_hash: transaction });
		if (a.value === null) return Object.freeze({ ...base, status: 'not_observed' as const, transaction_hash: transaction });
		if (!finalityPolicy) return Object.freeze({ ...base, status: 'observed' as const, transaction_hash: transaction, observation: a.value });
		const assessment = await assessCheckpointFinality(providers.map((provider) => createInspectionClient(provider.url, deadline)),
			{ ...a.value, genesis_hash: profile.deployment.genesis_hash }, finalityPolicy, deadline);
		return Object.freeze({ ...base, status: 'observed' as const, transaction_hash: transaction, observation: a.value,
			finality: assessment.status, finality_evidence: assessment });
	} catch {
		// Never return provider diagnostics, embedded credentials or a cached "good" result.
		return Object.freeze({ ...base, status: 'unavailable' as const, transaction_hash: transaction ?? null });
	}
}
