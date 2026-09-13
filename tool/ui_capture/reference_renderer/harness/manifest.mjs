import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const MANIFEST_SCHEMA_VERSION = 1;
export const FULL_LEAF_PREFIX = '.ui-diff/expected-derived/samsung-s20fe';
export const EXPECTED_FULL_COUNT = 38;

const IDS = Object.freeze(['loading', 'login', 'permission', 'scan_idle', 'scan_capturing', 'processing', 'review', 'manual', 'today', 'today_empty', 'food', 'food_edit', 'history_week', 'history_month', 'goals', 'goals_select', 'ai', 'ai_history', 'profile']);
const MODES = Object.freeze(['dark', 'light']);
const ROOT = 'tool/ui_capture/reference_renderer';
const REQUIRED = Object.freeze([
  'docs/design-handoff/placeholder-app/visual-state-inventory.json',
  'docs/design-handoff/placeholder-app/preview/screens.html',
  `${ROOT}/package.json`, `${ROOT}/package-lock.json`, `${ROOT}/bin/render.mjs`,
  `${ROOT}/harness/profile.mjs`, `${ROOT}/harness/settlement.mjs`, `${ROOT}/harness/server.mjs`, `${ROOT}/harness/render.mjs`, `${ROOT}/harness/manifest.mjs`,
  `${ROOT}/node_modules/react/umd/react.development.js`, `${ROOT}/node_modules/react-dom/umd/react-dom.development.js`, `${ROOT}/node_modules/@babel/standalone/babel.min.js`,
]);
const GEIST_WEIGHTS = Object.freeze([200, 400, 500, 600, 700]);
const MONO_WEIGHTS = Object.freeze([400, 500, 600]);
const PROFILE = Object.freeze({ logicalWidth: 360, logicalHeight: 800, physicalWidth: 1080, physicalHeight: 2400, deviceScaleFactor: 3, locale: 'en-US', timezone: 'UTC', flags: ['--disable-lcd-text', '--font-render-hinting=none', '--disable-threaded-animation', '--force-color-profile=srgb', '--hide-scrollbars'] });
const ROOT_KEYS = Object.freeze(['chromiumVersion', 'dirtyPaths', 'fontDigests', 'foodHash', 'gitCommit', 'gitDirty', 'images', 'inventoryHash', 'jsxTree', 'lockDigest', 'nodeVersion', 'npmVersion', 'playwrightVersion', 'previewHash', 'profile', 'profileDigest', 'readiness', 'rendererDigest', 'schemaVersion', 'selection', 'settlementDigest', 'sourceFingerprint']);
const PROFILE_KEYS = Object.freeze(['deviceScaleFactor', 'flags', 'locale', 'logicalHeight', 'logicalWidth', 'physicalHeight', 'physicalWidth', 'timezone']);
const IMAGE_KEYS = Object.freeze(['bytes', 'clockAdvanceMs', 'height', 'path', 'sha256', 'width']);

function invalid(message) { throw new Error(`RENDER_INVALID_INPUT: ${message}`); }
function leafError(message) { throw new Error(`RENDER_LEAF_EXTRA: ${message}`); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function sortedUnique(values) { if (!Array.isArray(values)) invalid('selection must be an array'); return [...new Set(values)].sort(); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function sameKeys(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys); }
function allSelection() { return IDS.flatMap((id) => MODES.map((mode) => `${id}--${mode}`)).sort(); }
function imageNames(selection) { return sortedUnique(selection).map((key) => `${key}.png`).sort(); }
function isFingerprint(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function digestRecords(records) { return sha(records.map((record) => `${record.path}\0${record.sha256}\0${record.bytes}\n`).join('')); }
function readRequired(root, path) { const full = join(root, path); if (!fs.existsSync(full) || !fs.lstatSync(full).isFile()) invalid(`missing allowlisted input '${path}'`); return path; }
function walk(root, relative) {
  const directory = join(root, relative);
  if (!fs.existsSync(directory)) invalid(`missing allowlisted input '${relative}'`);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) return walk(root, child);
    if (entry.isFile()) return [child];
    invalid(`unallowlisted input '${child}'`);
  });
}
function matchingPattern(path, pattern) {
  const sentinel = '\u0000DOUBLESTAR\u0000';
  const escaped = pattern.replace(/\*\*/g, sentinel).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(new RegExp(sentinel, 'g'), '.*');
  return new RegExp(`^${escaped}$`).test(path);
}
function allowed(path) {
  return REQUIRED.includes(path) || matchingPattern(path, 'docs/design-handoff/placeholder-app/src/cx-*.jsx') || matchingPattern(path, 'docs/design-handoff/placeholder-app/assets/food/**') || matchingPattern(path, `${ROOT}/node_modules/@fontsource/geist/files/*.woff2`) || matchingPattern(path, `${ROOT}/node_modules/@fontsource/geist-mono/files/*.woff2`);
}
function referencedFood(root, sourcePaths) {
  const refs = new Set();
  for (const path of sourcePaths) {
    const text = fs.readFileSync(join(root, path), 'utf8');
    for (const match of text.matchAll(/assets\/food\/([A-Za-z0-9._/-]+)/g)) {
      const name = match[1];
      if (name.includes('..') || name.startsWith('/')) invalid(`unallowlisted input '${name}'`);
      refs.add(`docs/design-handoff/placeholder-app/assets/food/${name}`);
    }
  }
  for (const path of refs) readRequired(root, path);
  return [...refs].sort();
}
function fontPaths() {
  return [
    ...GEIST_WEIGHTS.map((weight) => `${ROOT}/node_modules/@fontsource/geist/files/geist-latin-${weight}-normal.woff2`),
    ...MONO_WEIGHTS.map((weight) => `${ROOT}/node_modules/@fontsource/geist-mono/files/geist-mono-latin-${weight}-normal.woff2`),
  ];
}

