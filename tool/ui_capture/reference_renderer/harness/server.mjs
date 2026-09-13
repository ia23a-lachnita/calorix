import http from 'node:http';
import fs from 'node:fs';
import { join, resolve, sep, extname } from 'node:path';

export const ALLOWLIST_PATH_PREFIXES = Object.freeze([
  '/preview/screens.html',
  '/src/',
  '/assets/food/',
  '/vendor/react.development.js',
  '/vendor/react-dom.development.js',
  '/vendor/babel.min.js',
  '/fonts/',
]);

export const CDN_INTERCEPT_HOSTS = Object.freeze([
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

const PINNED_REACT_URL = 'https://unpkg.com/react@18.3.1/umd/react.development.js';
const PINNED_REACT_DOM_URL =
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js';
const PINNED_BABEL_URL = 'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js';
const GOOGLE_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Geist:wght@200;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap';

const JS_CONTENT_TYPE = 'text/javascript; charset=utf-8';
const CSS_CONTENT_TYPE = 'text/css; charset=utf-8';

const FONT_CASES = Object.freeze([
  Object.freeze({ family: 'Geist', weight: 200, filename: 'geist-latin-200-normal.woff2' }),
  Object.freeze({ family: 'Geist', weight: 400, filename: 'geist-latin-400-normal.woff2' }),
  Object.freeze({ family: 'Geist', weight: 500, filename: 'geist-latin-500-normal.woff2' }),
  Object.freeze({ family: 'Geist', weight: 600, filename: 'geist-latin-600-normal.woff2' }),
  Object.freeze({ family: 'Geist', weight: 700, filename: 'geist-latin-700-normal.woff2' }),
  Object.freeze({ family: 'Geist Mono', weight: 400, filename: 'geist-mono-latin-400-normal.woff2' }),
  Object.freeze({ family: 'Geist Mono', weight: 500, filename: 'geist-mono-latin-500-normal.woff2' }),
  Object.freeze({ family: 'Geist Mono', weight: 600, filename: 'geist-mono-latin-600-normal.woff2' }),
]);

const FONT_PACKAGE_BY_FILENAME = Object.freeze({
  'geist-latin-200-normal.woff2': 'geist',
  'geist-latin-400-normal.woff2': 'geist',
  'geist-latin-500-normal.woff2': 'geist',
  'geist-latin-600-normal.woff2': 'geist',
  'geist-latin-700-normal.woff2': 'geist',
  'geist-mono-latin-400-normal.woff2': 'geist-mono',
  'geist-mono-latin-500-normal.woff2': 'geist-mono',
  'geist-mono-latin-600-normal.woff2': 'geist-mono',
});

function buildGoogleCss() {
  return FONT_CASES.map(
    (font) =>
      `@font-face{font-family:'${font.family}';font-weight:${font.weight};font-display:block;src:url('/fonts/${font.filename}') format(woff2);}`,
  ).join('\n');
}

let cachedGoogleCss;
function googleCssBody() {
  if (cachedGoogleCss === undefined) cachedGoogleCss = buildGoogleCss();
  return cachedGoogleCss;
}

export function resolveCdnResource(cdnUrl, { nodeModulesDir } = {}) {
  if (typeof cdnUrl !== 'string') return null;
  if (cdnUrl === PINNED_REACT_URL) {
    if (typeof nodeModulesDir !== 'string' || nodeModulesDir === '') return null;
    return {
      contentType: JS_CONTENT_TYPE,
      absolutePath: join(nodeModulesDir, 'react/umd/react.development.js'),
    };
  }
  if (cdnUrl === PINNED_REACT_DOM_URL) {
    if (typeof nodeModulesDir !== 'string' || nodeModulesDir === '') return null;
    return {
      contentType: JS_CONTENT_TYPE,
      absolutePath: join(nodeModulesDir, 'react-dom/umd/react-dom.development.js'),
    };
  }
  if (cdnUrl === PINNED_BABEL_URL) {
    if (typeof nodeModulesDir !== 'string' || nodeModulesDir === '') return null;
    return {
      contentType: JS_CONTENT_TYPE,
      absolutePath: join(nodeModulesDir, '@babel/standalone/babel.min.js'),
    };
  }
  if (cdnUrl === GOOGLE_CSS_URL) {
    return { contentType: CSS_CONTENT_TYPE, body: googleCssBody() };
  }
  return null;
}

export function isAllowedServerPath(pathname) {
  if (typeof pathname !== 'string') return false;
  if (!pathname.startsWith('/')) return false;
  if (pathname.includes('\\')) return false;
  if (pathname.includes('?')) return false;
  if (pathname.includes('#')) return false;
  if (pathname.includes('%')) return false;
  if (pathname.includes('//')) return false;
  for (let index = 0; index < pathname.length; index += 1) {
    const code = pathname.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  const segments = pathname.split('/');
  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === '.' || segment === '..') return false;
  }
  if (pathname === '/preview/screens.html') return true;
  if (pathname === '/vendor/react.development.js') return true;
  if (pathname === '/vendor/react-dom.development.js') return true;
  if (pathname === '/vendor/babel.min.js') return true;
  if (pathname.startsWith('/src/')) return true;
  if (pathname.startsWith('/assets/food/')) return true;
  if (pathname.startsWith('/fonts/')) return true;
  return false;
}

function contentTypeForExtension(extension) {
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.jsx':
    case '.js':
      return JS_CONTENT_TYPE;
    case '.css':
      return CSS_CONTENT_TYPE;
    case '.png':
      return 'image/png';
    case '.jpg':
      return 'image/jpeg';
    case '.woff2':
      return 'font/woff2';
    default:
      return null;
  }
}

