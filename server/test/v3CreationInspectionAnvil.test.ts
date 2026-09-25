import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPublicClient, createWalletClient, createTestClient, encodeDeployData, http, keccak256, parseAbi, parseEventLogs, sha256, stringToHex, toFunctionSelector, zeroAddress, zeroHash,
	type Abi, type Address, type Hex } from 'viem';
import { foundry } from 'viem/chains';
import { inspectCreationDeployment, creationInspectionAbi } from '../../shared/v3/creationInspection';
import { deploymentDocumentDigest, type DeploymentComponent } from '../../shared/v3/deployment';
import { authorizeInitialization, prepareInitialization, type AccountCreationProfile } from '../../shared/v3/initialization';
import { initializationFixture } from './fixtures/v3Initialization';
import { authorizeCreationOperation, prepareCreationOperation, type CreationGasTerms } from '../../shared/v3/creationOperation';
import { inspectAccountDeployment } from '../../shared/v3/accountInspection';
import { inspectAccountSecurity } from '../../shared/v3/securityInspection';
import { observeCreationReceipt, verifyCreationReceipt } from '../../shared/v3/creationReceipt';
import { activationFixture } from './fixtures/v3Activation';
import { authorizeBootstrapActivation, authorizeBootstrapCommit, prepareBootstrapActivation, prepareBootstrapCommit } from '../../shared/v3/bootstrapActivation';
import { authorizationDigest, hashCalls } from '../../shared/v3/authorizations';
import { encodeDirectExecution } from '../../shared/v3/execution';
import { signerId } from '../../shared/v3/securityPolicy';

type Artifact = { abi: Abi; bytecode: { object: Hex; linkReferences: Record<string, Record<string, { start: number; length: number }[]>> };
	deployedBytecode: { object: Hex } };
const artifact = (name: string): Artifact => JSON.parse(readFileSync(fileURLToPath(new URL(`../../contracts/out/${name}.sol/${name}.json`, import.meta.url)), 'utf8'));
let node: ChildProcessWithoutNullStreams | undefined;

/** Fresh loopback-only Anvil, no fork, remote RPC, signing key, existing node or persisted
 * state. Minimal child environment excludes ANVIL_* and all operational credentials.
 * Stdout stays private (Anvil prints its public development accounts); only the listener
 * line is parsed. This test owns and terminates exactly this child process.
 */
async function startNode(): Promise<string> {
	// Generated Worker types augment ProcessEnv with production bindings. Preserve its
	// type without assertions, then REMOVE every nonessential key before child creation.
	const childEnv = { ...process.env };
	const allowed = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']);
	for (const name of Object.keys(childEnv)) if (!allowed.has(name.toUpperCase())) delete childEnv[name];
	const child = spawn('anvil', ['--host', '127.0.0.1', '--port', '0', '--chain-id', '31337', '--hardfork', 'cancun', '--accounts', '1'],
		{ windowsHide: true, stdio: 'pipe', env: childEnv });
	node = child;
	return new Promise((resolve, reject) => {
		let text = '', done = false;
		const timer = setTimeout(() => { child.kill(); finish(new Error('Local Anvil startup timed out')); }, 15000);
		function finish(error?: Error, endpoint?: string) {
			if (done) return; done = true; clearTimeout(timer);
			if (error) reject(error); else resolve(endpoint!);
		}
		child.once('error', () => finish(new Error('Anvil executable unavailable; install Foundry and build contracts')));
		child.once('exit', () => finish(new Error('Owned Anvil exited before listening')));
		child.stderr.on('data', () => { /* drain without printing process diagnostics */ });
		child.stdout.on('data', (chunk: Buffer) => {
			if (done) return; text = (text + chunk.toString('utf8')).slice(-8192);
			const match = /Listening on 127\.0\.0\.1:(\d+)/.exec(text);
			if (match) finish(undefined, `http://127.0.0.1:${match[1]}`);
		});
	});
}
async function stopNode() {
	const child = node;
	if (!child || child.exitCode !== null || child.signalCode !== null) return;
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Owned Anvil did not stop')), 5000);
		child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill();
	});
}

