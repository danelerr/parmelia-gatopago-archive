// Read-only Arbitrum Sepolia probe. Never signs/sends a transaction or calls a bundler.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(new URL(import.meta.resolve('@gatopago/shared/fixtures/v3-webauthn-chromium.json')), 'utf8'));
const hex = (value) => Buffer.from(value.replace(/^0x/, ''), 'hex');
const sha = (value) => createHash('sha256').update(value).digest();
const spki = hex(fixture.spki);
assert.equal(spki.length, 91);
const digest = sha(Buffer.concat([hex(fixture.authenticatorData), sha(fixture.clientDataJSON)]));
const input = Buffer.concat([digest, hex(fixture.r), hex(fixture.sNormalized), spki.subarray(27)]);
assert.equal(input.length, 160);
const altered = Buffer.from(input);
altered[0] ^= 1;
const one = `0x${'0'.repeat(63)}1`;
const target = '0x0000000000000000000000000000000000000100';

async function probe(rpc) {
  assert.equal(await rpc('eth_chainId', []), '0x66eee', 'Only Arbitrum Sepolia is in scope');
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  assert.match(block?.hash ?? '', /^0x[0-9a-fA-F]{64}$/);
  const call = (data) => ({ to: target, data: `0x${data.toString('hex')}` });
  const [valid, invalid] = await Promise.all([
    rpc('eth_call', [call(input), block.number]),
    rpc('eth_call', [call(altered), block.number]),
  ]);
  assert.equal(valid, one, 'P256 valid signature not accepted');
  assert(['0x', `0x${'0'.repeat(64)}`].includes(invalid), 'P256 altered digest not rejected');
  const gas = await rpc('eth_estimateGas', [call(input), block.number]);
  assert.match(gas, /^0x[0-9a-f]+$/i);
  assert(BigInt(gas) > 0n);
  return { chain_id: 421614, block_number: block.number, block_hash: block.hash,
    p256_valid: true, p256_invalid_rejected: true, rpc_estimated_call_gas: BigInt(gas).toString(),
    evidence: 'public Chromium fixture at native precompile; NOT an Account/UserOperation or device ceremony',
    bundler_admitted: false, sponsored_user_operation_sent: false, read_only: true };
}

if (process.argv[2] === '--self-test') {
  const rpc = async (method, params) => {
    if (method === 'eth_chainId') return '0x66eee';
    if (method === 'eth_getBlockByNumber') return { hash: `0x${'12'.repeat(32)}`, number: '0x1' };
    if (method === 'eth_call') return params[0].data === `0x${input.toString('hex')}` ? one : '0x';
    if (method === 'eth_estimateGas') return '0x7000';
    throw new Error('Unexpected RPC');
  };
  await probe(rpc);
  await assert.rejects(probe(async (method, params) => method === 'eth_chainId' ? '0xa4b1' : rpc(method, params)));
  await assert.rejects(probe(async (method, params) => method === 'eth_call' ? one : rpc(method, params)));
  console.log('P256 read-only probe: valid/invalid and chain guards pass (mock RPC only).');
} else {
  assert.equal(process.argv[2], '--rpc', 'Usage: --self-test OR --rpc <public RPC URL>');
  assert.equal(process.argv.length, 4);
  const url = new URL(process.argv[3]);
  assert.equal(url.protocol, 'https:');
  let id = 0;
  const rpc = async (method, params) => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(12_000) });
    assert(response.ok, `${method}: HTTP ${response.status}`);
    const payload = await response.json();
    assert(!payload.error, `${method}: RPC error ${payload.error?.code}`);
    return payload.result;
  };
  console.log(JSON.stringify({ observed_at: new Date().toISOString(), ...(await probe(rpc)) }, null, 2));
}
