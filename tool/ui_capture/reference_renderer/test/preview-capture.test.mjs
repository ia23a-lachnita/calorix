import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const previewPath = new URL(
  '../../../../docs/design-handoff/placeholder-app/preview/screens.html',
  import.meta.url,
);
const html = readFileSync(previewPath, 'utf8');

function withoutComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1');
}

function scriptBlocks(source) {
  return [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((match) => ({
    attributes: match[1],
    source: match[2],
  }));
}

function styleSource(source) {
  return [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1])
    .join('\n');
}

const inspectedHtml = withoutComments(html);
const scripts = scriptBlocks(inspectedHtml);
const bootstrapBlocks = scripts.filter(({ attributes }) =>
  !/\bsrc\s*=/i.test(attributes) && !/\btype\s*=\s*["']text\/babel["']/i.test(attributes),
);
assert.equal(bootstrapBlocks.length, 1, 'preview must have exactly one plain inline bootstrap');
const bootstrap = bootstrapBlocks[0].source;
const babel = scripts
  .filter(({ attributes }) => /\btype\s*=\s*["']text\/babel["']/i.test(attributes))
  .map(({ source }) => withoutComments(source))
  .join('\n');
const css = withoutComments(styleSource(inspectedHtml));

function compact(value) {
  return value.replace(/\s+/g, ' ').trim();
}

const cssRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: compact(match[1]),
  body: match[2],
}));

function ruleDeclarations(selector) {
  const blocks = cssRules.filter((rule) => rule.selector === selector);
  assert.equal(blocks.length, 1, `${selector} must have one exact selector block`);
  const declarations = blocks[0].body
      .split(';')
      .map((declaration) => declaration.split(/:(.*)/s))
      .filter(([property, value]) => property?.trim() && value !== undefined)
      .map(([property, value]) => [property.trim(), compact(value)]);
  return declarations;
}

function expectDeclarations(selector, expected) {
  const declarations = ruleDeclarations(selector);
  for (const [property, value] of Object.entries(expected)) {
    const values = declarations
      .filter(([declaredProperty]) => declaredProperty === property)
      .map(([, declaredValue]) => declaredValue);
    assert.deepEqual([...new Set(values)], [value], `${selector} must set exactly one non-conflicting ${property}`);
  }
}

function vmWindow(search) {
  const classNames = new Set();
  const resizeListeners = [];
  const elements = {
    fit: { style: {} },
    stage: { style: {} },
    bar: { style: {} },
  };
  const document = {
    body: {
      classList: {
        add(name) { classNames.add(name); },
        remove(name) { classNames.delete(name); },
        contains(name) { return classNames.has(name); },
      },
      style: {},
    },
    getElementById(id) { return elements[id] ?? null; },
    querySelectorAll() { return []; },
    addEventListener(event, listener) {
      if (event === 'resize') resizeListeners.push(listener);
    },
  };
  const sandbox = {
    URLSearchParams,
    console,
    document,
    location: {
      href: `http://127.0.0.1/preview/screens.html${search}`,
      pathname: '/preview/screens.html',
      search,
    },
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener(event, listener) {
      if (event === 'resize') resizeListeners.push(listener);
    },
  };
  const context = vm.createContext(sandbox);
  context.window = context;
  context.self = context;
  context.globalThis = context;
  context.__resizeListeners = resizeListeners;
  vm.runInContext(bootstrap, context, { filename: 'screens-bootstrap.js' });
  return context;
}

