import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, keccak256, parseTransaction, recoverTransactionAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { entryPoint09Abi, getUserOperationHash, type UserOperation } from 'viem/account-abstraction';
import { sendOperation, simulateOperation, submissionTransaction, resumeSubmission, type OperationTransport, type TransportOperation } from '../src/execution/operationTransport';

const key = `0x${'12'.repeat(32)}` as Hex, account = privateKeyToAccount(key);
const entryPoint = '0x433709009B8330FDa32311DF1C2AFA402eD8D009';
const self: OperationTransport = { kind: 'self', url: 'https://a.invalid/',
  providers: [{ operatorId: 'operator-a', url: 'https://a.invalid/' }, { operatorId: 'operator-b', url: 'https://b.invalid/' }],
  policy: { networkId: 'eip155:421614', operator: account.address, maxGas: 2_000_000n,
    maxFeePerGas: 100_000_000n, maxPriorityFeePerGas: 0n, maxExecutionFee: 200_000_000_000_000n } };
function input(nonce = 0n): TransportOperation {
  const operation: UserOperation<'0.9'> = { sender: '0x1111111111111111111111111111111111111111', nonce,
    callData: '0x12345678', callGasLimit: 100_000n, verificationGasLimit: 300_000n, preVerificationGas: 100_000n,
    maxFeePerGas: 100_000_000n, maxPriorityFeePerGas: 0n, signature: '0x1234' };
  return { operation, entryPoint, networkId: 'eip155:421614', validUntil: Math.floor(Date.now() / 1000) + 300,
    userOpHash: getUserOperationHash({ userOperation: operation, chainId: 421614, entryPointAddress: entryPoint, entryPointVersion: '0.9' }) };
}
function mockRpc(options: { timeout?: boolean; gas?: string; balance?: string } = {}) {
  const raw: Hex[] = [], requests: { url: string; method: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    requests.push({ url, method: request.method });
    let result;
    switch (request.method) {
      case 'eth_chainId': result = '0x66eee'; break;
      case 'eth_getTransactionCount': result = '0x0'; break;
      case 'eth_getCode': result = '0x'; break;
      case 'eth_getBalance': result = options.balance ?? '0xde0b6b3a7640000'; break;
      case 'eth_estimateGas': result = options.gas ?? '0x186a0'; break;
      case 'eth_sendRawTransaction':
        raw.push(request.params[0]);
        if (options.timeout) throw new Error('synthetic timeout');
        result = keccak256(request.params[0]); break;
      case 'eth_sendUserOperation': result = input().userOpHash; break;
      case 'eth_getUserOperationReceipt': result = { userOpHash: request.params[0], receipt: { transactionHash: `0x${'ab'.repeat(32)}` } }; break;
      default: throw new Error(`Unexpected method ${request.method}`);
    }
    return Response.json({ jsonrpc: '2.0', id: request.id, result });
  }));
  return { raw, requests };
}
const signal = () => new AbortController().signal;
beforeAll(async () => { await applyD1Migrations(env.WALLET_DB, env.V3_TEST_MIGRATIONS); });
beforeEach(async () => { await env.WALLET_DB.exec('DELETE FROM user_operation_submissions;'); });
afterEach(async () => { vi.unstubAllGlobals(); vi.restoreAllMocks(); await env.WALLET_DB.exec('DROP TRIGGER IF EXISTS fail_submission; DELETE FROM user_operation_submissions;'); });

