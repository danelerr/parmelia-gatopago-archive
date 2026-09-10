import { env } from 'cloudflare:workers';
import { decodeFunctionData, encodeFunctionResult, zeroHash, type Hex } from 'viem';
import { accountInspectionAbi } from '../../../shared/v3/accountInspection';
import { hashSecurityManifest } from '../../../shared/v3/authorizations';
import { deploymentDocumentDigest } from '../../../shared/v3/deployment';
import { accountSecurityInspectionAbi } from '../../../shared/v3/securityInspection';
import { CreationDeliveryRepository } from '../../src/v3/wallets/creationDelivery';
import { CreationObservationJournal } from '../../src/v3/wallets/creationObservationJournal';
import { processCreationObservation } from '../../src/v3/wallets/processCreationObservation';
import { processCreationProjection } from '../../src/v3/wallets/processCreationProjection';
import { creationInspectionScenario } from '../../test/fixtures/v3CreationInspection';
import { creationReceiptScenario } from '../../test/fixtures/v3CreationReceipt';
import { finalityPin, finalityPolicyFixture } from '../../test/fixtures/v3Finality';

import { expect, vi } from 'vitest';
import { deliveryNow, seedCreationDelivery } from './creationDelivery.fixture';

export async function creationProjectionScenario(observe = true) {
	const inspection = creationInspectionScenario(), document = inspection.input.document;
	const f = await seedCreationDelivery(undefined, { document, digest: deploymentDocumentDigest(document) });
	const evidence = creationReceiptScenario(false, f.signed), prepared = f.signed.prepared, message = prepared.message;
	const manifestHash = hashSecurityManifest({ accountId: message.accountId, generation: 3, securityVersion: 1n,
		previousManifestHash: zeroHash, policyHash: message.initialSecurityCommitment, chainScopeHash: message.chainScopeHash });
	const state = { flags: 1n, version: 1n, manifestHash, spendNonce: 0n, adminNonce: 0n, recoveryNonce: 0n,
		creationUntil: 0n, creationAfter: 0n, scope: message.chainScopeHash, mode: 0 };
	const configuration = { ...f.configuration, networks: [{ ...f.configuration.profiles[0],
		bundlerUrl: 'https://bundler.invalid/', finalityPolicy: finalityPin(finalityPolicyFixture(inspection.profile.deployment, deliveryNow())),
		providers: [{ operatorId: 'provider_a', url: 'https://observer-a.invalid/' }, { operatorId: 'provider_b', url: 'https://observer-b.invalid/' }] }] };
	const reply = vi.fn(async (method: string, params: readonly unknown[]): Promise<unknown> => {
		if (method === 'eth_call') {
			const call = params[0] as { data: Hex };
			let securityMethod; let accountMethod;
			try { securityMethod = decodeFunctionData({ abi: accountSecurityInspectionAbi, data: call.data }).functionName; } catch { /* Other ABI. */ }
			try { accountMethod = decodeFunctionData({ abi: accountInspectionAbi, data: call.data }).functionName; } catch { /* Other ABI. */ }
			if (securityMethod === 'securitySnapshot') return encodeFunctionResult({ abi: accountSecurityInspectionAbi, functionName: securityMethod,
				result: [state.flags, state.version, BigInt(state.manifestHash), BigInt(state.scope), state.creationAfter, state.creationUntil,
					state.spendNonce, state.adminNonce, state.recoveryNonce, 0n, 0n, 0n, 0n, 0n, 0n, 0n] });
			if (securityMethod === 'securityPolicy') return encodeFunctionResult({ abi: accountSecurityInspectionAbi, functionName: securityMethod,
				result: { ...prepared.policy, mode: state.mode, signers: [...prepared.policy.signers] } });
			if (accountMethod === 'inspectAccount') return encodeFunctionResult({ abi: accountInspectionAbi, functionName: accountMethod,
				result: { account: prepared.account, accountId: message.accountId, implementation: prepared.profile.deployment.components.implementation.address,
					securityVersion: state.version, storageLayoutHash: prepared.profile.deployment.storage_layout_hash } });
			if (accountMethod === 'proxyImplementation') return encodeFunctionResult({ abi: accountInspectionAbi, functionName: accountMethod,
				result: prepared.profile.deployment.components.implementation.address });
		}
		return evidence.request({ method, params });
	});
	const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
		init?.signal?.throwIfAborted();
		const request = JSON.parse(String(init?.body)) as { id: number; method: string; params: readonly unknown[] };
		if (String(url) === 'https://bundler.invalid/') return Response.json({ jsonrpc: '2.0', id: request.id,
			result: { userOpHash: f.signed.userOpHash, receipt: evidence.receipt } });
		if (!configuration.networks[0].providers.some((p) => p.url === String(url))) throw new Error('Unexpected RPC destination');
		return Response.json({ jsonrpc: '2.0', id: request.id, result: await reply(request.method, request.params) });
	});
	const delivery = new CreationDeliveryRepository(env.WALLET_DB, f.configuration), claim = await delivery.claim(f.id);
	if (!claim) throw new Error('Expected send grant');
	await delivery.beginSend(claim); await delivery.accepted(claim, f.signed.userOpHash);
	if (observe) expect(await processCreationObservation(env.WALLET_DB, f.id, configuration, new AbortController().signal)).toBe('observed');
	fetch.mockClear(); reply.mockClear();
	return { ...f, prepared, evidence, state, reply, fetch, configuration,
		journal: new CreationObservationJournal(env.WALLET_DB, f.configuration),
		run: (signal = new AbortController().signal) => processCreationProjection(env.WALLET_DB, f.id, configuration, signal) };
}
