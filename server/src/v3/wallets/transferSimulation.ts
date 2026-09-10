import { isAddress } from 'viem';
import { formatUserOperationRequest } from 'viem/account-abstraction';
import { evmChainId } from '../../../../shared/v3/primitives';
import { discardResponseBody, readJsonBounded } from '../../services/http';
import { withDeadline } from '../deadline';
import { creationProviderUrl } from './creationBundler';
import { writeTransferOperationRecord } from './transferOperationRecord';
import type { readTransferReview } from './transferReviewRecord';

const gasFields = ['verificationGasLimit', 'callGasLimit', 'preVerificationGas'] as const;
function quantity(value: unknown) {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$(?![\s\S])/.test(value)) throw new Error('TRANSFER_SIMULATION_INVALID');
  return BigInt(value);
}

/** Private ERC-4337 preflight of EXACT stored bytes. A bundler estimate is not
 * inclusion, fresh security/funds evidence or a durable send grant. Caller must
 * admit the provider and restore/verify the historical quorum before calling.
 */
export async function simulateTransferOperation(recordInput: Awaited<ReturnType<typeof readTransferReview>>,
  providerUrl: string, signal: AbortSignal) {
  const record = structuredClone(recordInput), url = creationProviderUrl(providerUrl);
  const { candidate, operation } = record, plan = candidate.plan;
  const payload = writeTransferOperationRecord(operation, { network_id: candidate.request.network_id, account: candidate.account,
    account_id: plan.accountId, entry_point: plan.entryPoint, userop_hash: candidate.userOpHash, consent_digest: candidate.digest, valid_until: plan.validUntil });
  const started = Math.floor(Date.now() / 1000);
  function fresh() {
    const now = Math.floor(Date.now() / 1000);
    if (now < started || now < record.review.approved_at || now < plan.validAfter || now >= plan.validUntil) throw new Error('TRANSFER_SIMULATION_EXPIRED');
    return now;
  }
  fresh();
  return withDeadline(signal, 15_000, async deadline => {
    let nextId = 0;
    async function rpc(method: 'eth_chainId' | 'eth_supportedEntryPoints' | 'eth_estimateUserOperationGas', params: readonly unknown[]) {
      fresh(); deadline.throwIfAborted();
      const id = ++nextId, body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      if (body.length > 180_000) throw new Error('TRANSFER_SIMULATION_TOO_LARGE');
      return withDeadline(deadline, 5000, async requestSignal => {
        const response = await fetch(url, { method: 'POST', redirect: 'error', signal: requestSignal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body });
        if (!response.ok) { await discardResponseBody(response); throw new Error('TRANSFER_SIMULATION_UNAVAILABLE'); }
        const result = await readJsonBounded<unknown>(response, 16_384, requestSignal);
        if (!result || typeof result !== 'object' || Array.isArray(result) || !('jsonrpc' in result) || result.jsonrpc !== '2.0'
          || !('id' in result) || result.id !== id || !('result' in result) || 'error' in result) throw new Error('TRANSFER_SIMULATION_INVALID');
        fresh(); return result.result;
      });
    }
    if (quantity(await rpc('eth_chainId', [])) !== evmChainId(candidate.request.network_id)) throw new Error('TRANSFER_SIMULATION_CHAIN');
    const points = await rpc('eth_supportedEntryPoints', []);
    if (!Array.isArray(points) || points.length > 32 || !points.every(p => typeof p === 'string' && isAddress(p, { strict: false }))
      || !points.some((p: string) => p.toLowerCase() === plan.entryPoint.toLowerCase())) throw new Error('TRANSFER_SIMULATION_ENTRYPOINT');
    const result = await rpc('eth_estimateUserOperationGas', [formatUserOperationRequest(operation), plan.entryPoint]);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('TRANSFER_SIMULATION_INVALID');
    const estimates = gasFields.map(field => {
      const value = quantity(Reflect.get(result, field));
      if (value === 0n || value > operation[field]) throw new Error('TRANSFER_SIMULATION_EXCEEDS_CONSENT');
      return [field, value.toString()] as const;
    });
    for (const field of ['paymasterVerificationGasLimit', 'paymasterPostOpGasLimit']) {
      if (field in result && quantity(Reflect.get(result, field)) !== 0n) throw new Error('TRANSFER_SIMULATION_UNEXPECTED_PAYMASTER');
    }
    deadline.throwIfAborted(); const now = fresh();
    return Object.freeze({ userop_hash: candidate.userOpHash, consent_digest: candidate.digest,
      operation_sha256: payload.digest, gas: Object.freeze(Object.fromEntries(estimates)),
      observed_at: now, expires_at: Math.min(now + 5, plan.validUntil), send_enabled: false as const });
  });
}
