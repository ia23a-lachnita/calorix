import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import nodeFs, {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_FULL_COUNT,
  FULL_LEAF_PREFIX,
  MANIFEST_SCHEMA_VERSION,
  buildDerivedManifest,
  computeSourceFingerprint,
  fullLeafPath,
  readInventorySelection,
  replaceLeafAtomically,
  selectionSha256,
  subsetLeafPath,
  validateFullLeaf,
  validateReferenceLeaf,
  validateSubsetLeaf,
} from '../harness/manifest.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const STATE_IDS = [
  'loading', 'login', 'permission', 'scan_idle', 'scan_capturing', 'processing',
  'review', 'manual', 'today', 'today_empty', 'food', 'food_edit',
  'history_week', 'history_month', 'goals', 'goals_select', 'ai', 'ai_history', 'profile',
];
const ALL_SELECTION = STATE_IDS.flatMap((id) => [`${id}--dark`, `${id}--light`]).sort();
const DEFAULT_INDEXED_SCANLINES = deflateSync(Buffer.alloc((1080 + 1) * 2400));

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function tempRepo() {
  return mkdtempSync(join(tmpdir(), 'reference-manifest-'));
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0); body.copy(result, 4); result.writeUInt32BE(crc32(body), 8 + data.length);
  return result;
}

function png(width = 1080, height = 2400, payload = '') {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 3;
  const compressedScanlines = width === 1080 && height === 2400 ? DEFAULT_INDEXED_SCANLINES : deflateSync(Buffer.alloc((width + 1) * height));
  const colour = createHash('sha256').update(payload).digest()[0];
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', Buffer.from([colour, 0, 0])), chunk('IDAT', compressedScanlines), chunk('IEND', Buffer.alloc(0))]);
}

function leafManifest(selection, images, overrides = {}) {
  return buildDerivedManifest({
    sourceFingerprint: 'f'.repeat(64),
    gitCommit: 'deadbeef',
    gitDirty: false,
    dirtyPaths: [],
    inventoryHash: 'inventory',
    jsxTree: 'jsx',
    previewHash: 'preview',
    foodHash: 'food',
    fontDigests: { 'geist.woff2': 'font' },
    lockDigest: 'lock',
    rendererDigest: 'renderer',
    profileDigest: 'profile',
    settlementDigest: 'settlement',
    nodeVersion: '20.0.0',
    npmVersion: '10.0.0',
    playwrightVersion: '1.63.0',
    chromiumVersion: 'chromium',
    selection,
    readiness: { assets: true },
    images,
    ...overrides,
  });
}

function writeLeaf(leafDir, selection, { payload = 'image', manifest = true, sourceFingerprint: sourceOverride } = {}) {
  mkdirSync(leafDir, { recursive: true });
  const images = selection.map((key) => {
    const bytes = png(1080, 2400, `${payload}:${key}`);
    const path = `${key}.png`;
    writeFileSync(join(leafDir, path), bytes);
    return { path, sha256: digest(bytes), bytes: bytes.length, width: 1080, height: 2400, clockAdvanceMs: 0 };
  });
  const subsetMarker = `${join('.ui-diff', 'expected-derived', 'samsung-s20fe', 'subsets')}${join('', '')}`;
  const subsetIndex = leafDir.indexOf(subsetMarker);
  const sourceFingerprint = sourceOverride ?? (subsetIndex >= 0
    ? leafDir.slice(subsetIndex + subsetMarker.length + 1).split('/')[0]
    : (leafDir.match(/[a-f0-9]{64}/)?.[0] ?? 'f'.repeat(64)));
  const result = leafManifest(selection, images, { sourceFingerprint });
  if (manifest) writeFileSync(join(leafDir, 'manifest.json'), JSON.stringify(result));
  return result;
}

