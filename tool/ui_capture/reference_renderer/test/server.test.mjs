import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { request as nodeRequest } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ALLOWLIST_PATH_PREFIXES,
  CDN_INTERCEPT_HOSTS,
  resolveCdnResource,
  isAllowedServerPath,
  createReferenceServer,
} from '../harness/server.mjs';

const PINNED_REACT = 'https://unpkg.com/react@18.3.1/umd/react.development.js';
const PINNED_REACT_DOM = 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js';
const PINNED_BABEL = 'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js';
const GOOGLE_CSS = 'https://fonts.googleapis.com/css2?family=Geist:wght@200;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap';

const FONT_CASES = Object.freeze([
  Object.freeze({ family: 'Geist', weight: 200, filename: 'geist-latin-200-normal.woff2', bytes: 'geist-200' }),
  Object.freeze({ family: 'Geist', weight: 400, filename: 'geist-latin-400-normal.woff2', bytes: 'geist-400' }),
  Object.freeze({ family: 'Geist', weight: 500, filename: 'geist-latin-500-normal.woff2', bytes: 'geist-500' }),
  Object.freeze({ family: 'Geist', weight: 600, filename: 'geist-latin-600-normal.woff2', bytes: 'geist-600' }),
  Object.freeze({ family: 'Geist', weight: 700, filename: 'geist-latin-700-normal.woff2', bytes: 'geist-700' }),
  Object.freeze({ family: 'Geist Mono', weight: 400, filename: 'geist-mono-latin-400-normal.woff2', bytes: 'mono-400' }),
  Object.freeze({ family: 'Geist Mono', weight: 500, filename: 'geist-mono-latin-500-normal.woff2', bytes: 'mono-500' }),
  Object.freeze({ family: 'Geist Mono', weight: 600, filename: 'geist-mono-latin-600-normal.woff2', bytes: 'mono-600' }),
]);

const AUTHORITATIVE = Object.freeze({
  html: '<!doctype html><title>authoritative-preview</title>',
  jsx: 'export const authoritativeJsx = true;\n',
  js: 'globalThis.authoritativeJs = true;\n',
  css: '.authoritative { color: rgb(1 2 3); }\n',
  png: Buffer.from('authoritative-png-bytes'),
  jpg: Buffer.from('authoritative-jpg-bytes'),
});

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function fixturePaths(repoRoot, nodeModulesDir) {
  const appRoot = join(repoRoot, 'docs/design-handoff/placeholder-app');
  return {
    appRoot,
    src: join(appRoot, 'src'),
    preview: join(appRoot, 'preview'),
    food: join(appRoot, 'assets/food'),
    react: join(nodeModulesDir, 'react/umd/react.development.js'),
    reactDom: join(nodeModulesDir, 'react-dom/umd/react-dom.development.js'),
    babel: join(nodeModulesDir, '@babel/standalone/babel.min.js'),
  };
}

