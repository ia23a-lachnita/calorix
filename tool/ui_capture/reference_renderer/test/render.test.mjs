import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import {
  buildCaptureUrl,
  normalizeTodayText,
  todaySettlementExpectation,
  assertTodaySettlement,
  runReferenceRender,
} from '../harness/render.mjs';
import {
  BROWSER_LOCALE,
  BROWSER_TIMEZONE,
  DEVICE_SCALE_FACTOR,
  FROZEN_CHROMIUM_FLAGS,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from '../harness/profile.mjs';
import * as profileModule from '../harness/profile.mjs';
import { clockAdvanceMsFor } from '../harness/settlement.mjs';
import { parseCliArgs } from '../bin/render.mjs';
import {
  computeSourceFingerprint,
  fullLeafPath,
  subsetLeafPath,
  validateReferenceLeaf,
} from '../harness/manifest.mjs';

const STATE_IDS = [
  'loading', 'login', 'permission', 'scan_idle', 'scan_capturing', 'processing',
  'review', 'manual', 'today', 'today_empty', 'food', 'food_edit',
  'history_week', 'history_month', 'goals', 'goals_select', 'ai', 'ai_history', 'profile',
];

const DEFAULT_INDEXED_SCANLINES = deflateSync(Buffer.alloc((1080 + 1) * 2400));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  body.copy(result, 4);
  result.writeUInt32BE(crc32(body), 8 + data.length);
  return result;
}

function createValid1080x2400Png(payload = '') {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1080, 0);
  ihdr.writeUInt32BE(2400, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const colour = createHash('sha256').update(payload).digest()[0];
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from([colour, 0, 0])),
    chunk('IDAT', DEFAULT_INDEXED_SCANLINES),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createTestRepoFixture(root) {
  const app = join(root, 'docs/design-handoff/placeholder-app');
  const renderer = join(root, 'tool/ui_capture/reference_renderer');
  mkdirSync(join(app, 'src'), { recursive: true });
  mkdirSync(join(app, 'preview'), { recursive: true });
  mkdirSync(join(app, 'assets/food'), { recursive: true });
  mkdirSync(join(renderer, 'bin'), { recursive: true });
  mkdirSync(join(renderer, 'harness'), { recursive: true });
  mkdirSync(join(renderer, 'test'), { recursive: true });
  mkdirSync(join(renderer, 'node_modules/react/umd'), { recursive: true });
  mkdirSync(join(renderer, 'node_modules/react-dom/umd'), { recursive: true });
  mkdirSync(join(renderer, 'node_modules/@babel/standalone'), { recursive: true });
  mkdirSync(join(renderer, 'node_modules/@fontsource/geist/files'), { recursive: true });
  mkdirSync(join(renderer, 'node_modules/@fontsource/geist-mono/files'), { recursive: true });

  writeFileSync(
    join(app, 'visual-state-inventory.json'),
    JSON.stringify({ states: STATE_IDS.map((id) => ({ id })) }),
  );
  writeFileSync(
    join(app, 'src/cx-shell.jsx'),
    'export const shell = "../assets/food/nested/apple.png";',
  );
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
  for (const weight of [200, 400, 500, 600, 700]) {
    writeFileSync(
      join(renderer, `node_modules/@fontsource/geist/files/geist-latin-${weight}-normal.woff2`),
      `geist-${weight}`,
    );
  }
  for (const weight of [400, 500, 600]) {
    writeFileSync(
      join(renderer, `node_modules/@fontsource/geist-mono/files/geist-mono-latin-${weight}-normal.woff2`),
      `mono-${weight}`,
    );
  }
}

function initGitRepoWithCommit(root) {
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: root });
}

function createMockPlaywrightHarness(options = {}) {
  const events = {
    contextsCreated: [],
    contextsClosed: [],
    pagesCreated: [],
    clocksInstalled: [],
    clocksFastForwarded: [],
    gotos: [],
    waitForFunctions: [],
    evaluates: [],
    screenshots: [],
    routesRegistered: [],
    timeline: [],
    browserClosed: 0,
    serverClosed: 0,
  };

  const validPng = createValid1080x2400Png('mock-screenshot');

  const createMockPage = (contextId) => {
    let routeHandler = null;
    let currentUrl = '';
    const page = {
      contextId,
      clock: {
        install: async () => {
          events.clocksInstalled.push({ contextId });
          events.timeline.push({ kind: 'clockInstall', contextId });
        },
        fastForward: async (ms) => {
          events.clocksFastForwarded.push({ contextId, ms });
        },
      },
      route: async (pattern, handler) => {
        routeHandler = handler;
        events.routesRegistered.push({ contextId, pattern, handler });
        if (options.onRouteRegistered) {
          await options.onRouteRegistered({ contextId, pattern, handler, page });
        }
      },
      goto: async (url, opts) => {
        currentUrl = url;
        events.gotos.push({ contextId, url, opts });
        events.timeline.push({ kind: 'goto', contextId });
        if (options.onGoto) {
          await options.onGoto({ contextId, url, opts, page, routeHandler });
        }
      },
      waitForFunction: async (fn, arg, waitOptions) => {
        events.waitForFunctions.push({
          contextId,
          fn: typeof fn === 'function' ? fn.toString() : fn,
          arg,
          options: waitOptions,
        });
        events.timeline.push({ kind: 'waitForFunction', contextId });
        if (options.onWaitForFunction) {
          return await options.onWaitForFunction({ contextId, fn, arg, options: waitOptions, page, routeHandler });
        }
        return undefined;
      },
      evaluate: async (fn, ...args) => {
        events.evaluates.push({ contextId, fn: typeof fn === 'function' ? fn.toString() : fn });
        events.timeline.push({ kind: 'evaluate', contextId, fn: typeof fn === 'function' ? fn.toString() : String(fn) });
        if (options.onEvaluate) {
          return await options.onEvaluate({ contextId, fn, args, page, routeHandler });
        }
        const fnStr = typeof fn === 'function' ? fn.toString() : String(fn);
        if (fnStr.includes('heroMatch') || fnStr.includes('cx-harness')) {
          if (currentUrl.includes('screen=today_empty')) {
            return '0 kcal 0 g 0 g 0 g';
          }
          return '1420 kcal 96 g 132 g 38 g';
        }
        return '';
      },
      $: async (selector) => {
        if (selector === '#stage') {
          if (options.missingStage) return null;
          return {
            screenshot: async (opts) => {
              events.screenshots.push({ contextId, opts });
              events.timeline.push({ kind: 'screenshot', contextId });
              if (options.onScreenshot) {
                await options.onScreenshot({ contextId, opts });
              } else if (opts?.path) {
                writeFileSync(opts.path, validPng);
              }
            },
          };
        }
        return null;
      },
      close: async () => {},
    };
    events.pagesCreated.push(page);
    return page;
  };

  const createMockContext = (ctxOpts) => {
    const contextId = events.contextsCreated.length + 1;
    let isClosed = false;
    const context = {
      contextId,
      opts: ctxOpts,
      newPage: async () => {
        const page = createMockPage(contextId);
        return page;
      },
      close: async () => {
        isClosed = true;
        events.contextsClosed.push(contextId);
        if (options.onCloseContext) await options.onCloseContext(contextId);
      },
      get isClosed() { return isClosed; },
    };
    events.contextsCreated.push(context);
    return context;
  };

  const mockBrowser = {
    version: () => '130.0.0.0',
    newContext: async (ctxOpts) => {
      if (options.onNewContext) await options.onNewContext(ctxOpts);
      return createMockContext(ctxOpts);
    },
    close: async () => {
      events.browserClosed += 1;
      if (options.onCloseBrowser) await options.onCloseBrowser();
    },
  };

  const mockPlaywright = {
    version: '1.63.0',
    chromium: {
      launch: async (launchOpts) => {
        if (options.onLaunch) await options.onLaunch(launchOpts);
        return mockBrowser;
      },
    },
  };

  const mockServer = {
    address: () => ({ address: '127.0.0.1', port: 12345, family: 'IPv4' }),
    close: (cb) => {
      events.serverClosed += 1;
      if (cb) cb();
    },
  };

  return { mockPlaywright, mockServer, events, validPng };
}