function createFingerprintFixture(root) {
  const app = join(root, 'docs/design-handoff/placeholder-app');
  const renderer = join(root, 'tool/ui_capture/reference_renderer');
  mkdirSync(join(app, 'src'), { recursive: true });
  mkdirSync(join(app, 'preview'), { recursive: true });
  mkdirSync(join(app, 'assets/food'), { recursive: true });
  mkdirSync(join(renderer, 'bin'), { recursive: true });
  mkdirSync(join(renderer, 'harness'), { recursive: true });
  mkdirSync(join(renderer, 'node_modules/react/umd'), { recursive: true });
  mkdirSync(join(renderer, 'node_modules/react-dom/umd'), { recursive: true });
  mkdirSync(join(renderer, 'node_modules/@babel/standalone'), { recursive: true });
  mkdirSync(join(renderer, 'node_modules/@fontsource/geist/files'), { recursive: true });
  mkdirSync(join(renderer, 'node_modules/@fontsource/geist-mono/files'), { recursive: true });
  writeFileSync(join(app, 'visual-state-inventory.json'), JSON.stringify({ states: STATE_IDS.map((id) => ({ id })) }));
  writeFileSync(join(app, 'src/cx-shell.jsx'), 'export const shell = "../assets/food/nested/apple.png";');
  writeFileSync(join(app, 'preview/screens.html'), '<main></main>');
  mkdirSync(join(app, 'assets/food/nested'), { recursive: true });
  writeFileSync(join(app, 'assets/food/nested/apple.png'), 'apple');
  writeFileSync(join(app, 'assets/food/unused.png'), 'unused');
  writeFileSync(join(renderer, 'package.json'), '{}');
  writeFileSync(join(renderer, 'package-lock.json'), '{}');
  writeFileSync(join(renderer, 'bin/render.mjs'), 'export {};');
  for (const name of ['profile.mjs', 'settlement.mjs', 'server.mjs', 'render.mjs', 'manifest.mjs']) {
    writeFileSync(join(renderer, 'harness', name), `// ${name}`);
  }
  writeFileSync(join(renderer, 'node_modules/react/umd/react.development.js'), 'react');
  writeFileSync(join(renderer, 'node_modules/react-dom/umd/react-dom.development.js'), 'react-dom');
  writeFileSync(join(renderer, 'node_modules/@babel/standalone/babel.min.js'), 'babel');
  for (const weight of [200, 400, 500, 600, 700]) writeFileSync(join(renderer, `node_modules/@fontsource/geist/files/geist-latin-${weight}-normal.woff2`), `geist-${weight}`);
  for (const weight of [400, 500, 600]) writeFileSync(join(renderer, `node_modules/@fontsource/geist-mono/files/geist-mono-latin-${weight}-normal.woff2`), `mono-${weight}`);
  writeFileSync(join(renderer, 'node_modules/@fontsource/geist/files/geist-latin-900-normal.woff2'), 'unused-font');
}

async function withFsPatch(patch, action) {
  const originals = Object.fromEntries(Object.keys(patch).map((key) => [key, nodeFs[key]]));
  Object.assign(nodeFs, patch);
  try { return await action(); } finally { Object.assign(nodeFs, originals); }
}

function snapshotTree(root) {
  const result = {};
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) Object.assign(result, Object.fromEntries(Object.entries(snapshotTree(path)).map(([key, value]) => [`${entry.name}/${key}`, value])));
    else result[entry.name] = readFileSync(path).toString('base64');
  }
  return result;
}

test('manifest is alphabetically sorted, deterministic, and timestamp-free', () => {
  const input = leafManifest(['today--light', 'today--dark'], [
    { path: 'z.png', sha256: 'z', bytes: 1, width: 1080, height: 2400, clockAdvanceMs: 0 },
    { path: 'a.png', sha256: 'a', bytes: 1, width: 1080, height: 2400, clockAdvanceMs: 0 },
  ], { dirtyPaths: ['z', 'a'], fontDigests: { z: 'z', a: 'a' } });
  assert.equal(JSON.stringify(input), JSON.stringify(leafManifest(['today--light', 'today--dark'], [
    { path: 'z.png', sha256: 'z', bytes: 1, width: 1080, height: 2400, clockAdvanceMs: 0 },
    { path: 'a.png', sha256: 'a', bytes: 1, width: 1080, height: 2400, clockAdvanceMs: 0 },
  ], { dirtyPaths: ['z', 'a'], fontDigests: { z: 'z', a: 'a' } })));
  assert.deepEqual(Object.keys(input), [...Object.keys(input)].sort());
  assert.deepEqual(Object.keys(input), [
    'chromiumVersion', 'dirtyPaths', 'fontDigests', 'foodHash', 'gitCommit', 'gitDirty',
    'images', 'inventoryHash', 'jsxTree', 'lockDigest', 'nodeVersion', 'npmVersion',
    'playwrightVersion', 'previewHash', 'profile', 'profileDigest', 'readiness',
    'rendererDigest', 'schemaVersion', 'selection', 'settlementDigest', 'sourceFingerprint',
  ]);
  assert.deepEqual(input.images.map((image) => image.path), ['a.png', 'z.png']);
  assert.deepEqual(Object.keys(input.images[0]), ['bytes', 'clockAdvanceMs', 'height', 'path', 'sha256', 'width']);
  assert.deepEqual(input.selection, ['today--dark', 'today--light']);
  assert.deepEqual(input.dirtyPaths, ['a', 'z']);
  assert.deepEqual(Object.keys(input.fontDigests), ['a', 'z']);
  assert.match(JSON.stringify(input), /"schemaVersion":1/);
  assert.doesNotMatch(JSON.stringify(input), /20\d\d-\d\d-\d\dT|timestamp|createdAt|updatedAt/);
});