function expectState(search, expected) {
  const window = vmWindow(search);
  assert.equal(window.CX_STATIC, expected.static, `${search}: CX_STATIC`);
  assert.equal(window.document.body.classList.contains('capture'), expected.capture, `${search}: capture class`);
  assert.equal(
    window.document.body.classList.contains('profile-samsung-s20fe'),
    expected.derived,
    `${search}: derived profile class`,
  );
  assert.equal(window.document.getElementById('fit').style.transform, expected.transform, `${search}: fit transform`);
  assert.equal(typeof window.setHalf, 'function', `${search}: legacy helper remains defined`);
  if (expected.derived) {
    const profile = window.CX_CAPTURE_PROFILE;
    assert.ok(profile, `${search}: derived profile is exposed`);
    assert.equal(Object.isFrozen(profile), true, `${search}: derived profile is frozen`);
    assert.deepEqual(
      { profile: profile.profile, width: profile.width, height: profile.height, scale: profile.scale },
      { profile: 'samsung-s20fe', width: 360, height: 800, scale: 1 },
    );
    window.setHalf(1);
    assert.equal(window.document.getElementById('fit').style.transform, 'none', `${search}: setHalf cannot restore centering`);
  } else {
    assert.equal(window.CX_CAPTURE_PROFILE, undefined, `${search}: no derived profile leakage`);
    if (!expected.capture) {
      window.innerWidth = 360;
      window.innerHeight = 800;
      for (const listener of window.__resizeListeners) listener();
      assert.equal(
        window.document.getElementById('fit').style.transform,
        `translate(-50%,-50%) scale(${Math.min(360 / 402, 800 / 874) * 0.96})`,
        `${search}: resize recomputes interactive fit`,
      );
    } else {
      window.setHalf(1);
      assert.equal(
        window.document.getElementById('fit').style.transform,
        'translateX(-50%) translateY(-437px)',
        `${search}: legacy setHalf remains centered`,
      );
    }
  }
}

test('capture bootstrap has the exact five-state profile boundary', () => {
  const interactiveTransform = `translate(-50%,-50%) scale(${Math.min(1024 / 402, 768 / 874) * 0.96})`;
  expectState('', {
    static: false,
    capture: false,
    derived: false,
    transform: interactiveTransform,
  });
  expectState('?capture=1', {
    static: true,
    capture: true,
    derived: false,
    transform: 'translateX(-50%) translateY(0px)',
  });
  expectState('?capture=1&profile=unknown', {
    static: true,
    capture: true,
    derived: false,
    transform: 'translateX(-50%) translateY(0px)',
  });
  expectState('?profile=samsung-s20fe', {
    static: false,
    capture: false,
    derived: false,
    transform: interactiveTransform,
  });
  expectState('?capture=0&profile=samsung-s20fe', {
    static: false,
    capture: false,
    derived: false,
    transform: interactiveTransform,
  });
  expectState('?capture=1&profile=samsung-s20fe', {
    static: true,
    capture: true,
    derived: true,
    transform: 'none',
  });
});

test('capture CSS keeps the canonical rules and resets each derived element', () => {
  expectDeclarations('#fit', {
    position: 'absolute',
    left: '50%',
    top: '0',
    width: '402px',
    height: '874px',
  });
  expectDeclarations('#stage', {
    width: '402px',
    height: '874px',
    'box-shadow': '0 0 0 1px #2a2d33',
  });
  expectDeclarations('body.capture.profile-samsung-s20fe #fit', {
    left: '0',
    top: '0',
    width: '360px',
    height: '800px',
    margin: '0',
    transform: 'none !important',
  });
  expectDeclarations('body.capture.profile-samsung-s20fe #stage', {
    width: '360px',
    height: '800px',
    'box-shadow': 'none',
    border: '0',
  });
});