async function setup() {
	const endpoint = await startNode();
	const client = createPublicClient({ transport: http(endpoint, { retryCount: 0, timeout: 5000 }), cacheTime: 0, ccipRead: false });
	const control = createTestClient({ mode: 'anvil', transport: http(endpoint, { retryCount: 0, timeout: 5000 }) });
	const [deployer] = await createWalletClient({ transport: http(endpoint, { retryCount: 0, timeout: 5000 }) }).getAddresses();
	if (!deployer) throw new Error('Owned Anvil has no development account');
	const wallet = createWalletClient({ account: deployer, chain: foundry, transport: http(endpoint, { retryCount: 0, timeout: 5000 }) });
	const links = new Map<string, Address>();
	async function deploy(name: string, args: readonly unknown[] = []) {
		const compiled = artifact(name); let linked: string = compiled.bytecode.object;
		for (const file of Object.values(compiled.bytecode.linkReferences)) for (const [library, offsets] of Object.entries(file)) {
			const address = links.get(library); if (!address) throw new Error(`Missing local library ${library}`);
			for (const offset of offsets) {
				if (offset.length !== 20) throw new Error('Unexpected Solidity link width');
				const index = 2 + offset.start * 2;
				linked = linked.slice(0, index) + address.slice(2).toLowerCase() + linked.slice(index + 40);
			}
		}
		if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(linked)) throw new Error('Unlinked local artifact');
		const data = encodeDeployData({ abi: compiled.abi, bytecode: linked as Hex, args });
		const transaction = await wallet.sendTransaction({ data, gas: 15_000_000n });
		const receipt = await client.waitForTransactionReceipt({ hash: transaction, timeout: 10000, pollingInterval: 10 });
		if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`Local ${name} deployment reverted`);
		const address = receipt.contractAddress.toLowerCase() as Address;
		const code = await client.getCode({ address }); if (!code) throw new Error('Missing deployed code');
		links.set(name, address);
		return { address, code, transaction, block: receipt.blockNumber, data, abi: compiled.abi };
	}
	const ep = await deploy('EntryPoint'), security = await deploy('AccountV3Security'), upgrade = await deploy('AccountV3Upgrade');
	const implementation = await deploy('AccountV3', [ep.address]), factory = await deploy('AccountFactoryV3', [implementation.address, ep.address]);
	const verifier = await deploy('AccountV3WebAuthnVerifier');
	const f = initializationFixture();
	function component(result: Awaited<ReturnType<typeof deploy>>): DeploymentComponent {
		// Runtime, receipt and constructor encoding are REAL local evidence. Source/approval
		// metadata remains explicitly synthetic: this is NOT a publishable/admitted manifest.
		return { ...f.profile.deployment.components.implementation, address: result.address, deployer: deployer.toLowerCase() as Address,
			creation_code_hash: keccak256(result.data), runtime_code_hash: keccak256(result.code),
			abi_sha256: sha256(stringToHex(JSON.stringify(result.abi))), deployment_tx: result.transaction, deployed_block: result.block.toString() };
	}
	const creator = await client.readContract({ address: ep.address, abi: creationInspectionAbi, functionName: 'senderCreator' });
	const creatorCode = await client.getCode({ address: creator }); if (!creatorCode) throw new Error('SenderCreator missing');
	const genesis = await client.getBlock({ blockNumber: 0n });
	const profile: AccountCreationProfile = { ...f.profile,
		deployment: { ...f.profile.deployment, network_id: 'eip155:31337', genesis_hash: genesis.hash, entry_point: ep.address,
			storage_layout_hash: await client.readContract({ address: implementation.address, abi: creationInspectionAbi, functionName: 'storageLayoutHash' }),
			components: { factory: component(factory), implementation: component(implementation), security_module: component(security), upgrade_module: component(upgrade) },
			proxy: { ...f.profile.deployment.proxy,
				runtime_code_hash: keccak256(artifact('AccountV3Proxy').deployedBytecode.object),
				init_code_hash: await client.readContract({ address: factory.address, abi: creationInspectionAbi, functionName: 'proxyInitCodeHash' }) } },
		proxy_creation_code: artifact('AccountV3Proxy').bytecode.object, webauthn_verifier: component(verifier),
		entry_point_code_hash: keccak256(ep.code), sender_creator: { address: creator.toLowerCase() as Address, runtime_code_hash: keccak256(creatorCode) } };
	async function inspectionInput(value = profile) {
		const block = await client.getBlock(); const document = JSON.stringify(value);
		return { document, expectedDigest: deploymentDocumentDigest(document), checkpoint: { block_hash: block.hash, block_number: block.number.toString() } };
	}
	return { client, control, wallet, deployer, profile, f, deploy, component, inspectionInput };
}

