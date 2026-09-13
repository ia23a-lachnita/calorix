import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from '../bin/render.mjs';

test('selection defaults to all', () => {
  assert.deepEqual(parseCliArgs([]), {
    selection: 'all',
    replace: false,
    allowLocalRender: false,
    validateOnly: false,
  });
});

test('explicit selection is sorted and deduped', () => {
  assert.deepEqual(parseCliArgs(['--selection', 'today--dark', '--replace']), {
    selection: ['today--dark'],
    replace: true,
    allowLocalRender: false,
    validateOnly: false,
  });
  const parsed = parseCliArgs(['--selection', 'today--dark,today--dark,ai--light']);
  assert.deepEqual(parsed.selection, ['ai--light', 'today--dark']);
  const flags = parseCliArgs(['--allow-local-render', '--validate-only', '--no-replace']);
  assert.equal(flags.allowLocalRender, true);
  assert.equal(flags.validateOnly, true);
  assert.equal(flags.replace, false);
});

test('rejects empty, mixed-all, conflicting, and bad input', () => {
  assert.throws(() => parseCliArgs(['--selection', '']), /RENDER_INVALID_INPUT/);
  assert.throws(() => parseCliArgs(['--selection', 'all,today--dark']), /RENDER_INVALID_INPUT/);
  assert.throws(() => parseCliArgs(['--replace', '--no-replace']), /RENDER_INVALID_INPUT/);
  assert.throws(() => parseCliArgs(['--bogus']), /RENDER_INVALID_INPUT/);
  assert.throws(() => parseCliArgs(['--selection']), /RENDER_INVALID_INPUT/);
  assert.throws(() => parseCliArgs(['--selection', 'today']), /RENDER_INVALID_INPUT/);
  assert.throws(() => parseCliArgs(['--selection', 'today--nightly']), /RENDER_INVALID_INPUT/);
});

test('direct CLI --bogus exits exactly 20 with RENDER_INVALID_INPUT on stderr', () => {
  const bin = fileURLToPath(new URL('../bin/render.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [bin, '--bogus'], { encoding: 'utf8' });
  assert.equal(result.status, 20);
  assert.match(result.stderr, /RENDER_INVALID_INPUT/);
});

test('direct CLI with no flags on ARM exits exactly 11 with RENDER_ARM_REFUSED on stderr', (t) => {
  if (process.arch !== 'arm' && process.arch !== 'arm64') {
    t.skip('non-ARM host: process-level ARM refusal not applicable');
    return;
  }
  const bin = fileURLToPath(new URL('../bin/render.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [bin], { encoding: 'utf8' });
  assert.equal(result.status, 11);
  assert.match(result.stderr, /RENDER_ARM_REFUSED/);
});

test('CLI entry is side-effect free with guard-before-dynamic-import and stable exit mapping', () => {
  // Importing bin/render.mjs above must not invoke main(): no exit code set.
  assert.equal(process.exitCode, undefined);
  const src = readFileSync(new URL('../bin/render.mjs', import.meta.url), 'utf8');
  assert.ok(!src.match(/from\s+['"]playwright['"]/));
  assert.ok(!src.match(/require\(\s*['"]playwright['"]\s*\)/));
  assert.ok(src.includes('assertLocalRenderAllowed'));
  assert.ok(src.includes('harness/render.mjs'));
  const guardCallIndex = src.indexOf('assertLocalRenderAllowed({');
  const dynamicImportIndex = src.indexOf("await import('../harness/render.mjs')");
  assert.ok(guardCallIndex !== -1, 'exact guard call assertLocalRenderAllowed({ must exist');
  assert.ok(dynamicImportIndex !== -1, "exact dynamic import await import('../harness/render.mjs') must exist");
  assert.ok(
    guardCallIndex < dynamicImportIndex,
    'ARM guard must precede the dynamic harness/render.mjs import',
  );
  assert.match(src, /await\s+import\(/);
  assert.match(src, /import\.meta\.url/);
  assert.match(src, /process\.argv/);
  assert.match(src, /main\s*\(/);
  assert.match(src, /exitCode\s*=\s*11/);
  assert.match(src, /exitCode\s*=\s*20/);
  assert.match(src, /exitCode\s*=\s*30/);
  assert.match(src, /RENDER_ARM_REFUSED/);
  assert.match(src, /RENDER_INVALID_INPUT/);
});

test('simulated x64 missing harness maps to exit 30 without launching a browser', () => {
  const bin = fileURLToPath(new URL('../bin/render.mjs', import.meta.url));
  const binUrl = new URL('../bin/render.mjs', import.meta.url).href;
  const evalCode = [
    "Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });",
    `process.argv[1] = ${JSON.stringify(bin)};`,
    `await import(${JSON.stringify(binUrl)});`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', evalCode], { encoding: 'utf8' });
  assert.equal(result.status, 30);
  assert.match(result.stderr, /harness\/render\.mjs/);
});
