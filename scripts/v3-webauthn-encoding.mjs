import { readFileSync } from 'node:fs';
import { encodeWebAuthnAssertion, webAuthnKeyFromSpki } from '../shared/v3/webauthn.ts';

const hexToBytes = (hex) => Uint8Array.from(Buffer.from(hex.slice(2), 'hex'));

const source = JSON.parse(readFileSync(new URL('../shared/fixtures/v3-webauthn-chromium.json', import.meta.url), 'utf8'));
const scope = { rpId: source.rpId, origin: source.origin };
const key = webAuthnKeyFromSpki(scope, hexToBytes(source.spki));
const signature = encodeWebAuthnAssertion({ scope, key, challenge: source.challenge, response: {
  authenticatorData: hexToBytes(source.authenticatorData), clientDataJSON: new TextEncoder().encode(source.clientDataJSON), signatureDER: hexToBytes(source.signatureDER),
} });
const expected = { schemaVersion: 1, source: 'v3-webauthn-chromium.json', key, challenge: source.challenge, signature };
if (process.argv[2] === '--describe') process.stdout.write(JSON.stringify(expected, null, 2) + '\n');
else {
  if (process.argv.length !== 2) throw new Error('Use --describe to inspect the wire vector.');
  const actual = JSON.parse(readFileSync(new URL('../shared/fixtures/v3-webauthn-encoding.json', import.meta.url), 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('WebAuthn wire vector differs from the production TypeScript encoder.');
  process.stdout.write('V3 WebAuthn ABI vector matches the TypeScript encoder; Foundry must verify the same bytes.\n');
}