let test: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { test = await setup(); }, 45000);
afterAll(stopNode, 7000);
describe('Compiled Account V3 composition on an owned local EVM', () => {
	it('verifies real factory immutables, linked libraries, EntryPoint and verifier through EIP-1898', async () => {
		const input = await test.inspectionInput();
		expect(await inspectCreationDeployment(test.client, input)).toMatchObject({ status: 'composition_matches', network_admitted: false });
	});
	it('the real WebAuthn verifier accepts the typed initial proof encoded by the shared client', async () => {
		const input = { ...test.f.input, ...await test.inspectionInput() }, prepared = prepareInitialization(input);
		const authorization = authorizeInitialization(input, test.f.assertion(prepared.digest), input.validAfter);
		const abi = parseAbi(['function verify(bytes key, bytes32 hash, bytes signature) view returns (bytes4)']);
		const result = await test.client.readContract({ address: test.profile.webauthn_verifier.address, abi, functionName: 'verify',
			args: [input.publicKey, prepared.digest, authorization.signature] });
		expect(result).toBe(toFunctionSelector('verify(bytes,bytes32,bytes)'));
	});
	it('a separately deployed implementation cannot be mixed into the original factory profile', async () => {
		const replacement = await test.deploy('AccountV3', [test.profile.deployment.entry_point]);
		const modified: AccountCreationProfile = { ...test.profile, deployment: { ...test.profile.deployment,
			components: { ...test.profile.deployment.components, implementation: test.component(replacement) },
			proxy: { ...test.profile.deployment.proxy, init_code_hash: keccak256(encodeDeployData({ abi: artifact('AccountV3Proxy').abi,
				bytecode: artifact('AccountV3Proxy').bytecode.object, args: [replacement.address] })) } } };
		await expect(inspectCreationDeployment(test.client, await test.inspectionInput(modified))).rejects.toMatchObject({ code: 'COMPOSITION_MISMATCH' });
	});
	it('creates the real single-passkey Account V3 via EntryPoint, checks economic receipt and refuses repricing/replay', async () => {
		const input = { ...test.f.input, ...await test.inspectionInput() };
		const now = Math.floor(Date.now() / 1000);
		const initial = test.f.assertion(prepareInitialization(input).digest);
		// Local test budget, not bundler/ ERC-7562 admission or an estimate for a public network.
		const terms: CreationGasTerms = { verificationGasLimit: 2_000_000n, callGasLimit: 100_000n, preVerificationGas: 150_000n,
			maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n, maximumGasCharge: 2_250_000_000_000_000n };
		const candidate = prepareCreationOperation(input, initial, terms, now);
		const signed = authorizeCreationOperation(input, initial, terms, test.f.assertion(candidate.digest), now);
		const ep = test.profile.deployment.entry_point;
		const abi = parseAbi([
			'struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }',
			'function getUserOpHash(PackedUserOperation op) view returns (bytes32)',
			'function handleOps(PackedUserOperation[] ops, address beneficiary)',
			'function getNonce(address sender, uint192 key) view returns (uint256)',
			'function balanceOf(address account) view returns (uint256)',
			'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
			'event AccountDeployed(bytes32 indexed userOpHash, address indexed sender, address factory, address paymaster)',
		]);
		expect(await test.client.readContract({ address: ep, abi, functionName: 'getUserOpHash', args: [signed.packed] })).toBe(signed.userOpHash);
		expect(await test.client.getCode({ address: signed.operation.sender })).toBeUndefined();
		// Development ETH from this freshly spawned loopback node, no user/testnet funds.
		const prefund = 10_000_000_000_000_000n;
		const funding = await test.wallet.sendTransaction({ to: signed.operation.sender, value: prefund });
		expect((await test.client.waitForTransactionReceipt({ hash: funding, timeout: 10000, pollingInterval: 10 })).status).toBe('success');
		const replaced = { ...signed.packed, preVerificationGas: signed.packed.preVerificationGas + 1n };
		await expect(test.client.simulateContract({ address: ep, abi, functionName: 'handleOps', args: [[replaced], test.deployer],
			account: test.deployer, gas: 10_000_000n })).rejects.toThrow();
		// Deliberate local fault injection after the failed simulation: prove that the real
		// reverted transaction rolls back factory deployment and any account prefund charge.
		const invalidHash = await test.wallet.writeContract({ address: ep, abi, functionName: 'handleOps',
			args: [[replaced], test.deployer], gas: 10_000_000n });
		expect((await test.client.waitForTransactionReceipt({ hash: invalidHash, timeout: 10000, pollingInterval: 10 })).status).toBe('reverted');
		expect(await test.client.getCode({ address: signed.operation.sender })).toBeUndefined();
		expect(await test.client.getBalance({ address: signed.operation.sender })).toBe(prefund);
		const { request } = await test.client.simulateContract({ address: ep, abi, functionName: 'handleOps', args: [[signed.packed], test.deployer],
			account: test.deployer, gas: 10_000_000n });
		const hash = await test.wallet.writeContract(request);
		const receipt = await test.client.waitForTransactionReceipt({ hash, timeout: 10000, pollingInterval: 10 });
		expect(receipt.status).toBe('success');
		const rawReceipt = await test.client.request({ method: 'eth_getTransactionReceipt', params: [hash] });
		const evidence = verifyCreationReceipt(signed, hash, rawReceipt);
		expect(evidence).toMatchObject({ outcome: 'creation_succeeded', transaction_hash: hash, user_op_hash: signed.userOpHash,
			finality: 'not_assessed', account_readiness: 'not_assessed' });
		const observed = await observeCreationReceipt(test.client, signed, hash, input.document);
		expect(observed).toMatchObject(evidence);
		const epLogs = receipt.logs.filter((log) => log.address.toLowerCase() === ep.toLowerCase());
		const outcomes = parseEventLogs({ abi, logs: epLogs, eventName: 'UserOperationEvent', strict: true });
		const creations = parseEventLogs({ abi, logs: epLogs, eventName: 'AccountDeployed', strict: true });
		expect(outcomes).toHaveLength(1); expect(creations).toHaveLength(1);
		expect(outcomes[0].args).toMatchObject({ userOpHash: signed.userOpHash, sender: signed.operation.sender,
			paymaster: zeroAddress, nonce: 0n, success: true });
		expect(creations[0].args.factory.toLowerCase()).toBe(test.profile.deployment.components.factory.address);
		expect(creations[0].args.userOpHash).toBe(signed.userOpHash);
		expect(outcomes[0].args.actualGasCost).toBeGreaterThan(0n);
		expect(outcomes[0].args.actualGasCost).toBeLessThanOrEqual(signed.maximumEntryPointCharge);
		const address = signed.operation.sender;
		const runtime = await test.client.getCode({ address });
		expect(runtime).toBe(artifact('AccountV3Proxy').deployedBytecode.object);
		const document = JSON.stringify(test.profile.deployment);
		const inspected = await inspectAccountDeployment(test.client, { document, expectedDigest: deploymentDocumentDigest(document),
			initialSecurityCommitment: candidate.prepared.message.initialSecurityCommitment, userSaltCommitment: input.userSaltCommitment,
			checkpoint: { block_hash: receipt.blockHash, block_number: receipt.blockNumber.toString() } });
		expect(inspected).toMatchObject({ status: 'recognized', account_id: candidate.plan.accountId, security_version: '1', spend_readiness: 'not_assessed' });
		const security = await inspectAccountSecurity(test.client, { document, expectedDigest: deploymentDocumentDigest(document),
			initialSecurityCommitment: candidate.prepared.message.initialSecurityCommitment, userSaltCommitment: input.userSaltCommitment,
			checkpoint: { block_hash: receipt.blockHash, block_number: receipt.blockNumber.toString() } });
		expect(security).toMatchObject({ status: 'recognized', spend_readiness: 'not_assessed', security: { phase: 'active_policy',
			policy_hash: candidate.prepared.message.initialSecurityCommitment, policy: candidate.prepared.policy,
			creation_valid_until: 0, pending: null, nonces: { spend: '0', admin: '0' } } });
		expect(await test.client.readContract({ address: ep, abi, functionName: 'getNonce', args: [address, 0n] })).toBe(1n);
		const deposit = await test.client.readContract({ address: ep, abi, functionName: 'balanceOf', args: [address] });
		expect(await test.client.getBalance({ address }) + deposit + outcomes[0].args.actualGasCost).toBe(prefund);
		const policy = await test.client.readContract({ address, abi: artifact('AccountV3').abi, functionName: 'securityPolicy' });
		expect(policy).toMatchObject({ mode: 1, spendThreshold: 1, adminThreshold: 1 });
		await expect(test.client.simulateContract({ address: ep, abi, functionName: 'handleOps', args: [[signed.packed], test.deployer],
			account: test.deployer, gas: 10_000_000n })).rejects.toThrow();
	}, 15000);
	it.each([0, 3600])('enrolls optional keys after %i seconds with real signatures, then signs directly without the RP domain', async (delay) => {
		const snapshot = await test.control.snapshot();
		try {
		const f = activationFixture(), initialization = { ...f.input.initialization, ...await test.inspectionInput() };
			const initial = prepareInitialization(initialization), now = Math.floor(Date.now() / 1000);
			// Snapshot restoration can leave Anvil's clock behind wall time for the next case.
			// Mine a fresh local checkpoint before submitting its newly signed creation window.
			const chainTime = (await test.client.getBlock()).timestamp;
			await test.control.setNextBlockTimestamp({ timestamp: chainTime >= BigInt(now) ? chainTime + 1n : BigInt(now) });
			await test.control.mine({ blocks: 1 });
			const terms: CreationGasTerms = { verificationGasLimit: 2_000_000n, callGasLimit: 100_000n, preVerificationGas: 150_000n,
				maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n, maximumGasCharge: 2_250_000_000_000_000n };
			const approval = f.assertion(initial.digest), creation = prepareCreationOperation(initialization, approval, terms, now);
			const signed = authorizeCreationOperation(initialization, approval, terms, f.assertion(creation.digest), now);
			async function mined(hash: Hex) {
				const receipt = await test.client.waitForTransactionReceipt({ hash, timeout: 10000, pollingInterval: 10 });
				expect(receipt.status).toBe('success'); return receipt;
			}
			await mined(await test.wallet.sendTransaction({ to: initial.account, value: 10_000_000_000_000_000n }));
			await mined(await test.wallet.writeContract({ address: test.profile.deployment.entry_point, abi: artifact('EntryPoint').abi,
				functionName: 'handleOps', args: [[signed.packed], test.deployer], gas: 10_000_000n }));
			async function security() {
				const checkpoint = await test.client.getBlock(), document = JSON.stringify(test.profile.deployment);
				const result = await inspectAccountSecurity(test.client, { document, expectedDigest: deploymentDocumentDigest(document),
					initialSecurityCommitment: initial.message.initialSecurityCommitment, userSaltCommitment: initialization.userSaltCommitment,
					checkpoint: { block_hash: checkpoint.hash, block_number: checkpoint.number.toString() } });
				if (result.status !== 'recognized') throw new Error('Local created account not recognized');
				return { result, time: Number(checkpoint.timestamp) };
			}
			const before = await security();
			// Use the REAL compiled verifier, not the synthetic fixture's descriptor.
			const nextPolicy = { ...f.input.nextPolicy, signers: f.input.nextPolicy.signers.map((s) => s.kind === 1 ? initial.policy.signers[0] : s) };
			nextPolicy.signers.sort((a, b) => signerId(a).localeCompare(signerId(b)));
			const input = { ...f.input, initialization, nextPolicy, observation: before.result };
			const p = prepareBootstrapActivation(input, now), authorization = await authorizeBootstrapActivation(input, f.assertion(p.digest), await f.proofs(input), now);
			const balance = await test.client.getBalance({ address: initial.account });
			await mined(await test.wallet.sendTransaction({ to: authorization.account, data: authorization.data, value: authorization.value, gas: 5_000_000n }));
			const proposed = await security();
			expect(proposed.result.security).toMatchObject({ phase: 'active_policy', pending: { kind: 1, hash: p.digest }, nonces: { admin: '1' } });
			expect(proposed.result.security_version).toBe('1');
			expect(await test.client.getBalance({ address: initial.account })).toBe(balance);
			await expect(test.client.call({ account: test.deployer, to: initial.account, data: authorization.data })).rejects.toThrow();
			if (delay > 0) {
				await test.control.increaseTime({ seconds: delay }); await test.control.mine({ blocks: 1 });
				await expect(test.client.call({ account: test.deployer, to: initial.account, data: authorization.data })).rejects.toThrow();
			}
			const reviewed = await security(), commitNow = Math.max(now, reviewed.time), until = Math.min(commitNow + 100, input.proposalValidUntil);
			if (delay > 0) expect(commitNow).toBeGreaterThan(input.validUntil);
			const c = prepareBootstrapCommit(input, reviewed.result, commitNow, until, commitNow);
			const commit = authorizeBootstrapCommit(input, reviewed.result, commitNow, until, f.assertion(c.digest), commitNow);
			await mined(await test.wallet.sendTransaction({ to: commit.account, data: commit.data, value: commit.value, gas: 5_000_000n }));
			const active = await security();
			expect(active.result).toMatchObject({ security_version: '2', spend_readiness: 'not_assessed', security: {
				phase: 'active_policy', manifest_hash: p.expectedManifestHash, policy_hash: p.message.nextPolicyHash,
				policy: nextPolicy, pending: null, nonces: { admin: '2' } } });
			expect(await test.client.getBalance({ address: initial.account })).toBe(balance);
			await expect(test.client.call({ account: test.deployer, to: initial.account, data: commit.data })).rejects.toThrow();
			// No WebAuthn, Firebase, GatoPago, bundler or paymaster below: an ephemeral direct key
			// signs and an unrelated local relayer submits. This is NOT a human recovery/exit drill.
			const key = f.keys[0], index = nextPolicy.signers.findIndex((s) => s.key === key.address.toLowerCase());
			const recipient = f.keys[1].address, calls = [{ target: recipient, value: 1n, data: '0x' as const }];
			const plan = { accountId: initial.message.accountId, generation: 3, securityVersion: 2n, executionMode: 1,
				entryPoint: zeroAddress, userOpHash: zeroHash, callsHash: hashCalls(calls), assetLimitsHash: zeroHash, feePolicyHash: zeroHash,
				paymaster: zeroAddress, previewHash: zeroHash, nonce: 0n, validAfter: Math.max(commitNow, active.time), validUntil: Math.max(commitNow, active.time) + 300 };
			const spendSignature = await key.sign({ hash: authorizationDigest('ExecutionPlan', initial.chainId, initial.account, plan) });
			const spend = encodeDirectExecution(initial.account, calls, plan, [{ signerIndex: index, signature: spendSignature }]);
			const prior = await test.client.getBalance({ address: recipient });
			await mined(await test.wallet.sendTransaction({ to: initial.account, data: spend, gas: 1_000_000n }));
			expect(await test.client.getBalance({ address: recipient })).toBe(prior + 1n);
			expect(await test.client.getBalance({ address: initial.account })).toBe(balance - 1n);
			await expect(test.client.call({ account: test.deployer, to: initial.account, data: spend })).rejects.toThrow();
			// Either explicitly enrolled direct key can administer this 1-of-N policy.
			// An address alone is never authority: an exact typed signature is required.
			const freeze = { accountId: initial.message.accountId, generation: 3, securityVersion: 2n,
				previousManifestHash: p.expectedManifestHash, chainScopeHash: p.message.chainScopeHash,
				nonce: 2n, validAfter: plan.validAfter, validUntil: plan.validUntil };
			const freezeDigest = authorizationDigest('FreezeUpgrades', initial.chainId, initial.account, freeze);
			const votes = [];
			for (const external of f.keys) votes.push({ signerIndex: nextPolicy.signers.findIndex((s) => s.key === external.address.toLowerCase()),
				signature: await external.sign({ hash: freezeDigest }) });
			await expect(test.client.simulateContract({ account: test.deployer, address: initial.account, abi: artifact('AccountV3').abi,
				functionName: 'freeze', args: [freeze, initial.chains, []] })).rejects.toThrow();
			await mined(await test.wallet.writeContract({ address: initial.account, abi: artifact('AccountV3').abi,
				functionName: 'freeze', args: [freeze, initial.chains, votes.slice(0, 1)], gas: 1_000_000n }));
			expect((await security()).result.security).toMatchObject({ upgrades_frozen: true, nonces: { admin: '3' } });
		} finally { await test.control.revert({ id: snapshot }); }
	}, 20000);
});