describe('Worker handleOps transport', () => {
  it('persists and signs only the exact operation, EntryPoint and dedicated beneficiary', async () => {
    const rpc = mockRpc(), op = input();
    await simulateOperation(self, op, signal());
    expect(await sendOperation(env.WALLET_DB, self, op, signal(), key)).toBe(op.userOpHash);
    expect(rpc.raw).toHaveLength(1);
    const tx = parseTransaction(rpc.raw[0]);
    expect(tx.to?.toLowerCase()).toBe(entryPoint.toLowerCase());
    expect(tx.chainId).toBe(421614); expect(tx.nonce).toBe(0); expect(tx.value ?? 0n).toBe(0n);
    expect(await recoverTransactionAddress({ serializedTransaction: rpc.raw[0] as `0x02${string}` })).toBe(account.address);
    const decoded = decodeFunctionData({ abi: entryPoint09Abi, data: tx.data! });
    expect(decoded.functionName).toBe('handleOps');
    if (decoded.functionName !== 'handleOps') throw new Error('Wrong call');
    expect(decoded.args[0][0].signature).toBe(op.operation.signature);
    expect(decoded.args[1]).toBe(account.address);
    const stored = await env.WALLET_DB.prepare('SELECT * FROM user_operation_submissions').first();
    expect(stored?.transaction_hash).toBe(keccak256(rpc.raw[0]));
    expect(stored?.raw_transaction).toBe(rpc.raw[0]);
  });
  it('allocates distinct nonces atomically across concurrent Workers with a stale pending nonce', async () => {
    const rpc = mockRpc();
    await Promise.all([sendOperation(env.WALLET_DB, self, input(), signal(), key),
      sendOperation(env.WALLET_DB, self, input(1n), signal(), key)]);
    expect(rpc.raw.map(raw => parseTransaction(raw).nonce).sort()).toEqual([0, 1]);
  });
  it('pins an uncertain submission across provider and key changes, replaying the same bytes', async () => {
    const first = mockRpc({ timeout: true }), op = input();
    await expect(sendOperation(env.WALLET_DB, self, op, signal(), key)).rejects.toThrow();
    const next = mockRpc();
    await sendOperation(env.WALLET_DB, { kind: 'bundler', url: 'https://new.invalid/' }, op, signal());
    expect(next.raw).toEqual(first.raw);
    expect(await submissionTransaction(env.WALLET_DB, op.userOpHash, signal())).toBe(keccak256(first.raw[0]));
    expect(next.requests.every(r => r.url === self.url)).toBe(true);
    expect(next.requests.some(r => r.method === 'eth_sendUserOperation')).toBe(false);
  });
  it('only private recovery rebroadcasts; reading status has no sending side effects', async () => {
    const rpc = mockRpc(), op = input();
    await sendOperation(env.WALLET_DB, self, op, signal(), key);
    await submissionTransaction(env.WALLET_DB, op.userOpHash, signal());
    expect(rpc.raw).toHaveLength(1);
    await resumeSubmission(env.WALLET_DB, op.userOpHash, signal());
    expect(rpc.raw).toEqual([rpc.raw[0], rpc.raw[0]]);
    vi.spyOn(Date, 'now').mockReturnValue((op.validUntil + 1) * 1000);
    await resumeSubmission(env.WALLET_DB, op.userOpHash, signal());
    expect(rpc.raw).toHaveLength(2);
  });
  it('keeps the original bundler for receipt lookup after migration', async () => {
    const rpc = mockRpc(), op = input();
    await sendOperation(env.WALLET_DB, { kind: 'bundler', url: 'https://old.invalid/' }, op, signal());
    expect(await submissionTransaction(env.WALLET_DB, op.userOpHash, signal())).toBe(`0x${'ab'.repeat(32)}`);
    expect(rpc.requests.at(-1)?.url).toBe('https://old.invalid/');
  });
  it('never broadcasts when D1 cannot persist the signed transaction', async () => {
    const rpc = mockRpc();
    await env.WALLET_DB.exec("CREATE TRIGGER fail_submission BEFORE INSERT ON user_operation_submissions BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
    await expect(sendOperation(env.WALLET_DB, self, input(), signal(), key)).rejects.toThrow();
    expect(rpc.raw).toEqual([]);
  });
  it.each([{ gas: '0x2dc6c0' }, { balance: '0x0' }])('rejects operator gas or funding outside its budget: %j', async options => {
    const rpc = mockRpc(options);
    await expect(sendOperation(env.WALLET_DB, self, input(), signal(), key)).rejects.toThrow();
    expect(rpc.raw).toEqual([]);
  });
  it('keeps receipt discovery after expiry but stops rebroadcasting', async () => {
    const rpc = mockRpc(), op = input();
    await sendOperation(env.WALLET_DB, self, op, signal(), key);
    vi.spyOn(Date, 'now').mockReturnValue((op.validUntil + 1) * 1000);
    expect(await submissionTransaction(env.WALLET_DB, op.userOpHash, signal())).toBe(keccak256(rpc.raw[0]));
    expect(rpc.raw).toHaveLength(1);
  });
  it('rejects a different signature under an already dispatched userOpHash', async () => {
    const rpc = mockRpc(), op = input();
    await sendOperation(env.WALLET_DB, self, op, signal(), key);
    await expect(sendOperation(env.WALLET_DB, self, { ...op, operation: { ...op.operation, signature: '0xabcd' } }, signal(), key)).rejects.toThrow('TRANSPORT_SUBMISSION_CONFLICT');
    expect(rpc.raw).toHaveLength(1);
    await expect(env.WALLET_DB.prepare("UPDATE user_operation_submissions SET endpoint = 'https://changed.invalid/'").run()).rejects.toThrow();
  });
});
