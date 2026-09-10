import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/operations/v3-web-source-inventory.json');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sort = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const allowed = /\.(?:astro|ts|tsx|js|mjs|css|json|md|html|svg|png|webp|ico|txt|xml|woff2)$/;
const prohibited = /(?:^|\/)(?:\.env[^/]*|\.dev\.vars[^/]*|node_modules|\.git|\.vercel|documentacion)(?:\/|$)|(?:firebase-adminsdk|service-account)/i;
const publicPath = (name) => !isAbsolute(name) && !name.includes('\\') &&
  !name.split('/').some((part) => part === '..' || part === '.' || part === '') && !prohibited.test(name) && allowed.test(name);

function files(directory, prefix) {
  assert(!lstatSync(directory).isSymbolicLink(), 'Source symlinks are not allowed');
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}/${entry.name}`;
    assert(!entry.isSymbolicLink(), `Source symlink: ${name}`);
    if (prohibited.test(name)) return [];
    if (entry.isDirectory()) return files(resolve(directory, entry.name), name);
    if (!entry.isFile() || !publicPath(name)) return [];
    const bytes = readFileSync(resolve(directory, entry.name));
    return [{ path: name, bytes: bytes.length, sha256: sha(bytes) }];
  }).sort((a, b) => sort(a.path, b.path));
}

function source(directory, folders, configs) {
  const entries = folders.flatMap((folder) => files(resolve(directory, folder), folder));
  for (const path of configs) {
    assert(publicPath(path));
    assert(!lstatSync(resolve(directory, path)).isSymbolicLink());
    const bytes = readFileSync(resolve(directory, path));
    entries.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  }
  entries.sort((a, b) => sort(a.path, b.path));
  return {
    git_head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim(),
    // Deliberately records only public source paths, never env files or private documents.
    local_changes: execFileSync('git', ['status', '--short', '--', ...folders, ...configs], { cwd: directory, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean),
    files: entries,
    content_sha256: sha(JSON.stringify(entries)),
  };
}

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
const args = process.argv.slice(2);
const capture = args.includes('--capture');
const sourceArg = args.indexOf('--landing-root');
assert(args.every((arg, index) => arg === '--capture' || arg === '--landing-root' || index === sourceArg + 1 && sourceArg >= 0), 'Unknown argument');
if (capture) {
  assert(sourceArg >= 0 && args[sourceArg + 1], 'Explicit --landing-root is required');
  assert(!existsSync(output), 'Inventory already exists; review it before replacing historical evidence');
  const landingRoot = resolve(args[sourceArg + 1]);
  assert(readFileSync(resolve(landingRoot, 'package.json'), 'utf8').includes('gatopago-landing'));
  const sources = {
    landing: source(landingRoot, ['src', 'public'], ['package.json', 'astro.config.mjs']),
    consumer: source(resolve(root, 'client'), ['src', 'public'], ['package.json', 'vite.config.ts', 'index.html']),
  };
  const screenshots = ['es-desktop', 'es-mobile', 'en-desktop', 'en-mobile'].map((name) => {
    const path = `output/playwright/v3-landing-baseline/${name}.png`;
    const bytes = readFileSync(resolve(root, path));
    return { path, viewport: name.endsWith('mobile') ? [390, 844] : [1440, 1000], bytes: bytes.length, sha256: sha(bytes) };
  });
  const snapshot = { schema_version: 1, captured_at: new Date().toISOString(), sources, screenshots, content_sha256: sha(JSON.stringify({ sources, screenshots })) };
  validate(snapshot);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
} else {
  assert.equal(sourceArg, -1, '--landing-root is only used when capturing the inventory');
  const snapshot = JSON.parse(readFileSync(output, 'utf8'));
  validate(snapshot);
  const changed = structuredClone(snapshot);
  changed.sources.landing.files[0].bytes += 1;
  assert.throws(() => validate(changed), 'Content drift must be detected');
  const missing = structuredClone(snapshot);
  missing.sources.consumer.files.pop();
  assert.throws(() => validate(missing), 'Missing content must be detected');
}
console.log('V3 web source inventory is structurally intact. It records historical source, not migration parity or deployed readiness.');
