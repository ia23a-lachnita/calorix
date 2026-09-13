import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_ID, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, DEVICE_SCALE_FACTOR, PHYSICAL_WIDTH, PHYSICAL_HEIGHT, BROWSER_LOCALE, BROWSER_TIMEZONE, FROZEN_CHROMIUM_FLAGS, isArmArch, assertLocalRenderAllowed, RENDER_GUARD_EXIT_CODE } from '../harness/profile.mjs';

test('frozen S20 FE profile', () => {
  assert.equal(PROFILE_ID, 'samsung-s20fe');
  assert.equal(VIEWPORT_WIDTH, 360);
  assert.equal(VIEWPORT_HEIGHT, 800);
  assert.equal(DEVICE_SCALE_FACTOR, 3);
  assert.equal(PHYSICAL_WIDTH, 1080);
  assert.equal(PHYSICAL_HEIGHT, 2400);
  assert.equal(BROWSER_LOCALE, 'en-US');
  assert.equal(BROWSER_TIMEZONE, 'UTC');
  assert.deepEqual(FROZEN_CHROMIUM_FLAGS, ['--disable-lcd-text', '--font-render-hinting=none', '--disable-threaded-animation', '--force-color-profile=srgb', '--hide-scrollbars']);
});

test('ARM refuses before browser import', () => {
  assert.equal(isArmArch('arm64'), true);
  assert.equal(isArmArch('arm'), true);
  assert.equal(isArmArch('x64'), false);
  assert.throws(() => assertLocalRenderAllowed({ arch: 'arm64', allowLocalRender: false }), /ARM without --allow-local-render/);
  assert.throws(() => assertLocalRenderAllowed({ arch: 'arm', allowLocalRender: false }), /ARM without --allow-local-render/);
  assert.doesNotThrow(() => assertLocalRenderAllowed({ arch: 'x64', allowLocalRender: false }));
  assert.doesNotThrow(() => assertLocalRenderAllowed({ arch: 'arm64', allowLocalRender: true }));
  assert.doesNotThrow(() => assertLocalRenderAllowed({ arch: 'arm', allowLocalRender: true }));
  assert.equal(RENDER_GUARD_EXIT_CODE, 11);
});

test('locked pins and engines recorded', async () => {
  const fs = await import('node:fs/promises');
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies['react'], '18.3.1');
  assert.equal(pkg.dependencies['react-dom'], '18.3.1');
  assert.equal(pkg.dependencies['@babel/standalone'], '7.29.0');
  assert.equal(pkg.dependencies['@fontsource/geist'], '5.3.0');
  assert.equal(pkg.dependencies['@fontsource/geist-mono'], '5.3.0');
  assert.equal(pkg.devDependencies['playwright'], '1.63.0');
  assert.equal(pkg.engines['node'], '>=20 <21');
  assert.equal(pkg.scripts['test'], 'node --test test/*.test.mjs');
  assert.ok(pkg.scripts['render'].includes('bin/render.mjs'));
  assert.ok(pkg.scripts['validate'].includes('--validate-only'));
  const lock = JSON.parse(await fs.readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    const entry = lock.packages[`node_modules/${name}`];
    assert.ok(entry, `lock entry missing for ${name}`);
    assert.equal(entry.version, version);
    if (!entry.link) {
      assert.equal(typeof entry.integrity, 'string');
      assert.ok(entry.integrity.length > 0, `missing integrity for ${name}`);
    }
  }
});