export function selectionSha256(selection) { return sha(sortedUnique(Array.isArray(selection) ? selection : [selection]).join('\n')); }
export function fullLeafPath(repoRoot, sourceFingerprint) { return join(repoRoot, FULL_LEAF_PREFIX, sourceFingerprint); }
export function subsetLeafPath(repoRoot, sourceFingerprint, selection) { return join(repoRoot, FULL_LEAF_PREFIX, 'subsets', sourceFingerprint, selectionSha256(selection)); }
export async function sha256File(absolutePath) { return sha(fs.readFileSync(absolutePath)); }

export async function computeSourceFingerprint(repoRoot, { allowlist, readBytes } = {}) {
  const root = resolve(repoRoot);
  const jsx = walk(root, 'docs/design-handoff/placeholder-app/src').filter((path) => matchingPattern(path, 'docs/design-handoff/placeholder-app/src/cx-*.jsx'));
  if (jsx.length === 0) invalid('missing allowlisted input cx-*.jsx');
  const sources = ['docs/design-handoff/placeholder-app/visual-state-inventory.json', 'docs/design-handoff/placeholder-app/preview/screens.html', ...jsx];
  const paths = [...REQUIRED.map((path) => readRequired(root, path)), ...jsx, ...fontPaths().map((path) => readRequired(root, path)), ...referencedFood(root, sources)].sort();
  if (allowlist !== undefined && (!Array.isArray(allowlist) || allowlist.some((path) => !paths.includes(path)))) invalid('unallowlisted input');
  if (!paths.every(allowed)) invalid('unallowlisted input');
  const files = paths.map((path) => { const bytes = readBytes ? Buffer.from(readBytes(join(root, path))) : fs.readFileSync(join(root, path)); return { path, sha256: sha(bytes), bytes: bytes.length }; });
  const records = (predicate) => files.filter(predicate);
  const inventory = records((file) => file.path.endsWith('/visual-state-inventory.json'));
  const jsxRecords = records((file) => file.path.includes('/src/cx-'));
  const preview = records((file) => file.path.endsWith('/preview/screens.html'));
  const food = records((file) => file.path.includes('/assets/food/'));
  const fonts = records((file) => file.path.includes('/node_modules/@fontsource/'));
  const lock = records((file) => file.path === `${ROOT}/package-lock.json`);
  const renderer = records((file) => file.path === `${ROOT}/bin/render.mjs` || file.path.startsWith(`${ROOT}/harness/`));
  const profile = records((file) => file.path === `${ROOT}/harness/profile.mjs`);
  const settlement = records((file) => file.path === `${ROOT}/harness/settlement.mjs`);
  return { fingerprint: digestRecords(files), files, inventoryHash: digestRecords(inventory), jsxTree: digestRecords(jsxRecords), previewHash: digestRecords(preview), foodHash: digestRecords(food), fontDigests: canonical(Object.fromEntries(fonts.map((file) => [file.path, file.sha256]))), lockDigest: digestRecords(lock), rendererDigest: digestRecords(renderer), profileDigest: digestRecords(profile), settlementDigest: digestRecords(settlement) };
}