test('selection helpers use separate full and subset leaves with a sorted deduplicated hash', () => {
  const full = fullLeafPath('/repo', 'fingerprint');
  const subset = subsetLeafPath('/repo', 'fingerprint', ['today--dark', 'ai--light', 'today--dark']);
  assert.equal(MANIFEST_SCHEMA_VERSION, 1);
  assert.equal(FULL_LEAF_PREFIX, '.ui-diff/expected-derived/samsung-s20fe');
  assert.equal(EXPECTED_FULL_COUNT, 38);
  assert.equal(selectionSha256(['ai--light', 'today--dark']), selectionSha256(['today--dark', 'ai--light', 'today--dark']));
  assert.equal(full, '/repo/.ui-diff/expected-derived/samsung-s20fe/fingerprint');
  assert.equal(subset, `/repo/.ui-diff/expected-derived/samsung-s20fe/subsets/fingerprint/${selectionSha256(['ai--light', 'today--dark'])}`);
  assert.ok(!subset.startsWith(`${full}/`), 'subset is never inside a full leaf');
});

test('inventory selection has exactly 19 IDs and 38 validated keys', async () => {
  const all = await readInventorySelection(REPO_ROOT, 'all');
  assert.deepEqual(all, ALL_SELECTION);
  assert.equal(all.length, 38);
  assert.deepEqual(await readInventorySelection(REPO_ROOT, ['today--light', 'today--dark', 'today--dark']), ['today--dark', 'today--light']);
  await assert.rejects(readInventorySelection(REPO_ROOT, ['unknown--dark']), /RENDER_INVALID_INPUT.*unknown state ID/);
  await assert.rejects(readInventorySelection(REPO_ROOT, ['today--nightly']), /RENDER_INVALID_INPUT.*invalid mode/);
  await assert.rejects(readInventorySelection(REPO_ROOT, ['today']), /RENDER_INVALID_INPUT.*malformed selection key/);
});

test('inventory selection rejects an explicit empty subset', async () => {
  await assert.rejects(readInventorySelection(REPO_ROOT, []), /RENDER_INVALID_INPUT.*empty selection/);
});