function hasSymlinkComponent(absolutePath) {
  const parts = absolutePath.split(sep).filter(Boolean);
  let current = sep;
  for (const part of parts) {
    current = join(current, part);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch {
      return false;
    }
    if (stat.isSymbolicLink()) return true;
  }
  return false;
}

function realpathContained(absolutePath, rootReal) {
  let resolved;
  try {
    resolved = fs.realpathSync(absolutePath);
  } catch {
    return false;
  }
  if (resolved === rootReal) return true;
  return resolved.startsWith(`${rootReal}${sep}`);
}

function sendNotFound(res) {
  const body = Buffer.from('Not Found', 'utf8');
  res.writeHead(404, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': body.length,
  });
  res.end(body);
}

function sendMethodNotAllowed(res, includeBody) {
  if (includeBody === false) {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    res.end();
    return;
  }
  const body = Buffer.from('RENDER_REMOTE_FETCH', 'utf8');
  res.writeHead(405, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': body.length,
  });
  res.end(body);
}

export async function createReferenceServer({ repoRoot, nodeModulesDir } = {}) {
  const invalidInputError = () => new Error('RENDER_INVALID_INPUT: invalid server roots');
  let repoRootRaw;
  if (repoRoot === undefined) {
    repoRootRaw = resolve('.');
  } else {
    if (typeof repoRoot !== 'string' || repoRoot.trim() === '') throw invalidInputError();
    repoRootRaw = repoRoot;
  }
  const repoRootAbs = resolve(repoRootRaw);
  let nodeModulesRaw;
  if (nodeModulesDir === undefined) {
    nodeModulesRaw = join(repoRootAbs, 'tool/ui_capture/reference_renderer/node_modules');
  } else {
    if (typeof nodeModulesDir !== 'string' || nodeModulesDir.trim() === '') throw invalidInputError();
    nodeModulesRaw = nodeModulesDir;
  }
  const nodeModulesAbs = resolve(nodeModulesRaw);
  const appRootAbs = join(repoRootAbs, 'docs/design-handoff/placeholder-app');

  function requireRootDir(absPath) {
    let stat;
    try {
      stat = fs.statSync(absPath);
    } catch {
      throw invalidInputError();
    }
    if (!stat.isDirectory()) throw invalidInputError();
    if (hasSymlinkComponent(absPath)) throw invalidInputError();
    try {
      fs.realpathSync(absPath);
    } catch {
      throw invalidInputError();
    }
  }

  requireRootDir(repoRootAbs);
  requireRootDir(appRootAbs);
  requireRootDir(nodeModulesAbs);

  let repoRootReal;
  let appRootReal;
  let nodeModulesReal;
  try {
    repoRootReal = fs.realpathSync(repoRootAbs);
    appRootReal = fs.realpathSync(appRootAbs);
    nodeModulesReal = fs.realpathSync(nodeModulesAbs);
  } catch {
    throw invalidInputError();
  }
  if (appRootReal !== repoRootReal && !appRootReal.startsWith(`${repoRootReal}${sep}`)) {
    throw invalidInputError();
  }

  const server = http.createServer((req, res) => {
    try {
      const method = req.method;
      if (method !== 'GET') {
        if (method === 'HEAD') sendMethodNotAllowed(res, false);
        else sendMethodNotAllowed(res, true);
        return;
      }
      const rawTarget = req.url;
      if (typeof rawTarget !== 'string' || rawTarget === '') {
        sendNotFound(res);
        return;
      }
      if (rawTarget.includes('#')) {
        sendNotFound(res);
        return;
      }
      for (let index = 0; index < rawTarget.length; index += 1) {
        const code = rawTarget.charCodeAt(index);
        if (code <= 0x1f || code === 0x7f) {
          sendNotFound(res);
          return;
        }
      }
      let pathname = rawTarget;
      const queryIndex = rawTarget.indexOf('?');
      if (queryIndex !== -1) {
        pathname = rawTarget.slice(0, queryIndex);
        if (pathname !== '/preview/screens.html') {
          sendNotFound(res);
          return;
        }
      }
      if (!isAllowedServerPath(pathname)) {
        sendNotFound(res);
        return;
      }
      let absolutePath = null;
      let lexicalRoot = null;
      let containmentRoot = null;
      let extension = null;

      if (pathname === '/preview/screens.html') {
        absolutePath = join(appRootAbs, 'preview/screens.html');
        lexicalRoot = appRootAbs;
        containmentRoot = appRootReal;
        extension = '.html';
      } else if (pathname === '/vendor/react.development.js') {
        absolutePath = join(nodeModulesAbs, 'react/umd/react.development.js');
        lexicalRoot = nodeModulesAbs;
        containmentRoot = nodeModulesReal;
        extension = '.js';
      } else if (pathname === '/vendor/react-dom.development.js') {
        absolutePath = join(nodeModulesAbs, 'react-dom/umd/react-dom.development.js');
        lexicalRoot = nodeModulesAbs;
        containmentRoot = nodeModulesReal;
        extension = '.js';
      } else if (pathname === '/vendor/babel.min.js') {
        absolutePath = join(nodeModulesAbs, '@babel/standalone/babel.min.js');
        lexicalRoot = nodeModulesAbs;
        containmentRoot = nodeModulesReal;
        extension = '.js';
      } else if (pathname.startsWith('/src/')) {
        const remainder = pathname.slice('/src/'.length);
        if (remainder === '' || remainder.endsWith('/')) {
          sendNotFound(res);
          return;
        }
        extension = extname(remainder).toLowerCase();
        if (extension !== '.jsx' && extension !== '.js' && extension !== '.css') {
          sendNotFound(res);
          return;
        }
        absolutePath = join(appRootAbs, pathname.slice(1));
        lexicalRoot = appRootAbs;
        containmentRoot = appRootReal;
      } else if (pathname.startsWith('/assets/food/')) {
        const remainder = pathname.slice('/assets/food/'.length);
        if (remainder === '' || remainder.endsWith('/')) {
          sendNotFound(res);
          return;
        }
        extension = extname(remainder).toLowerCase();
        if (extension !== '.png' && extension !== '.jpg') {
          sendNotFound(res);
          return;
        }
        absolutePath = join(appRootAbs, pathname.slice(1));
        lexicalRoot = appRootAbs;
        containmentRoot = appRootReal;
      } else if (pathname.startsWith('/fonts/')) {
        const remainder = pathname.slice('/fonts/'.length);
        if (remainder === '' || remainder.includes('/')) {
          sendNotFound(res);
          return;
        }
        const packageName = Object.hasOwn(FONT_PACKAGE_BY_FILENAME, remainder)
          ? FONT_PACKAGE_BY_FILENAME[remainder]
          : undefined;
        if (packageName === undefined) {
          sendNotFound(res);
          return;
        }
        extension = '.woff2';
        absolutePath = join(nodeModulesAbs, `@fontsource/${packageName}/files/${remainder}`);
        lexicalRoot = nodeModulesAbs;
        containmentRoot = nodeModulesReal;
      } else {
        sendNotFound(res);
        return;
      }

      const contentType = contentTypeForExtension(extension);
      if (contentType === null) {
        sendNotFound(res);
        return;
      }
      const resolvedAbsolute = resolve(absolutePath);
      if (resolvedAbsolute !== lexicalRoot && !resolvedAbsolute.startsWith(`${lexicalRoot}${sep}`)) {
        sendNotFound(res);
        return;
      }
      if (hasSymlinkComponent(resolvedAbsolute)) {
        sendNotFound(res);
        return;
      }
      let stat;
      try {
        stat = fs.statSync(resolvedAbsolute);
      } catch {
        sendNotFound(res);
        return;
      }
      if (!stat.isFile()) {
        sendNotFound(res);
        return;
      }
      if (!realpathContained(resolvedAbsolute, containmentRoot)) {
        sendNotFound(res);
        return;
      }
      let bytes;
      try {
        bytes = fs.readFileSync(resolvedAbsolute);
      } catch {
        sendNotFound(res);
        return;
      }
      res.writeHead(200, { 'content-type': contentType, 'content-length': bytes.length });
      res.end(bytes);
    } catch {
      try {
        sendNotFound(res);
      } catch {
        try {
          res.destroy();
        } catch {
          /* fail closed */
        }
      }
    }
  });

  await new Promise((finish, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', fail);
      finish();
    });
  });
  return server;
}
