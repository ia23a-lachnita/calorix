import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCaptureUrl,
  normalizeTodayText,
  todaySettlementExpectation,
  assertTodaySettlement,
  runReferenceRender,
} from '../harness/render.mjs';
import { FROZEN_CHROMIUM_FLAGS } from '../harness/profile.mjs';
import { clockAdvanceMsFor } from '../harness/settlement.mjs';
import { parseCliArgs } from '../bin/render.mjs';

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
  let serverCreated = false;
  let playwrightImported = false;

  await assert.rejects(
    async () => {
      await runReferenceRender(
        {
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
            return true;
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
