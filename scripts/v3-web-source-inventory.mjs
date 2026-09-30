// Validate historical provenance only; the previous application is not a build input.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
const output = new URL('../docs/operations/v3-web-source-inventory.json', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = /\.(?:astro|ts|tsx|js|mjs|css|json|md|html|svg|png|webp|ico|txt|xml|woff2)$/;
const prohibited = /(?:^|\/)(?:\.env[^/]*|\.dev\.vars[^/]*|node_modules|\.git|\.vercel|documentacion)(?:\/|$)|(?:firebase-adminsdk|service-account)/i;
const publicPath = name => !isAbsolute(name) && !name.includes('\\') && !name.split('/').some(part => part === '..' || part === '.' || part === '') && !prohibited.test(name) && allowed.test(name);
function validate(snapshot) {
  assert.equal(snapshot.schema_version, 1);
  assert.deepEqual(Object.keys(snapshot.sources).sort(), ['consumer', 'landing']);
  for (const source of Object.values(snapshot.sources)) {
    assert.match(source.git_head, /^[a-f0-9]{40}$/);
    assert.equal(source.content_sha256, sha(JSON.stringify(source.files)));
    assert(source.files.length > 0);
    const seen = new Set();
    for (const file of source.files) {
      assert(publicPath(file.path), `Unapproved public path: ${file.path}`);
      assert(!seen.has(file.path), `Duplicate source: ${file.path}`);
      seen.add(file.path);
      assert.match(file.sha256, /^[a-f0-9]{64}$/);
      assert(Number.isSafeInteger(file.bytes) && file.bytes >= 0);
    }
  }
  assert.equal(snapshot.content_sha256, sha(JSON.stringify({ sources: snapshot.sources, screenshots: snapshot.screenshots })));
}

// These checks do not need either historical repository or private runtime configuration.
for (const path of ['../key.ts', '/key.ts', 'C:\\key.ts', 'src/.env.json', 'src/service-account.json', 'documentacion/private.md']) assert(!publicPath(path));
assert(publicPath('src/components/MeliSprite.astro'));
  const snapshot = JSON.parse(readFileSync(output, 'utf8'));
  validate(snapshot);
  const changed = structuredClone(snapshot);
  changed.sources.landing.files[0].bytes += 1;
  assert.throws(() => validate(changed), 'Content drift must be detected');
  const missing = structuredClone(snapshot);
  missing.sources.consumer.files.pop();
  assert.throws(() => validate(missing), 'Missing content must be detected');
console.log('Historical Web source provenance verified; no dependency on the retired application.');