test('selected screen query is validated after saved/default state and before first render', () => {
  const saved = babel.indexOf("localStorage.getItem('cx-harness')");
  const screenUpdate = /const\s+qScreen\s*=\s*[^;]*\.get\(\s*['"]screen['"]\s*\)\s*;[\s\S]{0,300}?if\s*\(\s*Object\.hasOwn\(\s*SCREENS\s*,\s*qScreen\s*\)\s*\)\s*\{?\s*CUR\.id\s*=\s*qScreen\s*;?/;
  const modeUpdate = /const\s+qMode\s*=\s*[^;]*\.get\(\s*['"]mode['"]\s*\)\s*;[\s\S]{0,300}?if\s*\(\s*qMode\s*===\s*['"]dark['"]\s*\|\|\s*qMode\s*===\s*['"]light['"]\s*\)\s*\{?\s*CUR\.mode\s*=\s*qMode\s*;?/;
  const screen = babel.search(screenUpdate);
  const mode = babel.search(modeUpdate);
  const firstRender = babel.lastIndexOf('window.showScreen(CUR.id, CUR.mode)');
  assert.ok(saved >= 0, 'saved/default state is present');
  assert.ok(screen > saved, 'own-key qScreen guard assigns CUR.id after saved/default fallback');
  assert.ok(mode > saved, 'dark/light qMode guard assigns CUR.mode after saved/default fallback');
  assert.ok(firstRender > Math.max(screen, mode), 'both validated query assignments precede the initial render');
});

test('derived render uses a direct-child single-commit CaptureBoundary', () => {
  const boundaryStart = babel.search(/function\s+CaptureBoundary\s*\(\s*\{\s*screen\s*,\s*theme\s*,\s*children\s*\}\s*\)/);
  const boundaryEnd = babel.indexOf('window.showScreen', boundaryStart);
  const boundary = babel.slice(boundaryStart, boundaryEnd);
  const attributes = [...babel.matchAll(/data-cx-capture-([a-z-]+)/g)].map((match) => match[1]);
  assert.ok(boundaryStart >= 0 && boundaryEnd > boundaryStart, 'CaptureBoundary is defined before showScreen');
  assert.equal((boundary.match(/React\.useLayoutEffect/g) ?? []).length, 1, 'boundary has one React layout effect');
  const effect = boundary.match(/React\.useLayoutEffect\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[\s*screen\s*,\s*theme\s*\]\s*\)/);
  assert.ok(effect, 'boundary effect has exact screen/theme dependencies');
  assert.match(effect[1], /document\.getElementById\(\s*['"]stage['"]\s*\)/, 'effect looks up stage');
  assert.match(effect[1], /setAttribute\(\s*['"]data-cx-capture-screen['"]\s*,\s*screen\s*\)/, 'effect publishes screen value');
  assert.match(effect[1], /setAttribute\(\s*['"]data-cx-capture-theme['"]\s*,\s*theme\s*\)/, 'effect publishes theme value');
  assert.match(effect[1], /setAttribute\(\s*['"]data-cx-capture-token['"]\s*,\s*['"]1['"]\s*\)/, 'effect publishes constant token 1');
  assert.match(boundary, /return\s+children\s*;/, 'boundary returns the selected child directly');
  assert.deepEqual([...new Set(attributes)].sort(), ['screen', 'theme', 'token'], 'only the three capture attributes are published');
  const renderSite = babel.slice(boundaryEnd);
  const render = renderSite.match(/root\.render\(\s*IS_DERIVED_CAPTURE\s*\?\s*<CaptureBoundary\s+screen=\{CUR\.id\}\s+theme=\{CUR\.mode\}\s*>\s*\{?([A-Za-z_$][\w$]*|SCREENS\[CUR\.id\]\(CUR\.mode\))\}?\s*<\/CaptureBoundary>\s*:\s*([A-Za-z_$][\w$]*|SCREENS\[CUR\.id\]\(CUR\.mode\))\s*\)/);
  assert.ok(render, 'root.render conditionally wraps only the derived selected screen');
  assert.equal(render[1], render[2], 'both render branches use the same selected child');
  if (render[1] !== 'SCREENS[CUR.id](CUR.mode)') {
    assert.match(renderSite, new RegExp(`(?:const|let)\\s+${render[1]}\\s*=\\s*SCREENS\\[CUR\\.id\\]\\(CUR\\.mode\\)`), 'selected variable is exactly the selected screen');
  }
});

test('authoritative preview remains the sole capture shell', () => {
  assert.equal(previewPath.pathname.endsWith('/docs/design-handoff/placeholder-app/preview/screens.html'), true);
  assert.equal(inspectedHtml.includes('stage.html'), false, 'no cloned stage shell');
});