function seedFixtures(repoRoot, nodeModulesDir) {
  const paths = fixturePaths(repoRoot, nodeModulesDir);
  mkdirSync(paths.src, { recursive: true });
  mkdirSync(paths.preview, { recursive: true });
  mkdirSync(paths.food, { recursive: true });
  writeFileSync(join(paths.preview, 'screens.html'), AUTHORITATIVE.html);
  writeFileSync(join(paths.src, 'app.jsx'), AUTHORITATIVE.jsx);
  writeFileSync(join(paths.src, 'app.js'), AUTHORITATIVE.js);
  writeFileSync(join(paths.src, 'app.css'), AUTHORITATIVE.css);
  writeFileSync(join(paths.src, 'bad.txt'), 'existing-disallowed-source');
  writeFileSync(join(paths.food, 'pic.png'), AUTHORITATIVE.png);
  writeFileSync(join(paths.food, 'photo.jpg'), AUTHORITATIVE.jpg);
  writeFileSync(join(paths.food, 'photo.jpeg'), AUTHORITATIVE.jpg);
  writeFileSync(join(paths.food, 'bad.txt'), 'existing-disallowed-food');

  // Distinct decoys prove the server maps from the repository root to the
  // authoritative placeholder app rather than serving similarly named roots.
  mkdirSync(join(repoRoot, 'preview'), { recursive: true });
  mkdirSync(join(repoRoot, 'src'), { recursive: true });
  mkdirSync(join(repoRoot, 'assets/food'), { recursive: true });
  writeFileSync(join(repoRoot, 'preview/screens.html'), 'ROOT-DECOY-HTML');
  writeFileSync(join(repoRoot, 'src/app.jsx'), 'ROOT-DECOY-JSX');
  writeFileSync(join(repoRoot, 'assets/food/pic.png'), 'ROOT-DECOY-PNG');

  mkdirSync(join(nodeModulesDir, 'react/umd'), { recursive: true });
  mkdirSync(join(nodeModulesDir, 'react-dom/umd'), { recursive: true });
  mkdirSync(join(nodeModulesDir, '@babel/standalone'), { recursive: true });
  writeFileSync(paths.react, 'PINNED-REACT-18.3.1');
  writeFileSync(paths.reactDom, 'PINNED-REACT-DOM-18.3.1');
  writeFileSync(paths.babel, 'PINNED-BABEL-7.29.0');

  for (const font of FONT_CASES) {
    const packageName = font.family === 'Geist' ? 'geist' : 'geist-mono';
    const path = join(nodeModulesDir, `@fontsource/${packageName}/files/${font.filename}`);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, font.bytes);
  }
  for (const [packageName, filename] of [
    ['[object Object]', '__proto__'],
    [String(Object.prototype.toString), 'toString'],
  ]) {
    const path = join(nodeModulesDir, '@fontsource', packageName, 'files', filename);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, 'prototype-poison');
  }
  return paths;
}

function serverAddress(server) {
  assert.ok(server && typeof server.address === 'function' && typeof server.close === 'function');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  assert.equal(address.address, '127.0.0.1');
  assert.equal(address.family, 'IPv4');
  assert.ok(Number.isInteger(address.port) && address.port > 0);
  return address;
}