export async function readInventorySelection(repoRoot, selection) {
  let inventory;
  try { inventory = JSON.parse(fs.readFileSync(join(resolve(repoRoot), 'docs/design-handoff/placeholder-app/visual-state-inventory.json'), 'utf8')); } catch { invalid('missing or malformed visual-state-inventory.json'); }
  const ids = inventory?.states?.map((state) => state.id);
  if (!Array.isArray(ids) || ids.length !== IDS.length || new Set(ids).size !== IDS.length || IDS.some((id) => !ids.includes(id))) invalid('inventory must contain exactly the required 19 state IDs');
  if (selection === 'all') return allSelection();
  if (!Array.isArray(selection)) invalid('selection must be all or an array');
  for (const key of selection) {
    const match = /^([a-z_]+)--([a-z]+)$/.exec(key);
    if (!match) invalid(`malformed selection key '${key}'`);
    if (!IDS.includes(match[1])) invalid(`unknown state ID '${match[1]}'`);
    if (!MODES.includes(match[2])) invalid(`invalid mode '${match[2]}' for state '${match[1]}'`);
  }
  if (selection.length === 0) invalid('empty selection');
  return sortedUnique(selection);
}

export function buildDerivedManifest(input) {
  const images = [...(input.images ?? [])].map(({ path, sha256, bytes, width, height, clockAdvanceMs }) => canonical({ path, sha256, bytes, width, height, clockAdvanceMs })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return canonical({ schemaVersion: MANIFEST_SCHEMA_VERSION, sourceFingerprint: input.sourceFingerprint, gitCommit: input.gitCommit, gitDirty: input.gitDirty, dirtyPaths: [...new Set(input.dirtyPaths ?? [])].sort(), inventoryHash: input.inventoryHash, jsxTree: input.jsxTree, previewHash: input.previewHash, foodHash: input.foodHash, fontDigests: input.fontDigests ?? {}, lockDigest: input.lockDigest, rendererDigest: input.rendererDigest, profileDigest: input.profileDigest, settlementDigest: input.settlementDigest, nodeVersion: input.nodeVersion, npmVersion: input.npmVersion, playwrightVersion: input.playwrightVersion, chromiumVersion: input.chromiumVersion, profile: PROFILE, selection: Array.isArray(input.selection) ? sortedUnique(input.selection) : input.selection, readiness: input.readiness ?? {}, images });
}

function traversal(path) { return String(path).split(/[\\/]+/).includes('..'); }
function fixedPathInfo(path, expectedKind) {
  if (traversal(path)) leafError('traversal is not permitted');
  const absolute = resolve(path); const marker = `${sep}.ui-diff${sep}expected-derived${sep}samsung-s20fe`; const at = absolute.lastIndexOf(marker);
  if (at < 0) leafError(`path is outside fixed prefix '${FULL_LEAF_PREFIX}'`);
  const fixedRoot = absolute.slice(0, at) + marker; const rest = absolute.slice(at + marker.length).split(sep).filter(Boolean);
  const kind = rest.length === 1 && rest[0] !== 'subsets' ? 'full' : (rest.length === 3 && rest[0] === 'subsets' ? 'subset' : null);
  if (!kind || (expectedKind && kind !== expectedKind) || !isFingerprint(kind === 'full' ? rest[0] : rest[1]) || (kind === 'subset' && !isFingerprint(rest[2]))) leafError('path is not an exact fixed leaf');
  return { absolute, fixedRoot, kind, rest };
}
function nearest(path) { let current = path; while (!fs.existsSync(current)) { const parent = dirname(current); if (parent === current) leafError('no existing ancestor'); current = parent; } return current; }
function assertSafePath(path, fixedRoot) {
  if (traversal(path)) leafError('traversal is not permitted');
  const absolute = resolve(path); let current = sep;
  for (const part of absolute.split(sep).filter(Boolean)) { current = join(current, part); if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) leafError(`symlink in path component '${current}'`); }
  const ancestor = nearest(absolute); const fixedReal = fs.realpathSync(fixedRoot); const ancestorReal = fs.realpathSync(ancestor);
  if (ancestorReal !== fixedReal && !ancestorReal.startsWith(`${fixedReal}${sep}`)) leafError('nearest existing ancestor escapes fixed containment');
  if (fs.lstatSync(fixedRoot).dev !== fs.lstatSync(ancestor).dev) leafError('device/mount escape detected');
}
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function parsePng(bytes, name) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) leafError(`invalid PNG '${name}'`);
  let offset = 8; let ihdr; let idat = false; let iend = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) leafError(`truncated PNG '${name}'`);
    const length = bytes.readUInt32BE(offset); const end = offset + 12 + length; if (end > bytes.length) leafError(`truncated PNG '${name}'`);
    const type = bytes.toString('ascii', offset + 4, offset + 8); const data = bytes.subarray(offset + 8, offset + 8 + length); const expected = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([Buffer.from(type), data])) !== expected) leafError(`PNG CRC mismatch for '${name}'`);
    if (!ihdr) { if (type !== 'IHDR' || length !== 13) leafError(`invalid PNG IHDR '${name}'`); ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4) }; }
    else if (type === 'IDAT') idat = true;
    else if (type === 'IEND') { if (length !== 0 || end !== bytes.length) leafError(`invalid PNG IEND '${name}'`); iend = true; break; }
    offset = end;
  }
  if (!ihdr || !idat || !iend) leafError(`incomplete PNG '${name}'`); return ihdr;
}
function diskManifest(leafDir) { try { const raw = fs.readFileSync(join(leafDir, 'manifest.json'), 'utf8'); const parsed = JSON.parse(raw); if (raw !== JSON.stringify(canonical(parsed))) leafError('manifest.json is not canonical'); return parsed; } catch (error) { if (error instanceof SyntaxError || error?.code === 'ENOENT') leafError('invalid manifest.json'); throw error; } }
function validateSchema(manifest) {
  if (!sameKeys(manifest, ROOT_KEYS) || manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION || !isFingerprint(manifest.sourceFingerprint) || !sameKeys(manifest.profile, PROFILE_KEYS) || !isDeepStrictEqual(manifest.profile, PROFILE) || !Array.isArray(manifest.images) || !Array.isArray(manifest.selection) || !Array.isArray(manifest.dirtyPaths)) leafError('invalid manifest schema');
  for (const image of manifest.images) if (!sameKeys(image, IMAGE_KEYS) || typeof image.path !== 'string' || !isFingerprint(image.sha256) || !Number.isInteger(image.bytes) || !Number.isInteger(image.width) || !Number.isInteger(image.height)) leafError('invalid manifest image schema');
}
function validateContents(leafDir, manifest, selection, kind) {
  validateSchema(manifest); const normalized = sortedUnique(selection); const names = imageNames(normalized);
  if (!isDeepStrictEqual(manifest.selection, normalized) || !isDeepStrictEqual(manifest.dirtyPaths, [...new Set(manifest.dirtyPaths)].sort())) leafError('manifest selection mismatch');
  const entries = fs.readdirSync(leafDir).sort(); const pngs = entries.filter((name) => name.endsWith('.png'));
  if (pngs.length !== names.length) leafError(`expected ${names.length} PNGs, found ${pngs.length}`);
  if (!entries.includes('manifest.json')) leafError('missing manifest.json');
  for (const name of entries) { const stat = fs.lstatSync(join(leafDir, name)); if (stat.isDirectory()) leafError(`unexpected subdirectory '${name}' in ${kind} leaf`); if (!stat.isFile()) leafError(`unexpected non-file '${name}' in ${kind} leaf`); }
  if (!isDeepStrictEqual(entries, [...names, 'manifest.json'].sort()) || !isDeepStrictEqual(pngs, names) || !isDeepStrictEqual(manifest.images.map((image) => image.path), names)) leafError('manifest image names mismatch');
  for (const image of manifest.images) { const bytes = fs.readFileSync(join(leafDir, image.path)); if (bytes.length !== image.bytes) leafError(`byte size mismatch for '${image.path}'`); if (sha(bytes) !== image.sha256) leafError(`SHA256 mismatch for '${image.path}'`); const dimensions = parsePng(bytes, image.path); if (dimensions.width !== 1080 || dimensions.height !== 2400 || image.width !== 1080 || image.height !== 2400) leafError(`PNG dimensions mismatch for '${image.path}'`); }
}
function validateAt(path, info, selection, supplied) {
  assertSafePath(path, info.fixedRoot); const manifest = diskManifest(path); if (supplied !== undefined && !isDeepStrictEqual(manifest, supplied)) leafError('supplied manifest differs from manifest.json');
  validateContents(path, manifest, selection, info.kind); const leafName = basename(path);
  if (path === info.absolute && ((info.kind === 'full' && leafName !== manifest.sourceFingerprint) || (info.kind === 'subset' && (info.rest[1] !== manifest.sourceFingerprint || info.rest[2] !== selectionSha256(manifest.selection))))) leafError('leaf identity does not match manifest');
  return manifest;
}
export async function validateFullLeaf(leafDir, manifest) { const info = fixedPathInfo(leafDir, 'full'); validateAt(info.absolute, info, allSelection(), manifest); }
export async function validateSubsetLeaf(leafDir, manifest, selection) { const info = fixedPathInfo(leafDir, 'subset'); if (!Array.isArray(selection) || selection.length === 0) leafError('empty subset selection'); validateAt(info.absolute, info, selection, manifest); }

