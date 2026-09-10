// Actual React review UI with synthetic public credentials and identity only.
// No real Firebase session, admitted chain, funds or account mutation. Optional
// --activation exercises the real operation UI with synthetic responses and an
// explicitly cancelled ceremony adapter; it is NOT a real-device signing test.
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const webRoot = resolve(root, 'apps/web'), fixtureFile = resolve(root, 'output/playwright/v3-policy-fixture.mjs');
await build({ outfile: fixtureFile, bundle: true, platform: 'node', format: 'esm', stdin: { resolveDir: webRoot,
  contents: "export { policyReviewFixture } from './test/activation-policy.fixture';" } });
const { policyReviewFixture } = await import(pathToFileURL(fixtureFile).href);
const fixture = policyReviewFixture();
const activationMode = process.argv.includes('--activation');
const publicData = { consent: fixture.consent, inventory: fixture.inventory, pin: fixture.pin, material: fixture.material,
  activation: activationMode, input: fixture.t.f.input,
  bootstrap: { wallet_id: fixture.t.choice.walletId, wallet_account_id: fixture.t.choice.walletAccountId },
  addresses: [...fixture.t.f.keys.map((key) => key.address), policyReviewFixture(1).t.f.keys[0].address] };
const css = await readFile(resolve(webRoot, 'src/app/base.css'), 'utf8') + await readFile(resolve(webRoot, 'src/auth/auth.css'), 'utf8');
const result = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: activationMode ? [{ name: 'synthetic-cancelled-ceremony', setup(build) {
    build.onResolve({ filter: /^\.\/passkeys$/ }, () => ({ path: 'cancelled-proof', namespace: 'synthetic' }));
    build.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: `export async function requestPasskeyProof() {
      window.syntheticActivationCeremony(); throw Object.assign(new Error('cancelled'), { code: 'cancelled' }); }`, loader: 'js' }));
  } }] : [],
  define: { 'process.env.NODE_ENV': '"development"' }, stdin: { resolveDir: webRoot, sourcefile: 'policy-harness.tsx', loader: 'tsx', contents: `
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ActivationPolicyReview from './src/wallet/ActivationPolicyReview';
import { parseCredentialDetail } from '@gatopago/shared/v3/credential-detail';
import { prepareBootstrapActivation } from '@gatopago/shared/v3/bootstrap-activation';
import { parseActivationPreview } from '@gatopago/shared/v3/activation-wire';
import { externalEnrollmentRequest, importExternalEnrollment } from '@gatopago/shared/v3/external-enrollment';
const data = ${JSON.stringify(publicData)};
let current = {}, failure = false, delay = false, reads = 0, ceremonies = 0, preparations = 0, operationReads = 0, wire = null;
const listeners = new Set();
function countCeremony() { ceremonies++; document.getElementById('ceremonies').textContent = String(ceremonies); throw new Error('Unexpected ceremony'); }
window.syntheticActivationCeremony = () => { ceremonies++; document.getElementById('ceremonies').textContent = String(ceremonies); };
Object.defineProperty(navigator, 'credentials', { configurable: true, value: { get: countCeremony, create: countCeremony } });
const runtime = {
  subscribe(callback) { listeners.add(callback); callback({ uid: 'synthetic' }); return () => listeners.delete(callback); },
  async activation(uid) {
    const captured = current;
    const assertCurrent = () => { if (captured !== current || uid !== 'synthetic') throw { code: 'auth/session-changed' }; };
    return { assertCurrent,
      async prepare(choice, signal) {
        assertCurrent(); preparations++; document.getElementById('preparations').textContent = String(preparations);
        const now = Math.floor(Date.now() / 1000), input = { ...data.input, nextPolicy: choice.nextPolicy,
          validAfter: now, validUntil: now + 180, proposalValidUntil: choice.proposalValidUntil };
        const compiled = prepareBootstrapActivation(input, now);
        wire = { activation_id: choice.activationId, initialization_id: choice.consent.preparation.initialization_id,
          wallet_id: choice.walletId, wallet_account_id: choice.walletAccountId, state: 'prepared', proposal_hash: compiled.digest,
          expected_manifest_hash: compiled.expectedManifestHash, valid_after: now, valid_until: now + 180,
          proposal_valid_until: choice.proposalValidUntil, activation_assessment: 'not_assessed', receive_enabled: false, spend_enabled: false, input };
        if (delay) await new Promise(resolve => setTimeout(resolve, 3000));
        signal.throwIfAborted(); assertCurrent(); if (failure) throw { code: 'activation/unavailable' };
        return { wire: structuredClone(wire), preview: parseActivationPreview(wire, choice) };
      },
      async restore(choice, signal) {
        assertCurrent(); operationReads++; document.getElementById('operation-reads').textContent = String(operationReads);
        signal.throwIfAborted(); if (!wire) throw { code: 'activation/not-found' };
        return { wire: structuredClone(wire), preview: parseActivationPreview(wire, choice) };
      },
      externalProofRequest(choice, review, index) { assertCurrent(); return externalEnrollmentRequest(choice, review.wire, index, Math.floor(Date.now() / 1000)); },
      async importExternalProof(choice, review, index, text, signal) {
        assertCurrent(); const proof = await importExternalEnrollment(choice, review.wire, index, text, Math.floor(Date.now() / 1000));
        signal.throwIfAborted(); assertCurrent(); return proof;
      },
      async authorize() { throw new Error('Synthetic UI harness never submits authorization'); },
    };
  },
  credentialInventory(uid) {
    const captured = current;
    const assertCurrent = () => { if (captured !== current || uid !== 'synthetic') throw { code: 'auth/session-changed' }; };
    return { assertCurrent, async detail(reference, signal) {
      assertCurrent(); reads++; document.getElementById('reads').textContent = String(reads);
      if (delay) await new Promise(resolve => setTimeout(resolve, 3000));
      signal.throwIfAborted(); assertCurrent();
      if (failure) throw { code: 'credentials/unavailable' };
      const value = data.material.find(row => row.credential_ref === reference);
      return parseCredentialDetail(value, data.consent.expected.scope, reference);
    } };
  },
};
function Harness() {
  const [english, setEnglish] = useState(false), [mount, setMount] = useState(0), [active, setActive] = useState(false);
  return <main className="auth-shell"><h1>Revisión V3 — prueba local</h1>
    <p>Datos sintéticos. Sin fondos, sin sesión real, sin cambios onchain.</p>
    <p>Lecturas: <span id="reads">0</span>. Ceremonias: <span id="ceremonies">0</span>. Edición/operación bloqueada: {String(active)}.</p>
    {data.activation ? <><p>Preparaciones simuladas: <span id="preparations">0</span>. Consultas de operación: <span id="operation-reads">0</span>.</p>
      <details><summary>Direcciones sintéticas para la prueba</summary><ul>{data.addresses.map(address => <li key={address}><code>{address}</code></li>)}</ul></details></> : null}
    <nav><button onClick={() => setEnglish(value => !value)}>ES / EN</button>
      <button onClick={() => { failure = !failure; }}>Simular error</button>
      <button onClick={() => { delay = !delay; }}>Simular espera</button>
      <button onClick={() => { current = {}; listeners.forEach(callback => callback({ uid: 'synthetic' })); }}>Reemplazar sesión</button>
      {data.activation ? <button onClick={() => { if (wire) wire.state = 'authorized'; }}>Simular registro autorizado</button> : null}
      <button onClick={() => setMount(value => value + 1)}>Reiniciar revisión</button></nav>
    <section className="auth-panel"><ActivationPolicyReview key={mount} runtime={runtime} uid="synthetic" english={english}
      consent={data.consent} inventory={data.inventory} pin={data.pin} bootstrap={data.activation ? data.bootstrap : undefined} onActiveChange={setActive} /></section>
  </main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
` } });
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Revisión de política V3 — local</title><style>${css}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`;
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  if (request.url === '/harness.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(result.outputFiles[0].text); return; }
  response.writeHead(404); response.end();
});
server.listen(4180, '127.0.0.1', () => console.log(`V3 policy review fixture: http://127.0.0.1:4180 PID=${process.pid}`));
