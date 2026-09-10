import { numberToHex } from 'viem';
import { discardResponseBody, readJsonBounded } from '../../services/http';
import { withDeadline } from '../deadline';
import { creationProviderUrl } from './creationBundler';
import { prepareActivationTransaction, type ActivationSponsorPolicy } from './activationTransaction';

export interface ActivationProvider { readonly operatorId: string; readonly url: string }
export function activationProviders(providers: readonly ActivationProvider[]) {
 if (providers.length !== 2) throw new Error('ACTIVATION_PROVIDERS_INVALID');
 const peers = providers.map((p) => {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$(?![\s\S])/.test(p.operatorId)) throw new Error('ACTIVATION_PROVIDERS_INVALID');
  return Object.freeze({ operatorId: p.operatorId, url: creationProviderUrl(p.url) });
 });
 if (peers[0].operatorId === peers[1].operatorId || new URL(peers[0].url).hostname === new URL(peers[1].url).hostname) throw new Error('ACTIVATION_PROVIDERS_INVALID');
 return Object.freeze(peers);
}
function quantity(value: unknown) {
 if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$(?![\s\S])/.test(value)) throw new Error('ACTIVATION_RPC_INVALID');
 return BigInt(value);
}
/** Per invocation, bounded JSON-RPC. No retries, cached promises or provider errors in logs. */
export function activationTransport(url: string, signal: AbortSignal) {
 const endpoint = creationProviderUrl(url);
 let nextId = 0;
 return async (method: string, params: readonly unknown[]) => {
  if (!['eth_chainId','eth_getTransactionCount','eth_getCode','eth_getBalance','eth_estimateGas','eth_sendRawTransaction'].includes(method)) throw new Error('ACTIVATION_RPC_METHOD');
  signal.throwIfAborted();
  const id = ++nextId;
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  if (body.length > 110_000) throw new Error('ACTIVATION_RPC_INVALID');
  return withDeadline(signal, 5000, async (timeout) => {
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: timeout,
   headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body });
  if (!response.ok) { await discardResponseBody(response); throw new Error('ACTIVATION_RPC_UNAVAILABLE'); }
  const result = await readJsonBounded<unknown>(response, 16_384, timeout);
  if (!result || typeof result !== 'object' || Array.isArray(result) || !('jsonrpc' in result) || result.jsonrpc !== '2.0'
   || !('id' in result) || result.id !== id || !('result' in result) || 'error' in result) throw new Error('ACTIVATION_RPC_INVALID');
  return result.result;
  });
 };
}
type Transaction = ReturnType<typeof prepareActivationTransaction>;
async function inspectSponsor(request: Transaction, peers: readonly ActivationProvider[], signal: AbortSignal) {
 const tx = request.request;
 const call = { from: request.operator, to: tx.to, data: tx.data, value: '0x0', gas: numberToHex(tx.gas),
  maxFeePerGas: numberToHex(tx.maxFeePerGas), maxPriorityFeePerGas: numberToHex(tx.maxPriorityFeePerGas) };
 const checks = await Promise.allSettled(peers.map(async (p) => {
  const read = activationTransport(p.url, signal);
  if (quantity(await read('eth_chainId', [])) !== BigInt(tx.chainId)) throw new Error('ACTIVATION_CHAIN_MISMATCH');
  const nonce = quantity(await read('eth_getTransactionCount', [request.operator, 'pending']));
  if (nonce > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('ACTIVATION_NONCE_INVALID');
  if (await read('eth_getCode', [request.operator, 'latest']) !== '0x') throw new Error('ACTIVATION_SPONSOR_NOT_EOA');
  const balance = quantity(await read('eth_getBalance', [request.operator, 'pending']));
  const gas = quantity(await read('eth_estimateGas', [call]));
  if (gas === 0n || gas > tx.gas) throw new Error('ACTIVATION_GAS_EXCEEDED');
  return { nonce: Number(nonce), gas, balance };
 }));
 signal.throwIfAborted();
 const [a, b] = checks;
 if (a.status !== 'fulfilled' || b.status !== 'fulfilled') throw new Error('ACTIVATION_PREFLIGHT_FAILED');
 if (a.value.nonce !== b.value.nonce) throw new Error('ACTIVATION_NONCE_MISMATCH');
 return [a.value, b.value];
}
/** Independently observed nonce/gas, fixed private fee caps. Not a nonce allocator:
 * D1 must reserve the envelope BEFORE asking a sign-only adapter to sign it. */
export async function quoteActivationTransaction(call: Parameters<typeof prepareActivationTransaction>[1], policy: ActivationSponsorPolicy,
 providers: readonly ActivationProvider[], signal: AbortSignal) {
 const peers = activationProviders(providers), sponsor = Object.freeze({ ...policy });
 // The simulation ceiling also respects the execution budget; never silently clamp
 // an actual estimate to an inadequate gas limit after simulation.
 const gasCeiling = sponsor.maxFeePerGas > 0n ? sponsor.maxExecutionFee / sponsor.maxFeePerGas : 0n;
 const ceiling = prepareActivationTransaction(sponsor.networkId, call, sponsor, { nonce: 0,
  gas: gasCeiling < sponsor.maxGas ? gasCeiling : sponsor.maxGas,
  maxFeePerGas: sponsor.maxFeePerGas, maxPriorityFeePerGas: sponsor.maxPriorityFeePerGas });
 const checks = await inspectSponsor(ceiling, peers, signal);
 const gas = ((checks[0].gas > checks[1].gas ? checks[0].gas : checks[1].gas) * 120n + 99n) / 100n;
 const result = prepareActivationTransaction(sponsor.networkId, call, sponsor, { nonce: checks[0].nonce, gas,
  maxFeePerGas: sponsor.maxFeePerGas, maxPriorityFeePerGas: sponsor.maxPriorityFeePerGas });
 if (checks.some((c) => c.balance < gas * sponsor.maxFeePerGas)) throw new Error('ACTIVATION_SPONSOR_BALANCE');
 return result;
}
export async function preflightActivationTransaction(request: Transaction, providers: readonly ActivationProvider[], signal: AbortSignal) {
 const checks = await inspectSponsor(request, activationProviders(providers), signal), tx = request.request;
 if (checks.some((c) => c.nonce !== tx.nonce || c.balance < tx.gas * tx.maxFeePerGas)) throw new Error('ACTIVATION_PREFLIGHT_FAILED');
}