test('fingerprint hashes only actual allowlisted consumed bytes in sorted order', async () => {
  const root = tempRepo();
  try {
    createFingerprintFixture(root);
    const first = await computeSourceFingerprint(root);
    const second = await computeSourceFingerprint(root);
    assert.equal(first.fingerprint, second.fingerprint);
    assert.deepEqual(first.files.map((file) => file.path), [...first.files.map((file) => file.path)].sort());
    assert.ok(first.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256) && Number.isInteger(file.bytes)));
    for (const key of ['inventoryHash', 'jsxTree', 'previewHash', 'foodHash', 'fontDigests', 'lockDigest', 'rendererDigest', 'profileDigest', 'settlementDigest']) assert.ok(first[key]);
    writeFileSync(join(root, 'docs/design-handoff/placeholder-app/src/cx-shell.jsx'), 'export const shell = false;');
    assert.notEqual((await computeSourceFingerprint(root)).fingerprint, first.fingerprint, 'actual consumed source bytes change the fingerprint');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fingerprint rejects missing required and explicitly unallowlisted inputs', async () => {
  const root = tempRepo();
  try {
    await assert.rejects(computeSourceFingerprint(root), /RENDER_INVALID_INPUT: missing allowlisted input/);
    createFingerprintFixture(root);
    await assert.rejects(computeSourceFingerprint(root, { allowlist: ['not-allowed.txt'] }), /RENDER_INVALID_INPUT: unallowlisted input/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('full and subset leaf validators require exact manifest-bound real 1080x2400 PNGs', async () => {
  const root = tempRepo();
  try {
    const full = fullLeafPath(root, 'f'.repeat(64));
    const fullManifest = writeLeaf(full, ALL_SELECTION);
    await validateFullLeaf(full, fullManifest);
    const subset = subsetLeafPath(root, 'f'.repeat(64), ['today--dark']);
    const subsetManifest = writeLeaf(subset, ['today--dark']);
    await validateSubsetLeaf(subset, subsetManifest, ['today--dark']);
    writeFileSync(join(full, 'extra.txt'), 'no');
    await assert.rejects(validateFullLeaf(full, fullManifest), /RENDER_LEAF_EXTRA.*manifest image names/);
    rmSync(join(full, 'extra.txt'));
    writeFileSync(join(full, 'today--dark.png'), png(360, 800, 'image:today--dark'));
    await assert.rejects(validateFullLeaf(full, fullManifest), /RENDER_LEAF_EXTRA.*byte size mismatch|SHA256 mismatch|PNG dimensions/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('full leaf rejects wrong count, nested entries, and manifest name mismatch', async () => {
  const root = tempRepo();
  try {
    const full = fullLeafPath(root, 'f'.repeat(64));
    const manifest = writeLeaf(full, ALL_SELECTION);
    rmSync(join(full, 'today--dark.png'));
    await assert.rejects(validateFullLeaf(full, manifest), /RENDER_LEAF_EXTRA: expected 38 PNGs, found 37/);
    writeLeaf(full, ['today--dark'], { payload: 'replacement', manifest: false });
    mkdirSync(join(full, 'subsets'));
    await assert.rejects(validateFullLeaf(full, manifest), /RENDER_LEAF_EXTRA.*subdirectory/);
    rmSync(join(full, 'subsets'), { recursive: true });
    writeFileSync(join(full, 'today--dark.png'), png());
    await assert.rejects(validateFullLeaf(full, { ...manifest, images: manifest.images.slice(1) }), /RENDER_LEAF_EXTRA.*supplied manifest differs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('leaf validation rejects traversal, every symlink component, ancestor escape, and injected mount escape', async () => {
  const root = tempRepo();
  try {
    const full = fullLeafPath(root, 'f'.repeat(64));
    const manifest = writeLeaf(full, ALL_SELECTION);
    await assert.rejects(validateFullLeaf(`${full}/../${'f'.repeat(64)}`, manifest), /RENDER_LEAF_EXTRA.*traversal/);
    const linkRoot = join(root, '.ui-diff/expected-derived/samsung-s20fe', 'b'.repeat(64));
    symlinkSync(full, linkRoot, 'dir');
    await assert.rejects(validateFullLeaf(linkRoot, manifest), /RENDER_LEAF_EXTRA.*symlink/);
    const subsets = join(root, '.ui-diff/expected-derived/samsung-s20fe/subsets');
    symlinkSync(tmpdir(), subsets, 'dir');
    const escaped = join(subsets, 'f'.repeat(64), 'c'.repeat(64));
    await assert.rejects(validateSubsetLeaf(escaped, leafManifest(['today--dark'], []), ['today--dark']), /RENDER_LEAF_EXTRA.*symlink|containment/);
    const mounted = fullLeafPath(root, 'e'.repeat(64));
    const mountedManifest = writeLeaf(mounted, ALL_SELECTION);
    const originalLstat = nodeFs.lstatSync;
    await withFsPatch({ lstatSync(path) { const stat = originalLstat(path); return path === mounted ? { ...stat, dev: stat.dev + 1, isDirectory: () => stat.isDirectory(), isFile: () => stat.isFile(), isSymbolicLink: () => stat.isSymbolicLink() } : stat; } }, async () => assert.rejects(validateFullLeaf(mounted, mountedManifest), /RENDER_LEAF_EXTRA.*device\/mount escape/));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('default no-replace preserves an existing leaf and atomic replacement swaps valid full leaves', async () => {
  const root = tempRepo();
  try {
    const target = fullLeafPath(root, 'f'.repeat(64));
    const staged = join(dirname(target), '.staged');
    const original = writeLeaf(target, ALL_SELECTION, { payload: 'original' });
    writeLeaf(staged, ALL_SELECTION, { payload: 'staged' });
    await assert.rejects(replaceLeafAtomically(target, staged), /RENDER_LEAF_EXTRA.*already exists/);
    assert.equal(readFileSync(join(target, 'manifest.json'), 'utf8'), JSON.stringify(original));
    await replaceLeafAtomically(target, staged, { replace: true });
    assert.notEqual(readFileSync(join(target, 'manifest.json'), 'utf8'), JSON.stringify(original));
    assert.ok(!existsSync(staged));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('atomic replacement swaps a validated subset leaf without nesting it in the full leaf', async () => {
  const root = tempRepo();
  try {
    const target = subsetLeafPath(root, 'f'.repeat(64), ['today--dark']);
    const staged = join(dirname(target), '.staged');
    const original = writeLeaf(target, ['today--dark'], { payload: 'original-subset' });
    writeLeaf(staged, ['today--dark'], { payload: 'staged-subset' });
    await replaceLeafAtomically(target, staged, { replace: true });
    assert.notEqual(readFileSync(join(target, 'manifest.json'), 'utf8'), JSON.stringify(original));
    await validateSubsetLeaf(target, JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8')), ['today--dark']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('injected final rename failure restores original leaf byte-for-byte', async () => {
  const root = tempRepo();
  try {
    const target = fullLeafPath(root, 'f'.repeat(64));
    const staged = join(dirname(target), '.staged');
    writeLeaf(target, ALL_SELECTION, { payload: 'original' });
    writeLeaf(staged, ALL_SELECTION, { payload: 'staged' });
    const original = Object.fromEntries(readdirSync(target).sort().map((name) => [name, readFileSync(join(target, name)).toString('base64')]));
    let failed = false;
    await withFsPatch({ renameSync(from, to) { if (!failed && to === target && from.endsWith('.tmp')) { failed = true; throw new Error('injected final rename failure'); } renameSync(from, to); } }, async () => assert.rejects(replaceLeafAtomically(target, staged, { replace: true }), /injected final rename failure/));
    const restored = Object.fromEntries(readdirSync(target).sort().map((name) => [name, readFileSync(join(target, name)).toString('base64')]));
    assert.deepEqual(restored, original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validateReferenceLeaf recomputes the fingerprint and only reads the fixed existing leaf', async () => {
  const root = tempRepo();
  try {
    createFingerprintFixture(root);
    const fingerprint = await computeSourceFingerprint(root);
    const leaf = fullLeafPath(root, fingerprint.fingerprint);
    const manifest = writeLeaf(leaf, ALL_SELECTION, { payload: 'reference' });
    writeFileSync(join(leaf, 'manifest.json'), JSON.stringify({ ...manifest, sourceFingerprint: fingerprint.fingerprint }));
    const before = snapshotTree(root);
    const result = await validateReferenceLeaf({ repoRoot: root });
    assert.equal(result.valid, true);
    assert.equal(result.leafPath, leaf);
    assert.deepEqual(snapshotTree(root), before, 'validation creates, rewrites, or renames no tree path');
    const source = readFileSync(new URL('../harness/manifest.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s+['"]playwright['"]|require\(['"]playwright['"]\)|\.launch\s*\(/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validators bind exact fixed paths to the on-disk manifest schema and identity', async () => {
  const root = tempRepo();
  try {
    const fp = 'a'.repeat(64); const full = fullLeafPath(root, fp); const manifest = writeLeaf(full, ALL_SELECTION);
    const onDisk = JSON.parse(readFileSync(join(full, 'manifest.json'), 'utf8'));
    onDisk.host = 'forbidden'; writeFileSync(join(full, 'manifest.json'), JSON.stringify(onDisk));
    await assert.rejects(validateFullLeaf(full, onDisk), /invalid manifest schema|not canonical/);
    await assert.rejects(validateFullLeaf(join(root, FULL_LEAF_PREFIX, 'subsets'), onDisk), /exact fixed leaf/);
    delete onDisk.host; onDisk.sourceFingerprint = 'b'.repeat(64); writeFileSync(join(full, 'manifest.json'), JSON.stringify(onDisk));
    await assert.rejects(validateFullLeaf(full, onDisk), /leaf identity/);
    const subset = subsetLeafPath(root, fp, ['today--dark']); const subsetManifest = writeLeaf(subset, ['today--dark']);
    const wrong = join(dirname(subset), 'c'.repeat(64)); renameSync(subset, wrong);
    await assert.rejects(validateSubsetLeaf(wrong, subsetManifest, ['today--dark']), /leaf identity/);
    writeFileSync(join(full, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(validateFullLeaf(full, { ...manifest, readiness: { other: true } }), /supplied manifest differs/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('fingerprint includes only referenced nested food and exact served font weights', async () => {
  const root = tempRepo();
  try {
    createFingerprintFixture(root); const initial = await computeSourceFingerprint(root);
    assert.ok(initial.files.some((file) => file.path.endsWith('/nested/apple.png')));
    assert.ok(!initial.files.some((file) => file.path.endsWith('/unused.png') || file.path.includes('900-normal')));
    writeFileSync(join(root, 'docs/design-handoff/placeholder-app/assets/food/unused.png'), 'changed');
    writeFileSync(join(root, 'tool/ui_capture/reference_renderer/node_modules/@fontsource/geist/files/geist-latin-900-normal.woff2'), 'changed');
    assert.equal((await computeSourceFingerprint(root)).fingerprint, initial.fingerprint);
    rmSync(join(root, 'docs/design-handoff/placeholder-app/assets/food/nested/apple.png'));
    await assert.rejects(computeSourceFingerprint(root), /missing allowlisted input/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('fingerprint and jsxTree change for non-reference JSX bytes', async () => {
  const root = tempRepo();
  try {
    createFingerprintFixture(root);
    const before = await computeSourceFingerprint(root);
    writeFileSync(join(root, 'docs/design-handoff/placeholder-app/src/cx-shell.jsx'), 'export const shell = "../assets/food/nested/apple.png"; export const visualOnly = true;');
    const after = await computeSourceFingerprint(root);
    assert.notEqual(after.fingerprint, before.fingerprint);
    assert.notEqual(after.jsxTree, before.jsxTree);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('PNG validation rejects malformed framing, CRC, and terminal chunks', async () => {
  const root = tempRepo();
  try {
    const full = fullLeafPath(root, 'd'.repeat(64)); const manifest = writeLeaf(full, ALL_SELECTION); const image = join(full, 'today--dark.png');
    const good = readFileSync(image); const badCrc = Buffer.from(good); badCrc[badCrc.length - 1] ^= 1; writeFileSync(image, badCrc);
    const corruptManifest = JSON.parse(JSON.stringify(manifest)); const corruptImage = corruptManifest.images.find((entry) => entry.path === 'today--dark.png'); corruptImage.sha256 = digest(badCrc); corruptImage.bytes = badCrc.length; writeFileSync(join(full, 'manifest.json'), JSON.stringify(corruptManifest));
    await assert.rejects(validateFullLeaf(full, corruptManifest), /CRC mismatch/);
    const truncated = good.subarray(0, good.length - 12); writeFileSync(image, truncated); corruptImage.sha256 = digest(truncated); corruptImage.bytes = truncated.length; writeFileSync(join(full, 'manifest.json'), JSON.stringify(corruptManifest));
    await assert.rejects(validateFullLeaf(full, corruptManifest), /truncated|incomplete/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('nested manifest objects canonicalize deterministically', () => {
  const images = [{ path: 'today--dark.png', sha256: 'a'.repeat(64), bytes: 1, width: 1080, height: 2400, clockAdvanceMs: 0 }];
  const a = leafManifest(['today--dark'], images, { readiness: { z: { beta: 2, alpha: [ { y: 2, x: 1 } ] }, a: true } });
  const b = leafManifest(['today--dark'], images, { readiness: { a: true, z: { alpha: [ { x: 1, y: 2 } ], beta: 2 } } });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('post-install validation rolls back while backup-cleanup failure stays committed', async () => {
  for (const failure of ['post-install', 'backup-cleanup']) {
    const root = tempRepo();
    try {
      const target = fullLeafPath(root, 'e'.repeat(64)); const staged = join(dirname(target), '.staged'); writeLeaf(target, ALL_SELECTION, { payload: 'original' }); writeLeaf(staged, ALL_SELECTION, { payload: 'replacement', sourceFingerprint: 'e'.repeat(64) });
      const original = snapshotTree(target); const replacement = snapshotTree(staged); let installed = false;
      await withFsPatch({
        renameSync(from, to) { renameSync(from, to); if (to === target && from.endsWith('.tmp')) installed = true; },
        readFileSync(path, ...args) { if (failure === 'post-install' && installed && path === join(target, 'manifest.json')) throw new Error('post-install validation failure'); return readFileSync(path, ...args); },
        rmSync(path, ...args) { if (failure === 'backup-cleanup' && path.endsWith('.backup')) throw new Error('backup cleanup failure'); return rmSync(path, ...args); },
      }, async () => assert.rejects(replaceLeafAtomically(target, staged, { replace: true }), new RegExp(failure === 'post-install' ? 'post-install validation failure' : 'backup cleanup failure')));
      if (failure === 'post-install') {
        assert.deepEqual(snapshotTree(target), original); assert.deepEqual(snapshotTree(staged), replacement);
        assert.ok(!existsSync(join(dirname(target), `.${'e'.repeat(64)}.tmp`)));
        assert.ok(!existsSync(join(dirname(target), `.${'e'.repeat(64)}.backup`)));
      } else {
        assert.deepEqual(snapshotTree(target), replacement);
        assert.deepEqual(snapshotTree(join(dirname(target), `.${'e'.repeat(64)}.backup`)), original);
        assert.ok(!existsSync(staged));
        assert.ok(!existsSync(join(dirname(target), `.${'e'.repeat(64)}.tmp`)));
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('private filesystem seam rejects realpath and device escapes at transition paths', async () => {
  const root = tempRepo();
  try {
    const target = fullLeafPath(root, '9'.repeat(64)); const staged = join(dirname(target), '.staged'); const manifest = writeLeaf(target, ALL_SELECTION); const replacement = writeLeaf(staged, ALL_SELECTION, { sourceFingerprint: '9'.repeat(64) }); const original = snapshotTree(target); const stagedBytes = snapshotTree(staged);
    const originalRealpath = nodeFs.realpathSync;
    await withFsPatch({ realpathSync(path) { return path === target ? join(tmpdir(), 'outside') : originalRealpath(path); } }, async () => assert.rejects(validateFullLeaf(target, manifest), /nearest existing ancestor escapes/));
    const originalLstat = nodeFs.lstatSync;
    await withFsPatch({ lstatSync(path) { const stat = originalLstat(path); return path.endsWith('.tmp') ? { ...stat, dev: stat.dev + 1, isFile: () => stat.isFile(), isDirectory: () => stat.isDirectory(), isSymbolicLink: () => stat.isSymbolicLink() } : stat; } }, async () => assert.rejects(replaceLeafAtomically(target, staged, { replace: true }), /device\/mount escape/));
    assert.deepEqual(snapshotTree(target), original); assert.deepEqual(snapshotTree(staged), stagedBytes);
    assert.ok(!existsSync(join(dirname(target), `.${'9'.repeat(64)}.tmp`))); assert.ok(!existsSync(join(dirname(target), `.${'9'.repeat(64)}.backup`)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('staged preflight rejects identity and content failures before any rename', async () => {
  for (const kind of ['full-source', 'subset-hash', 'content']) {
    const root = tempRepo();
    try {
      const fp = '7'.repeat(64); const target = kind === 'subset-hash' ? subsetLeafPath(root, fp, ['today--dark']) : fullLeafPath(root, fp); const selection = kind === 'subset-hash' ? ['today--dark'] : ALL_SELECTION; const staged = join(dirname(target), '.staged');
      writeLeaf(target, selection); writeLeaf(staged, selection, { sourceFingerprint: kind === 'full-source' ? '8'.repeat(64) : fp });
      if (kind === 'subset-hash') { const manifest = JSON.parse(readFileSync(join(staged, 'manifest.json'), 'utf8')); manifest.selection = ['today--light']; writeFileSync(join(staged, 'manifest.json'), JSON.stringify(manifest)); }
      if (kind === 'content') writeFileSync(join(staged, `${selection[0]}.png`), Buffer.from('corrupt'));
      const targetBefore = snapshotTree(target); const stagedBefore = snapshotTree(staged); let renames = 0;
      await withFsPatch({ renameSync(from, to) { renames += 1; renameSync(from, to); } }, async () => assert.rejects(replaceLeafAtomically(target, staged, { replace: true }), /staged leaf identity|SHA256 mismatch|byte size mismatch/));
      assert.equal(renames, 0); assert.deepEqual(snapshotTree(target), targetBefore); assert.deepEqual(snapshotTree(staged), stagedBefore);
      assert.ok(!existsSync(join(dirname(target), `.${basename(target)}.tmp`))); assert.ok(!existsSync(join(dirname(target), `.${basename(target)}.backup`)));
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('optional allowlist accepts only resolved consumed inputs', async () => {
  const root = tempRepo();
  try {
    createFingerprintFixture(root);
    const base = 'tool/ui_capture/reference_renderer';
    await computeSourceFingerprint(root, { allowlist: ['docs/design-handoff/placeholder-app/assets/food/nested/apple.png', `${base}/node_modules/@fontsource/geist/files/geist-latin-200-normal.woff2`, 'docs/design-handoff/placeholder-app/src/cx-shell.jsx'] });
    await assert.rejects(computeSourceFingerprint(root, { allowlist: ['docs/design-handoff/placeholder-app/assets/food/unused.png'] }), /RENDER_INVALID_INPUT/);
    await assert.rejects(computeSourceFingerprint(root, { allowlist: [`${base}/node_modules/@fontsource/geist/files/geist-latin-900-normal.woff2`] }), /RENDER_INVALID_INPUT/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('canonical disk manifest rejects whitespace, reordered nested keys, image order, and dirty path order', async () => {
  const root = tempRepo();
  try {
    const full = fullLeafPath(root, '6'.repeat(64)); const manifest = writeLeaf(full, ALL_SELECTION);
    const disk = () => JSON.parse(readFileSync(join(full, 'manifest.json'), 'utf8'));
    for (const mutate of [
      (value) => JSON.stringify(value, null, 2),
      (value) => JSON.stringify({ ...value, readiness: { z: value.readiness.assets, a: true } }),
      (value) => JSON.stringify({ ...value, images: [...value.images].reverse() }),
      (value) => JSON.stringify({ ...value, dirtyPaths: ['z', 'a', 'z'] }),
    ]) {
      writeFileSync(join(full, 'manifest.json'), mutate(disk()));
      await assert.rejects(validateFullLeaf(full, disk()), /canonical|manifest image names|manifest selection/);
      writeFileSync(join(full, 'manifest.json'), JSON.stringify(manifest));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('backup safety and backup validation failures roll back exact target and staged siblings', async () => {
  for (const failure of ['safety', 'content']) {
    const root = tempRepo();
    try {
      const target = fullLeafPath(root, '5'.repeat(64)); const staged = join(dirname(target), '.staged'); writeLeaf(target, ALL_SELECTION); writeLeaf(staged, ALL_SELECTION, { payload: 'replacement', sourceFingerprint: '5'.repeat(64) });
      const original = snapshotTree(target); const replacement = snapshotTree(staged); const originalLstat = nodeFs.lstatSync;
      await withFsPatch({
        lstatSync(path) { const stat = originalLstat(path); return failure === 'safety' && path.endsWith('.backup') ? { ...stat, dev: stat.dev + 1, isFile: () => stat.isFile(), isDirectory: () => stat.isDirectory(), isSymbolicLink: () => stat.isSymbolicLink() } : stat; },
        readFileSync(path, ...args) { if (failure === 'content' && path.endsWith('.backup/manifest.json')) throw new Error('backup content validation failure'); return readFileSync(path, ...args); },
      }, async () => assert.rejects(replaceLeafAtomically(target, staged, { replace: true }), /device\/mount escape|backup content validation failure/));
      assert.deepEqual(snapshotTree(target), original); assert.deepEqual(snapshotTree(staged), replacement); assert.ok(!existsSync(join(dirname(target), `.${'5'.repeat(64)}.tmp`))); assert.ok(!existsSync(join(dirname(target), `.${'5'.repeat(64)}.backup`)));
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