test('clock map and frozen custom flags', () => {
  assert.equal(clockAdvanceMsFor('today'), 1600);
  assert.equal(clockAdvanceMsFor('today_empty'), 1600);
  assert.equal(clockAdvanceMsFor('loading'), 0);
  assert.equal(clockAdvanceMsFor('food'), 0);
  const allZeroStates = [
    'login',
    'permission',
    'scan_idle',
    'scan_capturing',
    'processing',
    'review',
    'manual',
    'food_edit',
    'history_week',
    'history_month',
    'goals',
    'goals_select',
    'ai',
    'ai_history',
    'profile',
  ];
  for (const id of allZeroStates) {
    assert.equal(clockAdvanceMsFor(id), 0);
  }
  assert.deepEqual(FROZEN_CHROMIUM_FLAGS, [
    '--disable-lcd-text',
    '--font-render-hinting=none',
    '--disable-threaded-animation',
    '--force-color-profile=srgb',
    '--hide-scrollbars',
  ]);
});

test('locale-normalized Today values by stateId with exhaustive positive and negative checks', () => {
  // Normalization
  assert.equal(normalizeTodayText('1,420'), '1420');
  assert.equal(
    normalizeTodayText('\u202f1,420\u00a0kcal\u00a096\u00a0g\u00a0132\u00a0g\u00a038\u00a0g'),
    '1420 kcal 96 g 132 g 38 g',
  );
  assert.equal(normalizeTodayText('1,420 kcal 96 g 132 g 38 g'), '1420 kcal 96 g 132 g 38 g');
  assert.equal(normalizeTodayText('0 kcal 0 g 0 g 0 g'), '0 kcal 0 g 0 g 0 g');
  assert.equal(normalizeTodayText('\u202f0\u00a0kcal\u00a00\u00a0g\u00a00\u00a0g\u00a00\u00a0g'), '0 kcal 0 g 0 g 0 g');

  // Expectations structure
  const todayExp = todaySettlementExpectation('today');
  assert.equal(todayExp.hero, '1420');
  assert.deepEqual(todayExp.macros, ['96', '132', '38']);
  assert.equal(todayExp.requiresKcal, true);
  assert.equal(todayExp.requiresG, true);

  const todayEmptyExp = todaySettlementExpectation('today_empty');
  assert.equal(todayEmptyExp.hero, '0');
  assert.deepEqual(todayEmptyExp.macros, ['0', '0', '0']);
  assert.equal(todayEmptyExp.requiresKcal, true);
  assert.equal(todayEmptyExp.requiresG, true);

  // Unknown or invalid stateId throws RENDER_INVALID_INPUT
  assert.throws(() => todaySettlementExpectation('unknown'), /RENDER_INVALID_INPUT/);
  assert.throws(() => todaySettlementExpectation(''), /RENDER_INVALID_INPUT/);
  assert.throws(() => todaySettlementExpectation(null), /RENDER_INVALID_INPUT/);

  // Positive settlement passes
  assert.doesNotThrow(() => assertTodaySettlement('1,420 kcal 96 g 132 g 38 g', 'today'));
  assert.doesNotThrow(() => assertTodaySettlement('\u202f1,420\u00a0kcal\u00a096\u00a0g\u00a0132\u00a0g\u00a038\u00a0g', 'today'));
  assert.doesNotThrow(() => assertTodaySettlement('0 kcal 0 g 0 g 0 g', 'today_empty'));
  assert.doesNotThrow(() => assertTodaySettlement('\u202f0\u00a0kcal\u00a00\u00a0g\u00a00\u00a0g\u00a00\u00a0g', 'today_empty'));

  // Negative tests for 'today':
  // 1. Hero calorie mismatch
  assert.throws(() => assertTodaySettlement('1,419 kcal 96 g 132 g 38 g', 'today'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('1421 kcal 96 g 132 g 38 g', 'today'), /RENDER_INVALID_INPUT/);
  // 2. Missing kcal unit
  assert.throws(() => assertTodaySettlement('1420 96 g 132 g 38 g', 'today'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('1420 cal 96 g 132 g 38 g', 'today'), /RENDER_INVALID_INPUT/);
  // 3. Missing g unit on macros
  assert.throws(() => assertTodaySettlement('1420 kcal 96 132 g 38 g', 'today'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('1420 kcal 96 g 132 38 g', 'today'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('1420 kcal 96 g 132 g 38', 'today'), /RENDER_INVALID_INPUT/);
  // 4. Macro value mismatch
  assert.throws(() => assertTodaySettlement('1420 kcal 95 g 132 g 38 g', 'today'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('1420 kcal 96 g 131 g 38 g', 'today'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('1420 kcal 96 g 132 g 40 g', 'today'), /RENDER_INVALID_INPUT/);
  // 5. Macro count mismatch
  assert.throws(() => assertTodaySettlement('1420 kcal 96 g 132 g', 'today'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('1420 kcal 96 g 132 g 38 g 10 g', 'today'), /RENDER_INVALID_INPUT/);
  // 6. Empty / invalid string
  assert.throws(() => assertTodaySettlement('', 'today'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('invalid settlement text', 'today'), /RENDER_INVALID_INPUT/);

  // Negative tests for 'today_empty':
  // 1. Hero calorie mismatch (non-zero)
  assert.throws(() => assertTodaySettlement('100 kcal 0 g 0 g 0 g', 'today_empty'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('1420 kcal 0 g 0 g 0 g', 'today_empty'), /RENDER_INVALID_INPUT/);
  // 2. Missing kcal unit
  assert.throws(() => assertTodaySettlement('0 0 g 0 g 0 g', 'today_empty'), /RENDER_INVALID_INPUT/);
  // 3. Missing g unit
  assert.throws(() => assertTodaySettlement('0 kcal 0 0 g 0 g', 'today_empty'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('0 kcal 0 g 0 0 g', 'today_empty'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('0 kcal 0 g 0 g 0', 'today_empty'), /RENDER_INVALID_INPUT/);
  // 4. Macro value mismatch (non-zero)
  assert.throws(() => assertTodaySettlement('0 kcal 10 g 0 g 0 g', 'today_empty'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('0 kcal 0 g 5 g 0 g', 'today_empty'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('0 kcal 0 g 0 g 2 g', 'today_empty'), /RENDER_INVALID_INPUT/);
  // 5. Macro count mismatch
  assert.throws(() => assertTodaySettlement('0 kcal 0 g 0 g', 'today_empty'), /RENDER_INVALID_INPUT/);
  assert.throws(() => assertTodaySettlement('0 kcal 0 g 0 g 0 g 0 g', 'today_empty'), /RENDER_INVALID_INPUT/);
  // 6. Empty / invalid string
  assert.throws(() => assertTodaySettlement('', 'today_empty'), /RENDER_INVALID_INPUT/);

  // Unknown state ID
  assert.throws(() => assertTodaySettlement('1420 kcal 96 g 132 g 38 g', 'unknown'), /RENDER_INVALID_INPUT/);
});

test('capture URL pins screen mode capture profile', () => {
  const url = buildCaptureUrl('http://127.0.0.1:9', 'today', 'dark');
  assert.match(url, /screen=today&mode=dark&capture=1&profile=samsung-s20fe/);
  assert.ok(url.startsWith('http://127.0.0.1:9/preview/screens.html?'));
  assert.throws(() => buildCaptureUrl('http://127.0.0.1:9', 'unknown', 'dark'), /RENDER_INVALID_INPUT/);
  assert.throws(() => buildCaptureUrl('http://127.0.0.1:9', 'today', 'sepia'), /RENDER_INVALID_INPUT/);
  assert.throws(() => buildCaptureUrl('http://127.0.0.1:9', 'today', ''), /RENDER_INVALID_INPUT/);
});

test('bin/render.mjs parses selection replace allowLocalRender validateOnly without importing Playwright', () => {
  const src = readFileSync(new URL('../bin/render.mjs', import.meta.url), 'utf8');
  assert.ok(!src.match(/from\s+['"]playwright['"]/), 'no static playwright import in bin/render.mjs');
  assert.ok(!src.match(/require\(\s*['"]playwright['"]\s*\)/), 'no require playwright in bin/render.mjs');
  assert.ok(src.includes('parseCliArgs'));
  assert.ok(src.includes('assertLocalRenderAllowed'));
  assert.ok(src.includes("await import('../harness/render.mjs')"));
});

test('bin/render.mjs main function conditionally bypasses ARM guard for validateOnly and keeps guard before harness import for normal render', () => {
  assert.deepEqual(parseCliArgs(['--validate-only']), {
    selection: 'all',
    replace: false,
    allowLocalRender: false,
    validateOnly: true,
  });
  assert.deepEqual(parseCliArgs(['--selection', 'today--dark', '--allow-local-render']), {
    selection: ['today--dark'],
    replace: false,
    allowLocalRender: true,
    validateOnly: false,
  });

  const src = readFileSync(new URL('../bin/render.mjs', import.meta.url), 'utf8');
  const mainMatch = src.match(/(?:export\s+)?async\s+function\s+main\s*\([^)]*\)\s*\{([\s\S]*)/);
  assert.ok(mainMatch, 'main function must exist');
  const mainBody = mainMatch[1];

  const conditionalGuardMatch = mainBody.match(
    /if\s*\(\s*!\s*(?:parsed\??\.)?validateOnly\s*\)[\s\S]*?assertLocalRenderAllowed/,
  );
  assert.ok(
    conditionalGuardMatch,
    'main function must wrap assertLocalRenderAllowed in a real conditional like if (!parsed.validateOnly)',
  );
  const guardIndex = mainBody.indexOf('assertLocalRenderAllowed({');
  const importIndex = mainBody.indexOf("await import('../harness/render.mjs')");
  assert.ok(guardIndex !== -1, 'assertLocalRenderAllowed({ must be called in main body');
  assert.ok(importIndex !== -1, "await import('../harness/render.mjs') must be called in main body");
  assert.ok(
    conditionalGuardMatch.index < importIndex && guardIndex < importIndex,
    'conditional assertLocalRenderAllowed must precede harness import in normal render path',
  );
});

test('harness/render.mjs imports and source contract checks', () => {
  const src = readFileSync(new URL('../harness/render.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('buildCaptureUrl'), 'buildCaptureUrl is defined');
  assert.ok(src.includes('normalizeTodayText'), 'normalizeTodayText is defined');
  assert.ok(src.includes('todaySettlementExpectation'), 'todaySettlementExpectation is defined');
  assert.ok(src.includes('assertTodaySettlement'), 'assertTodaySettlement is defined');
  assert.ok(src.includes('runReferenceRender'), 'runReferenceRender is defined');
  assert.ok(src.includes('assertLocalRenderAllowed'), 'ARM guard assertLocalRenderAllowed is called');
  assert.ok(src.includes('importPlaywrightFn'), 'importPlaywrightFn seam exists');
  assert.ok(src.includes('createReferenceServerFn'), 'createReferenceServerFn seam exists');
  assert.ok(src.includes('validateReferenceLeafFn'), 'validateReferenceLeafFn seam exists');
  assert.ok(src.includes('page.clock.install'), 'page.clock.install is called');
  assert.ok(src.includes('page.goto'), 'page.goto is called');

  assert.ok(!src.match(/from\s+['"]playwright['"]/), 'harness/render.mjs never statically imports playwright');
  assert.ok(!src.match(/require\(\s*['"]playwright['"]\s*\)/), 'harness/render.mjs never requires playwright');
  assert.ok(!src.includes('no-sandbox'), 'harness/render.mjs never adds no-sandbox');
  assert.ok(!src.includes('svgizeGradients'), 'harness/render.mjs never uses svgizeGradients');
  assert.ok(!src.includes('no pending RAF'), 'harness/render.mjs never claims no pending RAF');
});

test('source order within runReferenceRender function body: runtime assertLocalRenderAllowed({ call before runtime importPlaywrightFn( call', () => {
  const src = readFileSync(new URL('../harness/render.mjs', import.meta.url), 'utf8');
  const fnMatch = src.match(/(?:export\s+)?(?:async\s+)?function\s+runReferenceRender\s*\(/);
  assert.ok(fnMatch, 'runReferenceRender exported async function must be defined');
  const paramStart = fnMatch.index + fnMatch[0].length - 1;
  let depth = 0;
  let paramEnd = -1;
  for (let i = paramStart; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) {
        paramEnd = i;
        break;
      }
    }
  }
  assert.ok(paramEnd !== -1, 'runReferenceRender parameter list must terminate with matching )');
  const bodyStart = src.indexOf('{', paramEnd);
  assert.ok(bodyStart !== -1, 'runReferenceRender body delimiter { must exist after parameter list');
  const bodyText = src.slice(bodyStart + 1);

  const runtimeGuardIndex = bodyText.indexOf('assertLocalRenderAllowed({');
  const runtimeImportIndex = bodyText.indexOf('importPlaywrightFn(');
  assert.ok(runtimeGuardIndex !== -1, 'runtime assertLocalRenderAllowed({ call must exist inside runReferenceRender body');
  assert.ok(runtimeImportIndex !== -1, 'runtime importPlaywrightFn( call must exist inside runReferenceRender body');
  assert.ok(
    runtimeGuardIndex < runtimeImportIndex,
    'runtime assertLocalRenderAllowed({ call must precede runtime importPlaywrightFn( call inside runReferenceRender body',
  );

  const clockIndex = bodyText.indexOf('page.clock.install');
  const gotoIndex = bodyText.indexOf('page.goto');
  assert.ok(clockIndex !== -1 && gotoIndex !== -1 && clockIndex < gotoIndex, 'page.clock.install must precede page.goto inside runReferenceRender body');
});

test('validateOnly: true returns validateReferenceLeafFn result without guard, Playwright import, server creation, or render mutations', async () => {
  const calls = {
    validateReferenceLeaf: [],
    importPlaywright: 0,
    createReferenceServer: 0,
  };
  const mockValidateResult = { valid: true, leafPath: '/mock/leaf/path', manifest: { schemaVersion: 1 } };
  const mockValidate = async (args) => {
    calls.validateReferenceLeaf.push(args);
    return mockValidateResult;
  };
  const mockImportPlaywright = async () => {
    calls.importPlaywright += 1;
    throw new Error('Playwright must not be imported during validateOnly');
  };
  const mockCreateServer = async () => {
    calls.createReferenceServer += 1;
    throw new Error('Server must not be created during validateOnly');
  };

  const result = await runReferenceRender(
    {
      repoRoot: '/custom/repo/root',
      selection: ['today--dark', 'food--light'],
      validateOnly: true,
      allowLocalRender: false,
      replace: false,
    },
    {
      validateReferenceLeafFn: mockValidate,
      importPlaywrightFn: mockImportPlaywright,
      createReferenceServerFn: mockCreateServer,
      existsSyncFn: () => true,
      cwdFn: () => '/custom/repo/root',
    },
  );

  assert.deepEqual(calls.validateReferenceLeaf, [
    { repoRoot: '/custom/repo/root', selection: ['today--dark', 'food--light'] },
  ]);
  assert.deepEqual(result, mockValidateResult);
  assert.equal(calls.importPlaywright, 0, 'Playwright must not be imported when validateOnly is true');
  assert.equal(calls.createReferenceServer, 0, 'Server must not be created when validateOnly is true');
});

test('canonical repoRoot resolution executes identically from repo root and package directory', async () => {
  const canonicalRepoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
  const packageDir = join(canonicalRepoRoot, 'tool/ui_capture/reference_renderer');

  const capturedRoots = [];
  const mockValidate = async ({ repoRoot }) => {
    capturedRoots.push(resolve(repoRoot));
    return { valid: true, leafPath: '/mock', manifest: {} };
  };

  // Execution 1: cwd is repo root, existsSyncFn confirms placeholder-app exists in cwd
  await runReferenceRender(
    { validateOnly: true },
    {
      validateReferenceLeafFn: mockValidate,
      cwdFn: () => canonicalRepoRoot,
      existsSyncFn: (checkPath) => checkPath === join(canonicalRepoRoot, 'docs/design-handoff/placeholder-app'),
    },
  );

  // Execution 2: cwd is package directory, existsSyncFn returns false for placeholder-app in cwd
  await runReferenceRender(
    { validateOnly: true },
    {
      validateReferenceLeafFn: mockValidate,
      cwdFn: () => packageDir,
      existsSyncFn: () => false,
    },
  );

  assert.equal(capturedRoots.length, 2);
  assert.equal(capturedRoots[0], canonicalRepoRoot, 'repo root cwd resolves to canonical root');
  assert.equal(capturedRoots[1], canonicalRepoRoot, 'package dir cwd resolves to canonical root');
  assert.equal(capturedRoots[0], capturedRoots[1], 'both cwd executions pass the exact same canonical root to validateReferenceLeafFn');
});

test('render path with replace: false rejects existing target leaf with RENDER_LEAF_EXTRA before server creation or Playwright import', async () => {
  const canonicalRepoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
  let serverCreated = false;
  let playwrightImported = false;

  await assert.rejects(
    async () => {
      await runReferenceRender(
        {
          repoRoot: canonicalRepoRoot,
          selection: 'all',
          replace: false,
          validateOnly: false,
          allowLocalRender: false,
        },
        {
          existsSyncFn: (p) => {
            // Target leaf path in .ui-diff/expected-derived/samsung-s20fe exists
            if (String(p).includes('.ui-diff/expected-derived/samsung-s20fe')) {
              return true;
            }
            return existsSync(p);
          },
          importPlaywrightFn: async () => {
            playwrightImported = true;
            throw new Error('importPlaywrightFn must not be called when target leaf exists');
          },
          createReferenceServerFn: async () => {
            serverCreated = true;
            throw new Error('createReferenceServerFn must not be called when target leaf exists');
          },
        },
      );
    },
    (err) => {
      assert.match(err.message, /RENDER_LEAF_EXTRA/);
      return true;
    },
  );

  assert.equal(serverCreated, false, 'server must not be created when target leaf exists and replace is false');
  assert.equal(playwrightImported, false, 'playwright must not be imported when target leaf exists and replace is false');
});

test('harness/render.mjs exhaustively asserts every Geist and Geist Mono weight via document.fonts.check and FontFace', () => {
  const src = readFileSync(new URL('../harness/render.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('document.fonts.ready'), 'waits for document.fonts.ready');
  assert.ok(src.includes('document.fonts.check'), 'calls document.fonts.check');
  assert.ok(src.includes('FontFace'), 'checks FontFace loaded status');

  const geistWeights = [200, 400, 500, 600, 700];
  for (const weight of geistWeights) {
    const geistPattern = new RegExp(
      `(?:['"\`][^'"\`]*?\\b${weight}\\b[^'"\`]*?\\bGeist\\b(?!\\s*Mono)[^'"\`]*?['"\`]|(?:family|name)\\s*:\\s*['"]Geist['"][\\s\\S]{0,100}?\\b${weight}\\b|\\b${weight}\\b[\\s\\S]{0,100}?(?:family|name)\\s*:\\s*['"]Geist['"]|Geist['"][\\s\\S]{0,50}?weights[\\s\\S]{0,50}?\\b${weight}\\b)`,
    );
    assert.match(
      src,
      geistPattern,
      `Geist weight ${weight} descriptor must be checked in harness/render.mjs`,
    );
  }
  const geistMonoWeights = [400, 500, 600];
  for (const weight of geistMonoWeights) {
    const geistMonoPattern = new RegExp(
      `(?:['"\`][^'"\`]*?\\b${weight}\\b[^'"\`]*?\\bGeist\\s+Mono\\b[^'"\`]*?['"\`]|(?:family|name)\\s*:\\s*['"]Geist\\s+Mono['"][\\s\\S]{0,100}?\\b${weight}\\b|\\b${weight}\\b[\\s\\S]{0,100}?(?:family|name)\\s*:\\s*['"]Geist\\s+Mono['"]|Geist\\s+Mono['"][\\s\\S]{0,50}?weights[\\s\\S]{0,50}?\\b${weight}\\b)`,
    );
    assert.match(
      src,
      geistMonoPattern,
      `Geist Mono weight ${weight} descriptor must be checked in harness/render.mjs`,
    );
  }
});

test('harness/render.mjs structurally enforces img.decode and stage image complete and naturalWidth > 0', () => {
  const src = readFileSync(new URL('../harness/render.mjs', import.meta.url), 'utf8');
  assert.match(
    src,
    /(?:#stage\s+img|#stage['"]\s*\)\s*\.querySelectorAll\(\s*['"]img['"]|querySelector(?:All)?\(\s*['"]#stage\s+img['"]\)|stage\.querySelectorAll\(\s*['"]img['"]\))/i,
    'queries images within #stage',
  );
  assert.match(src, /(?:img|\bimage)\.decode\(\)|\.decode\(\)/, 'calls img.decode() on stage images');
  assert.match(src, /(?:img|\bimage)\.complete|\bcomplete\b/, 'asserts image complete property');
  assert.match(
    src,
    /(?:naturalWidth\s*>\s*0|naturalWidth\s*<=?\s*0|naturalWidth\s*===?\s*0|!\s*(?:img|\bimage)\.naturalWidth)/,
    'asserts image naturalWidth is greater than zero',
  );

  const decodeIndex = src.indexOf('.decode()');
  const completeIndex = src.indexOf('.complete');
  const naturalWidthIndex = src.indexOf('naturalWidth');
  assert.ok(decodeIndex !== -1, '.decode() must exist in harness/render.mjs');
  assert.ok(completeIndex !== -1, '.complete check must exist in harness/render.mjs');
  assert.ok(naturalWidthIndex !== -1, 'naturalWidth check must exist in harness/render.mjs');
  assert.ok(
    decodeIndex < completeIndex && decodeIndex < naturalWidthIndex,
    'stage images must invoke decode before evaluating complete and naturalWidth',
  );
});

test('harness/render.mjs asserts exact viewport 360x800, DPR 3, and fit/stage rects at x0/y0 360x800', () => {
  const src = readFileSync(new URL('../harness/render.mjs', import.meta.url), 'utf8');

  assert.match(
    src,
    /(?:window\.)?innerWidth\s*(?:===?|!==?)\s*360|\b360\s*(?:===?|!==?)\s*(?:window\.)?innerWidth/,
    'asserts exact innerWidth === 360',
  );
  assert.match(
    src,
    /(?:window\.)?innerHeight\s*(?:===?|!==?)\s*800|\b800\s*(?:===?|!==?)\s*(?:window\.)?innerHeight/,
    'asserts exact innerHeight === 800',
  );
  assert.match(
    src,
    /(?:window\.)?devicePixelRatio\s*(?:===?|!==?)\s*3|\b3\s*(?:===?|!==?)\s*(?:window\.)?devicePixelRatio/,
    'asserts exact devicePixelRatio === 3',
  );

  assert.match(src, /(?:getElementById\(\s*['"]fit['"]|querySelector\(\s*['"]#fit['"])/, 'queries #fit element');
  assert.match(src, /(?:getElementById\(\s*['"]stage['"]|querySelector\(\s*['"]#stage['"])/, 'queries #stage element');
  assert.match(src, /getBoundingClientRect\(\)/, 'computes bounding client rects');

  assert.match(
    src,
    /(?:\b(?:x|left)\s*(?:===?|!==?)\s*0|\b0\s*(?:===?|!==?)\s*(?:x|left)|(?:x|left)\s*:\s*0)/,
    'asserts rect x/left === 0',
  );
  assert.match(
    src,
    /(?:\b(?:y|top)\s*(?:===?|!==?)\s*0|\b0\s*(?:===?|!==?)\s*(?:y|top)|(?:y|top)\s*:\s*0)/,
    'asserts rect y/top === 0',
  );
  assert.match(
    src,
    /(?:\bwidth\s*(?:===?|!==?)\s*360|\b360\s*(?:===?|!==?)\s*width|width\s*:\s*360)/,
    'asserts rect width === 360',
  );
  assert.match(
    src,
    /(?:\bheight\s*(?:===?|!==?)\s*800|\b800\s*(?:===?|!==?)\s*height|height\s*:\s*800)/,
    'asserts rect height === 800',
  );
});

test('harness/render.mjs captures native #stage element handle screenshot and forbids page.screenshot', () => {
  const src = readFileSync(new URL('../harness/render.mjs', import.meta.url), 'utf8');
  assert.match(
    src,
    /(?:page\.\$\(\s*['"]#stage['"]\s*\)|page\.locator\(\s*['"]#stage['"]\s*\)|page\.waitForSelector\(\s*['"]#stage['"]\s*\)|['"]#stage['"])/,
    'locates #stage element handle or locator',
  );
  assert.match(
    src,
    /(?:stage|stageHandle|stageLocator|stageElement|\$\(['"]#stage['"]\)|\.locator\(['"]#stage['"]\))\s*\.screenshot\s*\(/,
    'invokes .screenshot() on stage locator or element handle',
  );
  assert.ok(!src.match(/page\.screenshot\b/), 'forbidden page.screenshot must not be present');
  assert.ok(!src.includes('no-sandbox'), 'forbidden no-sandbox must not be present');
  assert.ok(!src.includes('svgizeGradients'), 'forbidden svgizeGradients must not be present');
  assert.ok(!src.includes('no pending RAF'), 'forbidden no pending RAF must not be present');
});

// ============================================================================
// MANDATORY ANTIGRAVITY MCP REGRESSION TESTS (Findings 1 through 6)
// ============================================================================

// Finding 1: Direct fail-closed propagation when readInventorySelection or computeSourceFingerprint fails
test('fail-closed propagation: computeSourceFingerprint failure rejects with RENDER_INVALID_INPUT without fallback zero fingerprint or server/browser launch', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-fail-fingerprint-'));
  let serverCreated = false;
  let playwrightImported = false;
  try {
    createTestRepoFixture(root);
    // Remove a required allowlisted input so computeSourceFingerprint will fail
    rmSync(join(root, 'docs/design-handoff/placeholder-app/preview/screens.html'));

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['today--dark'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => {
            playwrightImported = true;
            throw new Error('importPlaywrightFn must not be called when computeSourceFingerprint fails');
          },
          createReferenceServerFn: async () => {
            serverCreated = true;
            throw new Error('createReferenceServerFn must not be called when computeSourceFingerprint fails');
          },
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_INVALID_INPUT/);
        assert.match(err.message, /missing allowlisted input/);
        return true;
      },
    );

    assert.equal(serverCreated, false, 'server must not be created on computeSourceFingerprint failure');
    assert.equal(playwrightImported, false, 'playwright must not be imported on computeSourceFingerprint failure');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fail-closed propagation: readInventorySelection failure rejects with RENDER_INVALID_INPUT on custom repoRoot without canonical root fallback', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-fail-inventory-'));
  try {
    createTestRepoFixture(root);
    // Corrupt the inventory in custom root
    writeFileSync(
      join(root, 'docs/design-handoff/placeholder-app/visual-state-inventory.json'),
      JSON.stringify({ states: [{ id: 'today' }] }), // Only 1 state instead of 19
    );

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: 'all',
          allowLocalRender: true,
          replace: true,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_INVALID_INPUT/);
        assert.match(err.message, /inventory must contain exactly the required 19 state IDs/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source contract: harness/render.mjs forbids fallback zero fingerprint and canonicalRoot inventory catch fallback', () => {
  const src = readFileSync(new URL('../harness/render.mjs', import.meta.url), 'utf8');
  assert.ok(!src.includes("'0'.repeat(64)"), 'render.mjs must not fall back to 64 zeros fingerprint');
  assert.ok(!src.includes('"0".repeat(64)'), 'render.mjs must not fall back to 64 zeros fingerprint');
  assert.ok(!src.includes('0000000000000000000000000000000000000000000000000000000000000000'), 'render.mjs must not contain literal zero fingerprint');
  assert.ok(
    !src.match(/catch\s*\(err\)\s*\{[\s\S]*?readInventorySelection\s*\(\s*canonicalRoot/),
    'readInventorySelection error must not be caught to fall back to canonicalRoot',
  );
});

// Finding 2: Exact relevant dirty-path filtering semantics
test('manifest dirty-path filtering: irrelevant dirty files are excluded and do not set gitDirty', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-dirty-irrelevant-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    // Modify only irrelevant files
    writeFileSync(join(root, 'README.md'), 'modified readme');
    mkdirSync(join(root, 'docs/superpowers'), { recursive: true });
    writeFileSync(join(root, 'docs/superpowers/notes.txt'), 'notes');
    mkdirSync(join(root, 'tool/ui_capture/reference_renderer/test'), { recursive: true });
    writeFileSync(join(root, 'tool/ui_capture/reference_renderer/test/render.test.mjs'), '// test');

    const { mockPlaywright, mockServer } = createMockPlaywrightHarness();

    const result = await runReferenceRender(
      {
        repoRoot: root,
        selection: ['today--dark'],
        allowLocalRender: true,
        replace: true,
      },
      {
        importPlaywrightFn: async () => mockPlaywright,
        createReferenceServerFn: async () => mockServer,
      },
    );

    assert.equal(result.valid, true);
    assert.deepEqual(result.manifest.dirtyPaths, [], 'irrelevant dirty files must be filtered out');
    assert.equal(result.manifest.gitDirty, false, 'gitDirty must be false when no relevant files are dirty');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('manifest dirty-path filtering: only exact allowlisted source files are retained in sorted dirtyPaths', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-dirty-mixed-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    // Modify a mix of relevant and irrelevant files
    writeFileSync(join(root, 'README.md'), 'modified readme');
    writeFileSync(
      join(root, 'docs/design-handoff/placeholder-app/src/cx-shell.jsx'),
      'export const shell = "../assets/food/nested/apple.png"; // dirty',
    );
    writeFileSync(
      join(root, 'docs/design-handoff/placeholder-app/assets/food/nested/apple.png'),
      'apple-dirty',
    );
    mkdirSync(join(root, 'tool/ui_capture/reference_renderer/test'), { recursive: true });
    writeFileSync(join(root, 'tool/ui_capture/reference_renderer/test/render.test.mjs'), '// dirty test');
    writeFileSync(
      join(root, 'tool/ui_capture/reference_renderer/harness/render.mjs'),
      '// dirty harness',
    );

    const { mockPlaywright, mockServer } = createMockPlaywrightHarness();

    const result = await runReferenceRender(
      {
        repoRoot: root,
        selection: ['today--dark'],
        allowLocalRender: true,
        replace: true,
      },
      {
        importPlaywrightFn: async () => mockPlaywright,
        createReferenceServerFn: async () => mockServer,
      },
    );

    assert.equal(result.valid, true);
    assert.deepEqual(
      result.manifest.dirtyPaths,
      [
        'docs/design-handoff/placeholder-app/assets/food/nested/apple.png',
        'docs/design-handoff/placeholder-app/src/cx-shell.jsx',
        'tool/ui_capture/reference_renderer/harness/render.mjs',
      ],
      'dirtyPaths must contain only allowlisted relevant source paths in alphabetical order',
    );
    assert.equal(result.manifest.gitDirty, true, 'gitDirty must be true when relevant files are dirty');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Finding 3: One fresh browser context/page/clock per selected screen and context cleanup
test('one fresh browser context page and clock per selected screen with prompt context cleanup', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-fresh-context-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    const { mockPlaywright, mockServer, events } = createMockPlaywrightHarness();

    const selection = ['food--light', 'today--dark', 'today_empty--light'];

    const result = await runReferenceRender(
      {
        repoRoot: root,
        selection,
        allowLocalRender: true,
        replace: true,
      },
      {
        importPlaywrightFn: async () => mockPlaywright,
        createReferenceServerFn: async () => mockServer,
      },
    );

    assert.equal(result.valid, true);
    assert.equal(events.contextsCreated.length, 3, 'must create exactly one fresh browser context per selected screen');
    assert.equal(events.pagesCreated.length, 3, 'must create exactly one fresh page per selected screen');
    assert.equal(events.clocksInstalled.length, 3, 'must install clock on each fresh page per selected screen');
    assert.equal(events.contextsClosed.length, 3, 'each per-screen browser context must be closed after screen render');

    for (const ctx of events.contextsCreated) {
      assert.deepEqual(ctx.opts, {
        viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        locale: BROWSER_LOCALE,
        timezoneId: BROWSER_TIMEZONE,
      });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('per-screen context cleanup closes active context when per-screen rendering fails', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-context-cleanup-fail-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    let screenCount = 0;
    const { mockPlaywright, mockServer, events } = createMockPlaywrightHarness({
      onEvaluate: async ({ fn }) => {
        const fnStr = typeof fn === 'function' ? fn.toString() : String(fn);
        if (fnStr.includes('heroMatch') || fnStr.includes('cx-harness')) {
          return '1420 kcal 96 g 132 g 38 g';
        }
        screenCount += 1;
        if (screenCount === 2) {
          throw new Error('RENDER_IMAGE_INCOMPLETE: stage image incomplete');
        }
        return '';
      },
    });

    const selection = ['today--dark', 'food--light'];

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection,
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => mockPlaywright,
          createReferenceServerFn: async () => mockServer,
        },
      ),
      /RENDER_IMAGE_INCOMPLETE/,
    );

    assert.equal(events.contextsCreated.length, 2, '2 contexts should have been created');
    assert.equal(events.contextsClosed.length, 2, 'both contexts must be closed even when rendering fails on second screen');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Finding 4: Exact local URL origin plus allowlisted path and typed RENDER_REMOTE_FETCH failure for unexpected requests
test('request routing: external unallowlisted network request fails render with typed RENDER_REMOTE_FETCH', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-route-remote-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    let injected = false;
    const { mockPlaywright, mockServer } = createMockPlaywrightHarness({
      onGoto: async ({ routeHandler }) => {
        injected = true;
        await routeHandler({
          request: () => ({
            method: () => 'GET',
            url: () => 'https://analytics.example.com/tracker.js',
            headers: () => ({}),
          }),
          abort: async () => {},
          fulfill: async () => {},
          continue: async () => {},
        });
      },
      onEvaluate: async () => {
        if (injected) {
          throw new Error('SENTINEL_REMOTE_FETCH_NOT_SURFACED: execution continued after unallowlisted network request');
        }
        return '';
      },
      onScreenshot: async () => {
        if (injected) {
          throw new Error('SENTINEL_REMOTE_FETCH_NOT_SURFACED: screenshot reached after unallowlisted network request');
        }
      },
    });

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['today--dark'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => mockPlaywright,
          createReferenceServerFn: async () => mockServer,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_REMOTE_FETCH/);
        assert.match(err.message, /today--dark/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('request routing: local request with unallowlisted path or origin mismatch fails with typed RENDER_REMOTE_FETCH', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-route-unallowlisted-local-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    let injected = false;
    const { mockPlaywright, mockServer } = createMockPlaywrightHarness({
      onGoto: async ({ routeHandler }) => {
        injected = true;
        await routeHandler({
          request: () => ({
            method: () => 'GET',
            url: () => 'http://127.0.0.1:12345/unallowlisted/secret.env',
            headers: () => ({}),
          }),
          abort: async () => {},
          fulfill: async () => {},
          continue: async () => {},
        });
      },
      onEvaluate: async () => {
        if (injected) {
          throw new Error('SENTINEL_REMOTE_FETCH_NOT_SURFACED: execution continued after unallowlisted network request');
        }
        return '';
      },
      onScreenshot: async () => {
        if (injected) {
          throw new Error('SENTINEL_REMOTE_FETCH_NOT_SURFACED: screenshot reached after unallowlisted network request');
        }
      },
    });

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['food--light'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => mockPlaywright,
          createReferenceServerFn: async () => mockServer,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_REMOTE_FETCH/);
        assert.match(err.message, /food--light/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('request routing: non-GET request fails render with typed RENDER_REMOTE_FETCH', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-route-non-get-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    let injected = false;
    const { mockPlaywright, mockServer } = createMockPlaywrightHarness({
      onGoto: async ({ routeHandler }) => {
        injected = true;
        await routeHandler({
          request: () => ({
            method: () => 'POST',
            url: () => 'http://127.0.0.1:12345/preview/screens.html',
            headers: () => ({}),
          }),
          abort: async () => {},
          fulfill: async () => {},
          continue: async () => {},
        });
      },
      onEvaluate: async () => {
        if (injected) {
          throw new Error('SENTINEL_REMOTE_FETCH_NOT_SURFACED: execution continued after unallowlisted network request');
        }
        return '';
      },
      onScreenshot: async () => {
        if (injected) {
          throw new Error('SENTINEL_REMOTE_FETCH_NOT_SURFACED: screenshot reached after unallowlisted network request');
        }
      },
    });

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['login--dark'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => mockPlaywright,
          createReferenceServerFn: async () => mockServer,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_REMOTE_FETCH/);
        assert.match(err.message, /login--dark/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Finding 5: Pre-existing staged sibling must fail with RENDER_LEAF_EXTRA without deletion
test('pre-existing staged sibling must fail with RENDER_LEAF_EXTRA without deletion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-staged-sibling-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    // Compute expected subset leaf path to locate the staged sibling path
    const { computeSourceFingerprint, subsetLeafPath } = await import('../harness/manifest.mjs');
    const { fingerprint } = await computeSourceFingerprint(root);
    const targetLeaf = subsetLeafPath(root, fingerprint, ['today--dark']);
    const parentDir = dirname(targetLeaf);
    mkdirSync(parentDir, { recursive: true });

    const stagedDir = join(parentDir, `.${basename(targetLeaf)}.staged`);
    mkdirSync(stagedDir, { recursive: true });
    const markerFile = join(stagedDir, 'preserve-me.txt');
    writeFileSync(markerFile, 'do-not-delete-this-file');

    const { mockPlaywright, mockServer } = createMockPlaywrightHarness();

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['today--dark'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => mockPlaywright,
          createReferenceServerFn: async () => mockServer,
        },
      ),
      /RENDER_LEAF_EXTRA/,
    );

    assert.equal(
      existsSync(markerFile),
      true,
      'pre-existing staged sibling and its contents must NOT be deleted',
    );
    assert.equal(
      readFileSync(markerFile, 'utf8'),
      'do-not-delete-this-file',
      'marker file contents must remain untouched',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Finding 6: Every per-screen runtime error must include the selection key context
test('every per-screen runtime error must include the selection key context: RENDER_FONT_MISSING', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-context-font-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    const { mockPlaywright, mockServer } = createMockPlaywrightHarness({
      onEvaluate: async () => {
        throw new Error("RENDER_FONT_MISSING: font check failed for '200 16px Geist'");
      },
    });

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['login--dark'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => mockPlaywright,
          createReferenceServerFn: async () => mockServer,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_FONT_MISSING/);
        assert.match(err.message, /login--dark/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('every per-screen runtime error must include the selection key context: RENDER_IMAGE_INCOMPLETE', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-context-image-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    const { mockPlaywright, mockServer } = createMockPlaywrightHarness({
      onEvaluate: async () => {
        throw new Error('RENDER_IMAGE_INCOMPLETE: stage image incomplete or zero naturalWidth');
      },
    });

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['food--light'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => mockPlaywright,
          createReferenceServerFn: async () => mockServer,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_IMAGE_INCOMPLETE/);
        assert.match(err.message, /food--light/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('every per-screen runtime error must include the selection key context: RENDER_VIEWPORT_MISMATCH and RENDER_DPR_MISMATCH', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-context-viewport-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    const { mockPlaywright, mockServer } = createMockPlaywrightHarness({
      onEvaluate: async () => {
        throw new Error('RENDER_VIEWPORT_MISMATCH: expected inner dimensions 360x800, got 400x800');
      },
    });

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['today_empty--light'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => mockPlaywright,
          createReferenceServerFn: async () => mockServer,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_VIEWPORT_MISMATCH/);
        assert.match(err.message, /today_empty--light/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('every per-screen runtime error must include the selection key context: RENDER_CLOCK_MISORDER', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-context-clock-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    const { mockPlaywright, mockServer } = createMockPlaywrightHarness({
      onEvaluate: async () => {
        throw new Error("RENDER_CLOCK_MISORDER: expected capture token '1', got 'null'");
      },
    });

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['scan_idle--dark'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => mockPlaywright,
          createReferenceServerFn: async () => mockServer,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_CLOCK_MISORDER/);
        assert.match(err.message, /scan_idle--dark/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('every per-screen runtime error must include the selection key context: settlement failure and missing stage handle', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-context-settlement-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    // Case A: Settlement failure on today--dark
    const harnessSettlement = createMockPlaywrightHarness({
      onEvaluate: async ({ fn }) => {
        const fnStr = typeof fn === 'function' ? fn.toString() : String(fn);
        if (fnStr.includes('heroMatch') || fnStr.includes('cx-harness')) {
          return '999 kcal 96 g 132 g 38 g'; // Mismatched calories
        }
        return '';
      },
    });

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['today--dark'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => harnessSettlement.mockPlaywright,
          createReferenceServerFn: async () => harnessSettlement.mockServer,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_INVALID_INPUT/);
        assert.match(err.message, /today--dark/);
        return true;
      },
    );

    // Case B: Missing stage element handle on profile--light
    const harnessMissingStage = createMockPlaywrightHarness({
      missingStage: true,
    });

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['profile--light'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => harnessMissingStage.mockPlaywright,
          createReferenceServerFn: async () => harnessMissingStage.mockServer,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_INVALID_INPUT/);
        assert.match(err.message, /profile--light/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Finding 7: Successful one-screen render installs and validates via replaceLeafAtomically without staging name rejection
test('driver validates staged content via replaceLeafAtomically and successfully installs a one-screen subset render leaf', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-install-leaf-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    const { mockPlaywright, mockServer } = createMockPlaywrightHarness();

    const { fingerprint } = await computeSourceFingerprint(root);
    const selection = ['food--light'];
    const expectedLeafPath = subsetLeafPath(root, fingerprint, selection);

    const result = await runReferenceRender(
      {
        repoRoot: root,
        selection,
        allowLocalRender: true,
        replace: true,
      },
      {
        importPlaywrightFn: async () => mockPlaywright,
        createReferenceServerFn: async () => mockServer,
      },
    );

    assert.equal(result.valid, true);
    assert.equal(result.leafPath, expectedLeafPath);
    assert.ok(existsSync(expectedLeafPath), 'target leaf directory must exist on disk after installation');
    assert.ok(existsSync(join(expectedLeafPath, 'manifest.json')), 'target leaf must contain manifest.json');
    assert.ok(existsSync(join(expectedLeafPath, 'food--light.png')), 'target leaf must contain food--light.png');
    assert.equal(result.manifest.sourceFingerprint, fingerprint);
    assert.deepEqual(result.manifest.selection, selection);

    const validation = await validateReferenceLeaf({ repoRoot: root, selection });
    assert.equal(validation.valid, true);
    assert.equal(validation.leafPath, expectedLeafPath);
    assert.equal(validation.manifest.sourceFingerprint, fingerprint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Capture-commit race RED: real run 35458207031 failed first ai--dark with
// token null immediately after goto(load), before Babel/React commit.
test('capture commit waits for token screen theme after goto before readiness evaluate and screenshot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-capture-order-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    const { mockPlaywright, mockServer, events } = createMockPlaywrightHarness();

    const result = await runReferenceRender(
      {
        repoRoot: root,
        selection: ['ai--dark'],
        allowLocalRender: true,
        replace: true,
      },
      {
        importPlaywrightFn: async () => mockPlaywright,
        createReferenceServerFn: async () => mockServer,
      },
    );

    assert.equal(result.valid, true);
    assert.ok(events.waitForFunctions.length >= 1, 'production must call waitForFunction for capture commit');
    const kinds = events.timeline.map((entry) => entry.kind);
    const clockInstallIndex = kinds.indexOf('clockInstall');
    const gotoIndex = kinds.indexOf('goto');
    const waitIndex = kinds.indexOf('waitForFunction');
    const firstEvaluateIndex = kinds.indexOf('evaluate');
    const screenshotIndex = kinds.indexOf('screenshot');
    assert.ok(clockInstallIndex !== -1 && gotoIndex !== -1 && waitIndex !== -1 && firstEvaluateIndex !== -1 && screenshotIndex !== -1);
    assert.ok(clockInstallIndex < gotoIndex, 'clockInstall must run before goto');
    assert.ok(waitIndex > gotoIndex, 'waitForFunction must run after goto');
    assert.ok(waitIndex < firstEvaluateIndex, 'waitForFunction must run before first readiness evaluate');
    assert.ok(firstEvaluateIndex < screenshotIndex, 'first readiness evaluate must run before screenshot');
    assert.ok(waitIndex < screenshotIndex, 'waitForFunction must run before screenshot');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('capture commit predicate binds exact token screen theme with expected arg and production timeout', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-capture-predicate-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    const { mockPlaywright, mockServer, events } = createMockPlaywrightHarness();

    const result = await runReferenceRender(
      {
        repoRoot: root,
        selection: ['ai--dark'],
        allowLocalRender: true,
        replace: true,
      },
      {
        importPlaywrightFn: async () => mockPlaywright,
        createReferenceServerFn: async () => mockServer,
      },
    );

    assert.equal(result.valid, true);
    assert.equal(events.waitForFunctions.length, 1);
    const call = events.waitForFunctions[0];
    const predicateSource = String(call.fn);
    assert.match(
      predicateSource,
      /getAttribute\s*\(\s*['"]data-cx-capture-token['"]\s*\)\s*===\s*['"]1['"]/,
      "predicate must prove getAttribute('data-cx-capture-token') === '1'",
    );
    assert.match(
      predicateSource,
      /getAttribute\s*\(\s*['"]data-cx-capture-screen['"]\s*\)\s*===\s*(?:\w+\.)?expectedScreen/,
      "predicate must prove getAttribute('data-cx-capture-screen') === expectedScreen",
    );
    assert.match(
      predicateSource,
      /getAttribute\s*\(\s*['"]data-cx-capture-theme['"]\s*\)\s*===\s*(?:\w+\.)?expectedTheme/,
      "predicate must prove getAttribute('data-cx-capture-theme') === expectedTheme",
    );
    assert.deepEqual(call.arg, { expectedScreen: 'ai', expectedTheme: 'dark' });
    assert.deepEqual(call.options, { timeout: 5000 });
    assert.equal(call.options.timeout, 5000);
    assert.equal(profileModule.CAPTURE_COMMIT_TIMEOUT_MS, 5000);
    assert.equal(call.options.timeout, profileModule.CAPTURE_COMMIT_TIMEOUT_MS);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('delayed capture commit wait is awaited before readiness then render succeeds', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-capture-delayed-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    let waitResolved = false;
    const { mockPlaywright, mockServer, events } = createMockPlaywrightHarness({
      onWaitForFunction: async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
        waitResolved = true;
        return undefined;
      },
      onEvaluate: async ({ fn }) => {
        const fnStr = typeof fn === 'function' ? fn.toString() : String(fn);
        if (fnStr.includes('heroMatch') || fnStr.includes('cx-harness')) {
          return '1420 kcal 96 g 132 g 38 g';
        }
        assert.equal(waitResolved, true, 'production must await delayed waitForFunction before readiness evaluate');
        return '';
      },
    });

    const result = await runReferenceRender(
      {
        repoRoot: root,
        selection: ['ai--dark'],
        allowLocalRender: true,
        replace: true,
      },
      {
        importPlaywrightFn: async () => mockPlaywright,
        createReferenceServerFn: async () => mockServer,
      },
    );

    assert.equal(waitResolved, true, 'delayed waitForFunction callback must have resolved');
    assert.ok(events.waitForFunctions.length >= 1, 'production must call waitForFunction for capture commit');
    assert.equal(result.valid, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('capture commit timeout maps to RENDER_CLOCK_MISORDER with selection key cleanup and no screenshot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-capture-timeout-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    const { mockPlaywright, mockServer, events } = createMockPlaywrightHarness({
      onWaitForFunction: async () => {
        throw new Error('Timeout 5000ms exceeded');
      },
    });

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['ai--dark'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => mockPlaywright,
          createReferenceServerFn: async () => mockServer,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_CLOCK_MISORDER/);
        assert.match(err.message, /5000ms/);
        assert.match(err.message, /ai/);
        assert.match(err.message, /dark/);
        assert.match(err.message, /ai--dark/);
        assert.match(err.message, /\[ai--dark\]/);
        return true;
      },
    );

    assert.equal(events.waitForFunctions.length, 1);
    assert.equal(events.screenshots.length, 0, 'no screenshot on capture commit timeout');
    assert.equal(events.contextsClosed.length, 1, 'per-screen context must close on capture commit timeout');
    assert.equal(events.browserClosed, 1, 'browser must close on capture commit timeout');
    assert.equal(events.serverClosed, 1, 'server must close on capture commit timeout');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('remote fetch during capture commit wait stays RENDER_REMOTE_FETCH not RENDER_CLOCK_MISORDER with selection key cleanup and no screenshot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-capture-remote-during-wait-'));
  try {
    createTestRepoFixture(root);
    initGitRepoWithCommit(root);

    const { mockPlaywright, mockServer, events } = createMockPlaywrightHarness({
      onWaitForFunction: async ({ routeHandler }) => {
        await routeHandler({
          request: () => ({
            method: () => 'GET',
            url: () => 'https://analytics.example.com/tracker.js',
            headers: () => ({}),
          }),
          abort: async () => {},
          fulfill: async () => {},
          continue: async () => {},
        });
        throw new Error('Timeout 5000ms exceeded');
      },
    });

    await assert.rejects(
      runReferenceRender(
        {
          repoRoot: root,
          selection: ['ai--dark'],
          allowLocalRender: true,
          replace: true,
        },
        {
          importPlaywrightFn: async () => mockPlaywright,
          createReferenceServerFn: async () => mockServer,
        },
      ),
      (err) => {
        assert.match(err.message, /RENDER_REMOTE_FETCH/);
        assert.match(err.message, /ai--dark/);
        assert.match(err.message, /\[ai--dark\]/);
        assert.ok(!err.message.includes('RENDER_CLOCK_MISORDER'), 'remote fetch must not be masked as RENDER_CLOCK_MISORDER');
        return true;
      },
    );

    assert.equal(events.waitForFunctions.length, 1);
    assert.equal(events.screenshots.length, 0, 'no screenshot when remote fetch occurs during capture commit wait');
    assert.equal(events.contextsClosed.length, 1, 'per-screen context must close on remote fetch during capture commit wait');
    assert.equal(events.browserClosed, 1, 'browser must close on remote fetch during capture commit wait');
    assert.equal(events.serverClosed, 1, 'server must close on remote fetch during capture commit wait');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('harness/render.mjs waits for capture commit via waitForFunction without sleeps while retaining token assertion', () => {
  const src = readFileSync(new URL('../harness/render.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('waitForFunction'), 'production must call waitForFunction for capture commit');
  assert.ok(src.includes('data-cx-capture-token'), 'production must retain capture token assertion');
  assert.ok(src.includes("'1'"), "production must retain exact token '1' assertion");
  assert.ok(!src.includes('page.waitForTimeout'), 'forbidden page.waitForTimeout sleep must not be present');
  assert.ok(!src.includes('setTimeout'), 'forbidden setTimeout sleep must not be present');
  assert.ok(!src.toLowerCase().includes('sleep'), 'forbidden generic sleep must not be present');
});
