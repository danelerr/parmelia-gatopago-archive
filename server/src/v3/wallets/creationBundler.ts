import { isAddress, type Hex } from 'viem';
import { formatUserOperationRequest } from 'viem/account-abstraction';
import type { authorizeCreationOperation } from '../../../../shared/v3/creationOperation';
import { requireHash } from '../../../../shared/v3/deployment';
import { discardResponseBody, readJsonBounded } from '../../services/http';

type Signed = ReturnType<typeof authorizeCreationOperation>;

export function creationProviderUrl(value: string) {
	const url = new URL(value);
	if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid creation provider URL');
	return url.href;
}
function quantity(value: unknown) {
	if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$(?![\s\S])/.test(value)) throw new Error('Invalid bundler quantity');
	return BigInt(value);
}

/** Internal, bounded ERC-4337 transport. No wallet signer, no prepareUserOperation,
 * repricing, fallback provider, state overrides or automatic transport retries.
 * Never log provider errors/URLs/operation signatures. Provider acceptance is not inclusion.
 */
export function createCreationBundler(rpcUrl: string, signal: AbortSignal) {
	const url = creationProviderUrl(rpcUrl);
	let nextId = 0;
	async function rpc(method: 'eth_chainId' | 'eth_supportedEntryPoints' | 'eth_estimateUserOperationGas' | 'eth_sendUserOperation', params: readonly unknown[]) {
		signal.throwIfAborted();
		const timeout = AbortSignal.any([signal, AbortSignal.timeout(5000)]), id = ++nextId;
		const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
		if (body.length > 50_000) throw new Error('Creation request too large');
		const response = await fetch(url, { method: 'POST', redirect: 'error', signal: timeout,
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body });
		if (!response.ok) { await discardResponseBody(response); throw new Error('Creation provider unavailable'); }
		const result = await readJsonBounded<unknown>(response, 16_384, timeout);
		if (!result || typeof result !== 'object' || Array.isArray(result) || !('jsonrpc' in result) || result.jsonrpc !== '2.0'
			|| !('id' in result) || result.id !== id || !('result' in result) || 'error' in result) throw new Error('Invalid creation provider response');
		return result.result;
	}
	return Object.freeze({
		async preflight(signed: Signed) {
			const entryPoint = signed.prepared.message.entryPoint;
			if (quantity(await rpc('eth_chainId', [])) !== signed.prepared.chainId) throw new Error('Bundler chain mismatch');
			const points = await rpc('eth_supportedEntryPoints', []);
			if (!Array.isArray(points) || points.length > 32 || !points.every((point) => typeof point === 'string' && isAddress(point, { strict: false }))
				|| !points.some((point: string) => point.toLowerCase() === entryPoint.toLowerCase())) throw new Error('Unsupported EntryPoint');
			const result = await rpc('eth_estimateUserOperationGas', [formatUserOperationRequest(signed.operation), entryPoint]);
			if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid creation simulation');
			for (const field of ['verificationGasLimit', 'callGasLimit', 'preVerificationGas'] as const) {
				const value = quantity(Reflect.get(result, field));
				if (value === 0n || value > signed.operation[field]) throw new Error('Simulation exceeds signed gas');
			}
			for (const field of ['paymasterVerificationGasLimit', 'paymasterPostOpGasLimit'] as const) {
				if (field in result && quantity(Reflect.get(result, field)) !== 0n) throw new Error('Unexpected sponsorship');
			}
		},
		async send(signed: Signed): Promise<Hex> {
			const hash = await rpc('eth_sendUserOperation', [formatUserOperationRequest(signed.operation), signed.prepared.message.entryPoint]);
			requireHash(hash);
			if (hash !== signed.userOpHash) throw new Error('Creation provider hash mismatch');
			return hash;
		},
	});
}