function rollback(info, target, staged, temporary, backup, installed, backedUp, cause) {
  try {
    if (installed && fs.existsSync(target) && !fs.existsSync(staged)) fs.renameSync(target, staged);
    else if (!installed && fs.existsSync(temporary) && !fs.existsSync(staged)) fs.renameSync(temporary, staged);
    if (backedUp && fs.existsSync(backup) && !fs.existsSync(target)) fs.renameSync(backup, target);
  } catch (rollbackError) { throw new Error(`RENDER_LEAF_EXTRA: rollback failed after ${cause.message}: ${rollbackError.message}`); }
}
export async function replaceLeafAtomically(leafDir, stagedDir, { replace = false } = {}) {
  const info = fixedPathInfo(leafDir); const target = info.absolute; const staged = resolve(stagedDir); const parent = dirname(target);
  if (traversal(stagedDir) || dirname(staged) !== parent) leafError('staged leaf must be a safe sibling of the target leaf');
  const temporary = join(parent, `.${basename(target)}.tmp`); const backup = join(parent, `.${basename(target)}.backup`);
  for (const path of [target, staged, temporary, backup]) assertSafePath(path, info.fixedRoot);
  if (fs.existsSync(temporary) || fs.existsSync(backup)) leafError('existing temp or backup sibling');
  if (fs.existsSync(target) && !replace) leafError('target leaf already exists');
  const stagedManifest = diskManifest(staged); const selection = info.kind === 'full' ? allSelection() : stagedManifest.selection;
  if (!Array.isArray(selection) || selection.length === 0) leafError('invalid staged selection');
  if (stagedManifest.sourceFingerprint !== (info.kind === 'full' ? info.rest[0] : info.rest[1]) || (info.kind === 'subset' && info.rest[2] !== selectionSha256(stagedManifest.selection))) leafError('staged leaf identity does not match target');
  let backedUp = false; let installed = false; let committed = false;
  try {
    if (fs.existsSync(target)) validateAt(target, info, info.kind === 'full' ? allSelection() : diskManifest(target).selection);
    validateAt(staged, info, selection);
    fs.renameSync(staged, temporary); assertSafePath(temporary, info.fixedRoot); validateAt(temporary, info, selection);
    if (fs.existsSync(target)) { fs.renameSync(target, backup); backedUp = true; assertSafePath(backup, info.fixedRoot); validateAt(backup, info, info.kind === 'full' ? allSelection() : diskManifest(backup).selection); }
    fs.renameSync(temporary, target); installed = true; assertSafePath(target, info.fixedRoot); validateAt(target, info, selection); committed = true;
  } catch (error) { rollback(info, target, staged, temporary, backup, installed, backedUp, error); throw error; }
  if (committed && backedUp) { try { fs.rmSync(backup, { recursive: true, force: false }); } catch (error) { throw new Error(`RENDER_LEAF_EXTRA: leaf installed successfully but backup cleanup failed: ${error.message}`); } }
}
export async function validateReferenceLeaf({ repoRoot, selection = 'all' } = {}) {
  const root = resolve(repoRoot); const fingerprint = await computeSourceFingerprint(root); const normalized = await readInventorySelection(root, selection); const full = selection === 'all'; const path = full ? fullLeafPath(root, fingerprint.fingerprint) : subsetLeafPath(root, fingerprint.fingerprint, normalized);
  if (!fs.existsSync(path)) invalid(`reference leaf not found at ${path}`); const manifest = diskManifest(path); if (manifest.sourceFingerprint !== fingerprint.fingerprint) invalid('reference leaf source fingerprint mismatch'); if (full) await validateFullLeaf(path, manifest); else await validateSubsetLeaf(path, manifest, normalized); return { valid: true, leafPath: path, manifest };
}