function request(server, path, { method = 'GET' } = {}) {
  const address = serverAddress(server);
  return new Promise((resolve, reject) => {
    const req = nodeRequest({ host: '127.0.0.1', port: address.port, method, path, agent: false }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function rawRequest(server, requestTarget) {
  const address = serverAddress(server);
  const targetBytes = Buffer.isBuffer(requestTarget) ? requestTarget : Buffer.from(requestTarget);
  const bytes = Buffer.concat([
    Buffer.from('GET '),
    targetBytes,
    Buffer.from(` HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\nConnection: close\r\n\r\n`),
  ]);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: address.port });
    const chunks = [];
    socket.setTimeout(3000, () => socket.destroy(new Error('raw request timed out')));
    socket.on('connect', () => socket.end(bytes));
    socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on('end', () => {
      const response = Buffer.concat(chunks).toString('latin1');
      const match = /^HTTP\/1\.1 (\d{3})/.exec(response);
      if (!match) reject(new Error(`malformed raw response: ${response.slice(0, 80)}`));
      else resolve(Number(match[1]));
    });
    socket.on('error', reject);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function assertInvalidServerOptions(options) {
  let unexpectedServer;
  try {
    unexpectedServer = await createReferenceServer(options);
  } catch (error) {
    assert.match(String(error?.message), /RENDER_INVALID_INPUT/);
    return;
  }
  try {
    assert.fail('expected createReferenceServer to reject invalid roots');
  } finally {
    if (unexpectedServer?.listening) await closeServer(unexpectedServer);
  }
}

async function withServer(run) {
  const repoRoot = tempDir('reference-server-repo-');
  const nodeModulesDir = tempDir('reference-server-node-');
  let server;
  try {
    const paths = seedFixtures(repoRoot, nodeModulesDir);
    server = await createReferenceServer({ repoRoot, nodeModulesDir });
    serverAddress(server);
    await run({ server, repoRoot, nodeModulesDir, paths });
  } finally {
    if (server?.listening) await closeServer(server);
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(nodeModulesDir, { recursive: true, force: true });
  }
}

function exactlyOneOf(result) {
  assert.ok(result);
  assert.equal(result.absolutePath !== undefined, result.body === undefined);
  assert.equal(result.body !== undefined, result.absolutePath === undefined);
}

function parseFontFaces(css) {
  const blocks = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => match[1]);
  return blocks.map((block) => {
    const family = /font-family:\s*(['"])(.*?)\1\s*;/.exec(block)?.[2];
    const weight = Number(/font-weight:\s*(\d+)\s*;/.exec(block)?.[1]);
    const display = /font-display:\s*([a-z-]+)\s*;/.exec(block)?.[1];
    const source = /src:\s*url\((['"]?)(\/fonts\/[^'"\s)]+)\1\)\s*format\((['"]?)woff2\3\)\s*;/.exec(block);
    assert.ok(family && Number.isInteger(weight) && display && source, `invalid font face: ${block}`);
    return { family, weight, url: source[2], display };
  });
}

test('exports exact frozen allowlist and interception hosts', () => {
  assert.deepEqual([...ALLOWLIST_PATH_PREFIXES], [
    '/preview/screens.html',
    '/src/',
    '/assets/food/',
    '/vendor/react.development.js',
    '/vendor/react-dom.development.js',
    '/vendor/babel.min.js',
    '/fonts/',
  ]);
  assert.deepEqual([...CDN_INTERCEPT_HOSTS], ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);
  assert.ok(Object.isFrozen(ALLOWLIST_PATH_PREFIXES));
  assert.ok(Object.isFrozen(CDN_INTERCEPT_HOSTS));
});

test('pathname allowlist accepts routes but rejects URLs and ambiguous path syntax', () => {
  for (const path of [
    '/preview/screens.html',
    '/src/cx-shell.jsx',
    '/assets/food/pic.png',
    '/vendor/react.development.js',
    '/vendor/react-dom.development.js',
    '/vendor/babel.min.js',
    '/fonts/geist-latin-400-normal.woff2',
  ]) assert.equal(isAllowedServerPath(path), true, path);

  for (const path of [
    '', '/', 'src/app.jsx',
    'http://127.0.0.1:9/preview/screens.html',
    'https://unpkg.com/react@18.3.1/umd/react.development.js',
    '/preview/../preview/screens.html', '/src/../../etc/passwd',
    '/src/%2e%2e/app.jsx', '/src/%252e%252e/app.jsx', '/src/%2fetc/passwd',
    '/src//app.jsx', '/src\\..\\app.jsx', '/src/..\\app.jsx',
    '/src/\0app.jsx', '/src/\x1fapp.jsx', '/src/\x7fapp.jsx', '/src/%ZZ.jsx',
    '/preview/screens.html?x=1', '/preview/screens.html#fragment',
    '/unknown', '/preview/other.html',
  ]) assert.equal(isAllowedServerPath(path), false, JSON.stringify(path));
});

test('resolves only exact pinned JavaScript CDN resources to node_modules paths', () => {
  const cases = [
    [PINNED_REACT, '/pkg/react/umd/react.development.js'],
    [PINNED_REACT_DOM, '/pkg/react-dom/umd/react-dom.development.js'],
    [PINNED_BABEL, '/pkg/@babel/standalone/babel.min.js'],
  ];
  for (const [url, expectedPath] of cases) {
    const result = resolveCdnResource(url, { nodeModulesDir: '/pkg' });
    exactlyOneOf(result);
    assert.equal(result.absolutePath, expectedPath);
    assert.match(result.contentType, /javascript/);
  }

  for (const url of [
    'https://example.com/evil.js',
    'https://unpkg.com/react@99.0.0/umd/react.development.js',
    'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
    'https://unpkg.com/react-dom@18.2.0/umd/react-dom.development.js',
    'https://unpkg.com/@babel/standalone@7.28.0/babel.min.js',
    'https://fonts.gstatic.com/s/geist/abc/geist-latin-400-normal.woff2',
    'https://fonts.gstatic.com/evil.woff2',
  ]) assert.equal(resolveCdnResource(url, { nodeModulesDir: '/pkg' }), null, url);
});

test('returns deterministic Google CSS with the exact ordered eight local font faces', () => {
  const first = resolveCdnResource(GOOGLE_CSS, { nodeModulesDir: '/pkg' });
  const second = resolveCdnResource(GOOGLE_CSS, { nodeModulesDir: '/pkg' });
  exactlyOneOf(first);
  assert.equal(first.absolutePath, undefined);
  assert.match(first.contentType, /css/);
  assert.equal(String(first.body), String(second.body));
  const css = String(first.body);
  assert.deepEqual(parseFontFaces(css), FONT_CASES.map((font) => ({
    family: font.family,
    weight: font.weight,
    url: `/fonts/${font.filename}`,
    display: 'block',
  })));
  assert.equal((css.match(/@font-face/g) ?? []).length, 8);
  assert.equal(css.replace(/@font-face\s*\{[^}]*\}/g, '').trim(), '');
  assert.doesNotMatch(css, /https?:|fonts\.gstatic\.com|\/pkg\//);

  for (const url of [
    `${GOOGLE_CSS}2`,
    GOOGLE_CSS.replace('display=swap', 'display=block'),
    GOOGLE_CSS.replace('200;400;500;600;700', '400;500;600;700'),
    GOOGLE_CSS.replace('Geist+Mono', 'Roboto'),
    GOOGLE_CSS.replace('fonts.googleapis.com', 'fonts.googleapis.example'),
  ]) assert.equal(resolveCdnResource(url, { nodeModulesDir: '/pkg' }), null, url);
});

test('binds the returned node:http Server to loopback on an ephemeral IPv4 port', async () => {
  await withServer(async ({ server }) => {
    const address = serverAddress(server);
    assert.equal(server.listening, true);
    assert.ok(address.port > 0);
    assert.equal((await request(server, '/unknown')).status, 404);
  });
});

test('defaults omitted roots canonically from the repository working directory', async () => {
  const container = tempDir('reference-server-roots-');
  const repoRoot = join(container, 'repo');
  const defaultNodeModules = join(repoRoot, 'tool/ui_capture/reference_renderer/node_modules');
  let server;
  const previousCwd = process.cwd();
  try {
    mkdirSync(repoRoot, { recursive: true });
    seedFixtures(repoRoot, defaultNodeModules);
    process.chdir(repoRoot);
    server = await createReferenceServer();
    assert.equal((await request(server, '/preview/screens.html')).body.toString(), AUTHORITATIVE.html);
  } finally {
    process.chdir(previousCwd);
    if (server?.listening) await closeServer(server);
    rmSync(container, { recursive: true, force: true });
  }
});

test('rejects invalid, missing, and non-directory roots before binding', async () => {
  const container = tempDir('reference-server-invalid-roots-');
  const repoRoot = join(container, 'repo');
  const nodeModulesDir = join(container, 'node_modules');
  const missing = join(container, 'missing');
  const notDirectory = join(container, 'not-a-directory');
  try {
    mkdirSync(repoRoot, { recursive: true });
    seedFixtures(repoRoot, nodeModulesDir);
    writeFileSync(notDirectory, 'file');
    for (const options of [
      { repoRoot: '', nodeModulesDir },
      { repoRoot: '   ', nodeModulesDir },
      { repoRoot: missing, nodeModulesDir },
      { repoRoot: notDirectory, nodeModulesDir },
      { repoRoot, nodeModulesDir: '' },
      { repoRoot, nodeModulesDir: missing },
      { repoRoot, nodeModulesDir: notDirectory },
    ]) await assertInvalidServerOptions(options);
  } finally {
    rmSync(container, { recursive: true, force: true });
  }
});

test('rejects repo and node_modules roots containing symlink components before binding', async () => {
  const container = tempDir('reference-server-symlink-roots-');
  const repoRoot = join(container, 'repo');
  const nodeModulesDir = join(container, 'node_modules');
  const repoAlias = join(container, 'repo-alias');
  const nodeAlias = join(container, 'node-alias');
  try {
    mkdirSync(repoRoot, { recursive: true });
    seedFixtures(repoRoot, nodeModulesDir);
    symlinkSync(repoRoot, repoAlias, 'dir');
    symlinkSync(nodeModulesDir, nodeAlias, 'dir');
    await assertInvalidServerOptions({ repoRoot: repoAlias, nodeModulesDir });
    await assertInvalidServerOptions({ repoRoot, nodeModulesDir: nodeAlias });
  } finally {
    rmSync(container, { recursive: true, force: true });
  }
});

test('serves exact authoritative bytes and MIME types rather than root decoys', async () => {
  await withServer(async ({ server }) => {
    const cases = [
      ['/preview/screens.html', 'text/html', Buffer.from(AUTHORITATIVE.html)],
      ['/src/app.jsx', 'javascript', Buffer.from(AUTHORITATIVE.jsx)],
      ['/src/app.js', 'javascript', Buffer.from(AUTHORITATIVE.js)],
      ['/src/app.css', 'text/css', Buffer.from(AUTHORITATIVE.css)],
      ['/assets/food/pic.png', 'image/png', AUTHORITATIVE.png],
      ['/assets/food/photo.jpg', 'image/jpeg', AUTHORITATIVE.jpg],
      ['/vendor/react.development.js', 'javascript', Buffer.from('PINNED-REACT-18.3.1')],
      ['/vendor/react-dom.development.js', 'javascript', Buffer.from('PINNED-REACT-DOM-18.3.1')],
      ['/vendor/babel.min.js', 'javascript', Buffer.from('PINNED-BABEL-7.29.0')],
    ];
    for (const [path, mime, expected] of cases) {
      const response = await request(server, path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers['content-type'] ?? '', new RegExp(mime.replace('/', '\\/'), 'i'));
      assert.deepEqual(response.body, expected, path);
    }
  });
});

test('serves exactly the eight pinned font routes from node_modules', async () => {
  await withServer(async ({ server }) => {
    for (const font of FONT_CASES) {
      const response = await request(server, `/fonts/${font.filename}`);
      assert.equal(response.status, 200, font.filename);
      assert.match(response.headers['content-type'] ?? '', /font\/woff2/i);
      assert.deepEqual(response.body, Buffer.from(font.bytes));
    }
    for (const path of [
      '/fonts/', '/fonts/custom.css', '/fonts/test.woff2',
      '/fonts/geist-latin-900-normal.woff2',
      '/fonts/geist-mono-latin-700-normal.woff2',
      '/fonts/toString', '/fonts/__proto__',
      '/fonts/geist-latin-400-normal.woff2/extra',
    ]) assert.equal((await request(server, path)).status, 404, path);
  });
});

test('returns 404 for unknown, directory, missing, and existing disallowed-extension routes', async () => {
  await withServer(async ({ server }) => {
    for (const path of [
      '/', '/unknown', '/preview/other.html', '/src/', '/assets/food/',
      '/src/missing.js', '/assets/food/missing.png',
      '/src/bad.txt', '/assets/food/bad.txt', '/assets/food/photo.jpeg', '/etc/passwd',
    ]) assert.equal((await request(server, path)).status, 404, path);
  });
});

test('rejects every non-GET method with 405 and stable RENDER_REMOTE_FETCH code', async () => {
  await withServer(async ({ server }) => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const response = await request(server, '/preview/screens.html', { method });
      assert.equal(response.status, 405, method);
      assert.match(response.body.toString(), /RENDER_REMOTE_FETCH/);
    }
    const head = await request(server, '/preview/screens.html', { method: 'HEAD' });
    assert.equal(head.status, 405);
    assert.equal(head.body.length, 0);
  });
});

test('rejects raw traversal and malformed targets before URL normalization', async () => {
  await withServer(async ({ server }) => {
    for (const target of [
      '/src/../src/app.jsx',
      '/src/%2e%2e/app.jsx',
      '/src/%252e%252e/app.jsx',
      '/src/%2f..%2fapp.jsx',
      '/src//app.jsx',
      '/src\\..\\src\\app.jsx',
      '/src/..\\src/app.jsx',
      '/src/%ZZ.jsx',
    ]) assert.equal(await rawRequest(server, target), 404, target);

    const nulTarget = Buffer.concat([Buffer.from('/src/'), Buffer.from([0]), Buffer.from('app.jsx')]);
    assert.ok([400, 404].includes(await rawRequest(server, nulTarget)));
    assert.equal((await request(server, '/src/app.jsx')).status, 200);
  });
});

test('allows a raw capture query only on the exact preview pathname', async () => {
  await withServer(async ({ server }) => {
    assert.equal(await rawRequest(
      server,
      '/preview/screens.html?screen=today&mode=dark&capture=1&profile=samsung-s20fe',
    ), 200);
    assert.equal(await rawRequest(server, '/src/app.jsx?cache=1'), 404);
    assert.equal(await rawRequest(server, '/preview/screens.html#fragment'), 404);
  });
});

test('rejects reachable repo and node_modules symlink escapes', async () => {
  const repoRoot = tempDir('reference-server-symlink-repo-');
  const nodeModulesDir = tempDir('reference-server-symlink-node-');
  const outside = tempDir('reference-server-symlink-outside-');
  let server;
  try {
    const paths = seedFixtures(repoRoot, nodeModulesDir);
    writeFileSync(join(outside, 'escape.jsx'), 'outside-jsx');
    mkdirSync(join(outside, 'food'), { recursive: true });
    writeFileSync(join(outside, 'food/escape.png'), 'outside-png');
    writeFileSync(join(outside, 'react.js'), 'outside-react');
    symlinkSync(join(paths.src, 'app.jsx'), join(paths.src, 'inside-link.jsx'));
    symlinkSync(join(outside, 'escape.jsx'), join(paths.src, 'escape.jsx'));
    symlinkSync(join(outside, 'food'), join(paths.food, 'escape-dir'));
    unlinkSync(paths.react);
    symlinkSync(join(outside, 'react.js'), paths.react);

    server = await createReferenceServer({ repoRoot, nodeModulesDir });
    for (const path of ['/src/inside-link.jsx', '/src/escape.jsx', '/assets/food/escape-dir/escape.png', '/vendor/react.development.js']) {
      assert.equal((await request(server, path)).status, 404, path);
    }
  } finally {
    if (server?.listening) await closeServer(server);
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(nodeModulesDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('realpath containment independently rejects ordinary files whose resolved paths escape', () => {
  const repoRoot = tempDir('reference-server-realpath-repo-');
  const nodeModulesDir = tempDir('reference-server-realpath-node-');
  const outside = tempDir('reference-server-realpath-outside-');
  try {
    const paths = seedFixtures(repoRoot, nodeModulesDir);
    const outsideJsx = join(outside, 'ordinary.jsx');
    const outsideReact = join(outside, 'ordinary-react.js');
    writeFileSync(outsideJsx, 'outside-jsx');
    writeFileSync(outsideReact, 'outside-react');
    const moduleUrl = `${new URL('../harness/server.mjs', import.meta.url).href}?realpath-containment`;
    const script = `
      import fs from 'node:fs';
      import { request } from 'node:http';
      import { syncBuiltinESMExports } from 'node:module';
      import { resolve } from 'node:path';
      const original = fs.realpathSync;
      const redirects = new Map(${JSON.stringify([
        [join(paths.src, 'app.jsx'), outsideJsx],
        [paths.react, outsideReact],
      ])}.map(([from, to]) => [resolve(from), to]));
      function patched(path, options) {
        const redirected = redirects.get(resolve(String(path)));
        if (redirected) return options === 'buffer' || options?.encoding === 'buffer' ? Buffer.from(redirected) : redirected;
        return original(path, options);
      }
      patched.native = original.native;
      fs.realpathSync = patched;
      syncBuiltinESMExports();
      const { createReferenceServer } = await import(${JSON.stringify(moduleUrl)});
      const server = await createReferenceServer({ repoRoot: ${JSON.stringify(repoRoot)}, nodeModulesDir: ${JSON.stringify(nodeModulesDir)} });
      const address = server.address();
      const get = (path) => new Promise((resolveResult, reject) => {
        const req = request({ host: '127.0.0.1', port: address.port, path, agent: false }, (response) => {
          response.resume();
          response.on('end', () => resolveResult(response.statusCode));
        });
        req.on('error', reject);
        req.end();
      });
      const statuses = [await get('/src/app.jsx'), await get('/vendor/react.development.js')];
      await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
      process.stdout.write(JSON.stringify(statuses));
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(child.status, 0, `child failed:\nstdout=${child.stdout}\nstderr=${child.stderr}`);
    assert.deepEqual(JSON.parse(child.stdout), [404, 404]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(nodeModulesDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
