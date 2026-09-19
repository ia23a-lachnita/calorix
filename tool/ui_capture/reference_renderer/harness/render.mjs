import fs from 'node:fs';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  assertLocalRenderAllowed,
  BROWSER_LOCALE,
  BROWSER_TIMEZONE,
  DEVICE_SCALE_FACTOR,
  FROZEN_CHROMIUM_FLAGS,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from './profile.mjs';
import { clockAdvanceMsFor } from './settlement.mjs';
import {
  CDN_INTERCEPT_HOSTS,
  createReferenceServer,
  isAllowedServerPath,
  resolveCdnResource,
} from './server.mjs';
import {
  buildDerivedManifest,
  computeSourceFingerprint,
  fullLeafPath,
  readInventorySelection,
  replaceLeafAtomically,
  subsetLeafPath,
  validateReferenceLeaf,
} from './manifest.mjs';

const KNOWN_STATES = Object.freeze([
  'loading',
  'login',
  'permission',
  'scan_idle',
  'scan_capturing',
  'processing',
  'review',
  'manual',
  'today',
  'today_empty',
  'food',
  'food_edit',
  'history_week',
  'history_month',
  'goals',
  'goals_select',
  'ai',
  'ai_history',
  'profile',
]);

const KNOWN_MODES = Object.freeze(['dark', 'light']);

export function buildCaptureUrl(serverBaseUrl, stateId, mode) {
  if (typeof serverBaseUrl !== 'string' || serverBaseUrl.trim() === '') {
    throw new Error('RENDER_INVALID_INPUT: serverBaseUrl must be a non-empty string');
  }
  if (!KNOWN_STATES.includes(stateId)) {
    throw new Error(`RENDER_INVALID_INPUT: unknown state ID '${stateId}'`);
  }
  if (!KNOWN_MODES.includes(mode)) {
    throw new Error(`RENDER_INVALID_INPUT: invalid mode '${mode}' for state '${stateId}'`);
  }
  const cleanBase = serverBaseUrl.replace(/\/+$/, '');
  return `${cleanBase}/preview/screens.html?screen=${encodeURIComponent(stateId)}&mode=${mode}&capture=1&profile=samsung-s20fe`;
}

export function normalizeTodayText(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text
    .replace(/[\u202F,]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function todaySettlementExpectation(stateId) {
  if (stateId === 'today') {
    return {
      hero: '1420',
      macros: ['96', '132', '38'],
      requiresKcal: true,
      requiresG: true,
    };
  }
  if (stateId === 'today_empty') {
    return {
      hero: '0',
      macros: ['0', '0', '0'],
      requiresKcal: true,
      requiresG: true,
    };
  }
  throw new Error(`RENDER_INVALID_INPUT: unknown stateId '${String(stateId)}' for today settlement`);
}

export function assertTodaySettlement(domText, stateId) {
  const expectation = todaySettlementExpectation(stateId);
  if (typeof domText !== 'string' || domText.trim() === '') {
    throw new Error('RENDER_INVALID_INPUT: empty or invalid settlement text');
  }
  const normalized = normalizeTodayText(domText);
  const match = normalized.match(/^(\d+)\s+kcal\s+(.*)$/);
  if (!match) {
    throw new Error(`RENDER_INVALID_INPUT: settlement text '${normalized}' does not match '<hero> kcal <macros>'`);
  }
  const hero = match[1];
  if (hero !== expectation.hero) {
    throw new Error(`RENDER_INVALID_INPUT: hero calorie mismatch: expected ${expectation.hero}, got ${hero}`);
  }
  const rest = match[2].trim();
  const tokens = rest.split(/\s+/);
  if (tokens.length !== 6) {
    throw new Error(`RENDER_INVALID_INPUT: macro tokens length mismatch: expected 6 tokens, got ${tokens.length}`);
  }
  for (let i = 0; i < 3; i += 1) {
    const val = tokens[i * 2];
    const unit = tokens[i * 2 + 1];
    if (unit !== 'g') {
      throw new Error(`RENDER_INVALID_INPUT: macro ${i} unit must be 'g', got '${unit}'`);
    }
    if (val !== expectation.macros[i]) {
      throw new Error(`RENDER_INVALID_INPUT: macro ${i} value mismatch: expected ${expectation.macros[i]}, got ${val}`);
    }
  }
}

function resolveCanonicalRepoRoot(repoRoot, cwdFn, existsSyncFn) {
  if (typeof repoRoot === 'string' && repoRoot.trim() !== '') {
    return resolve(repoRoot);
  }
  const currentCwd = cwdFn ? cwdFn() : process.cwd();
  const checkPath = join(currentCwd, 'docs/design-handoff/placeholder-app');
  const hasApp = existsSyncFn ? existsSyncFn(checkPath) : fs.existsSync(checkPath);
  if (hasApp) {
    return resolve(currentCwd);
  }
  return resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
}

function isRelevantGitPath(path) {
  if (typeof path !== 'string') return false;
  const normalized = path.replace(/\\/g, '/').replace(/^"|"$/g, '');
  if (normalized === 'docs/design-handoff/placeholder-app/visual-state-inventory.json') return true;
  if (normalized === 'docs/design-handoff/placeholder-app/preview/screens.html') return true;
  if (/^docs\/design-handoff\/placeholder-app\/src\/cx-[^/]+\.jsx$/.test(normalized)) return true;
  if (/^docs\/design-handoff\/placeholder-app\/assets\/food\/.+$/.test(normalized)) return true;
  if (normalized === 'tool/ui_capture/reference_renderer/package.json') return true;
  if (normalized === 'tool/ui_capture/reference_renderer/package-lock.json') return true;
  if (normalized === 'tool/ui_capture/reference_renderer/bin/render.mjs') return true;
  if (/^tool\/ui_capture\/reference_renderer\/harness\/[^/]+\.mjs$/.test(normalized)) return true;
  return false;
}

function extractPathsFromPorcelainLine(line) {
  if (typeof line !== 'string' || line.length < 4) return [];
  const payload = line.slice(3).trim();
  if (payload.includes(' -> ')) {
    return payload.split(' -> ').map((p) => p.trim().replace(/^"|"$/g, ''));
  }
  return [payload.replace(/^"|"$/g, '')];
}

function formatScreenError(key, err) {
  const msg = err instanceof Error ? err.message : String(err);
  const keyTag = `[${key}]`;
  const match = msg.match(/^(RENDER_[A-Z_]+):\s*(.*)$/s);
  if (match) {
    const type = match[1];
    const rest = match[2];
    if (rest.includes(keyTag) || rest.includes(key)) {
      return new Error(`${type}: ${rest}`);
    }
    return new Error(`${type}: ${keyTag} ${rest}`);
  }
  if (msg.includes(keyTag) || msg.includes(key)) {
    return new Error(`RENDER_INVALID_INPUT: ${msg}`);
  }
  return new Error(`RENDER_INVALID_INPUT: ${keyTag} ${msg}`);
}

export async function runReferenceRender(
  {
    repoRoot,
    selection = 'all',
    replace = false,
    allowLocalRender = false,
    validateOnly = false,
    serverBaseUrl = null,
  } = {},
  {
    validateReferenceLeafFn = validateReferenceLeaf,
    importPlaywrightFn = () => import('playwright'),
    createReferenceServerFn = createReferenceServer,
    existsSyncFn = existsSync,
    cwdFn = () => process.cwd(),
  } = {},
) {
  const resolvedRepoRoot = resolveCanonicalRepoRoot(repoRoot, cwdFn, existsSyncFn);

  if (validateOnly) {
    return await validateReferenceLeafFn({ repoRoot: resolvedRepoRoot, selection });
  }

  const normalizedSelection = await readInventorySelection(resolvedRepoRoot, selection);
  const isFull = selection === 'all';
  const fingerprintResult = await computeSourceFingerprint(resolvedRepoRoot);
  const sourceFingerprint = fingerprintResult.fingerprint;

  const targetLeaf = isFull
    ? fullLeafPath(resolvedRepoRoot, sourceFingerprint)
    : subsetLeafPath(resolvedRepoRoot, sourceFingerprint, normalizedSelection);

  const leafExists = existsSyncFn ? existsSyncFn(targetLeaf) : fs.existsSync(targetLeaf);
  if (!replace && leafExists) {
    throw new Error(`RENDER_LEAF_EXTRA: target leaf already exists at ${targetLeaf}`);
  }

  assertLocalRenderAllowed({ allowLocalRender });

  const playwright = await importPlaywrightFn();

  let server = null;
  let browser = null;
  let stagedDir = null;

  try {
    let baseUrl = serverBaseUrl;
    if (!baseUrl) {
      server = await createReferenceServerFn({
        repoRoot: resolvedRepoRoot,
        nodeModulesDir: join(resolvedRepoRoot, 'tool/ui_capture/reference_renderer/node_modules'),
      });
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
    const baseOrigin = new URL(baseUrl).origin;

    const parentDir = dirname(targetLeaf);
    fs.mkdirSync(parentDir, { recursive: true });
    const expectedStagedDir = join(parentDir, `.${basename(targetLeaf)}.staged`);
    if (fs.existsSync(expectedStagedDir)) {
      throw new Error(`RENDER_LEAF_EXTRA: pre-existing staged sibling at ${expectedStagedDir}`);
    }
    fs.mkdirSync(expectedStagedDir);
    stagedDir = expectedStagedDir;

    const chromium = playwright.chromium;
    browser = await chromium.launch({
      args: [...FROZEN_CHROMIUM_FLAGS],
      headless: true,
    });

    const nodeModulesDir = join(resolvedRepoRoot, 'tool/ui_capture/reference_renderer/node_modules');
    const imageRecords = [];

    for (const key of normalizedSelection) {
      const [stateId, mode] = key.split('--');
      const captureUrl = buildCaptureUrl(baseUrl, stateId, mode);

      let context = null;
      try {
        context = await browser.newContext({
          viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
          deviceScaleFactor: DEVICE_SCALE_FACTOR,
          locale: BROWSER_LOCALE,
          timezoneId: BROWSER_TIMEZONE,
        });

        const page = await context.newPage();

        let routeViolation = null;

        await page.route('**/*', async (route) => {
          try {
            const request = route.request();
            const method = request.method();
            if (method !== 'GET') {
              routeViolation = `non-GET request method '${method}'`;
              await route.abort('failed').catch(() => {});
              return;
            }
            const urlStr = request.url();
            let parsed;
            try {
              parsed = new URL(urlStr);
            } catch {
              routeViolation = `malformed URL '${urlStr}'`;
              await route.abort('failed').catch(() => {});
              return;
            }
            if (CDN_INTERCEPT_HOSTS.includes(parsed.hostname)) {
              const resolved = resolveCdnResource(urlStr, { nodeModulesDir });
              if (resolved) {
                if (resolved.body !== undefined) {
                  await route.fulfill({
                    status: 200,
                    contentType: resolved.contentType,
                    body: resolved.body,
                  });
                  return;
                }
                if (resolved.absolutePath !== undefined) {
                  const body = fs.readFileSync(resolved.absolutePath);
                  await route.fulfill({
                    status: 200,
                    contentType: resolved.contentType,
                    body,
                  });
                  return;
                }
              }
              routeViolation = `unresolved CDN URL '${urlStr}'`;
              await route.abort('failed').catch(() => {});
              return;
            }
            if (parsed.origin === baseOrigin && isAllowedServerPath(parsed.pathname)) {
              await route.continue();
              return;
            }
            routeViolation = `unallowlisted request URL '${urlStr}'`;
            await route.abort('failed').catch(() => {});
          } catch (err) {
            routeViolation = err.message;
            await route.abort('failed').catch(() => {});
          }
        });

        const assertNoRouteViolation = () => {
          if (routeViolation) {
            throw new Error(`RENDER_REMOTE_FETCH: ${routeViolation}`);
          }
        };

        await page.clock.install();
        await page.goto(captureUrl, { waitUntil: 'load' });
        assertNoRouteViolation();

        await page.evaluate(async () => {
          if (window.innerWidth !== 360 || window.innerHeight !== 800) {
            throw new Error(`RENDER_VIEWPORT_MISMATCH: expected inner dimensions 360x800, got ${window.innerWidth}x${window.innerHeight}`);
          }
          if (window.devicePixelRatio !== 3) {
            throw new Error(`RENDER_DPR_MISMATCH: expected devicePixelRatio 3, got ${window.devicePixelRatio}`);
          }

          const fitEl = document.querySelector('#fit');
          const stageEl = document.querySelector('#stage');
          if (!fitEl || !stageEl) {
            throw new Error('RENDER_INVALID_INPUT: missing #fit or #stage element');
          }

          const fitRect = fitEl.getBoundingClientRect();
          const stageRect = stageEl.getBoundingClientRect();
          if (fitRect.left !== 0 || fitRect.top !== 0 || fitRect.width !== 360 || fitRect.height !== 800) {
            throw new Error(`RENDER_VIEWPORT_MISMATCH: #fit rect mismatch: left=${fitRect.left}, top=${fitRect.top}, width=${fitRect.width}, height=${fitRect.height}`);
          }
          if (stageRect.left !== 0 || stageRect.top !== 0 || stageRect.width !== 360 || stageRect.height !== 800) {
            throw new Error(`RENDER_VIEWPORT_MISMATCH: #stage rect mismatch: left=${stageRect.left}, top=${stageRect.top}, width=${stageRect.width}, height=${stageRect.height}`);
          }

          const profileObj = window.CX_CAPTURE_PROFILE;
          if (!profileObj || profileObj.profile !== 'samsung-s20fe' || profileObj.width !== 360 || profileObj.height !== 800) {
            throw new Error('RENDER_INVALID_INPUT: invalid CX_CAPTURE_PROFILE');
          }

          const token = stageEl.getAttribute('data-cx-capture-token');
          if (token !== '1') {
            throw new Error(`RENDER_CLOCK_MISORDER: expected capture token '1', got '${token}'`);
          }

          await document.fonts.ready;
          const fontDescriptors = [
            '200 16px Geist',
            '400 16px Geist',
            '500 16px Geist',
            '600 16px Geist',
            '700 16px Geist',
            '400 16px Geist Mono',
            '500 16px Geist Mono',
            '600 16px Geist Mono',
          ];
          for (const desc of fontDescriptors) {
            if (!document.fonts.check(desc)) {
              throw new Error(`RENDER_FONT_MISSING: font check failed for '${desc}'`);
            }
          }
          for (const face of document.fonts) {
            if (face instanceof FontFace && face.status !== 'loaded') {
              throw new Error(`RENDER_FONT_MISSING: FontFace '${face.family}' weight ${face.weight} status is '${face.status}'`);
            }
          }

          const stageImages = Array.from(document.querySelectorAll('#stage img'));
          for (const img of stageImages) {
            try {
              await img.decode();
            } catch (err) {
              throw new Error(`RENDER_IMAGE_INCOMPLETE: failed to decode stage image: ${err.message}`);
            }
            if (!img.complete || img.naturalWidth <= 0) {
              throw new Error('RENDER_IMAGE_INCOMPLETE: stage image incomplete or zero naturalWidth');
            }
          }
        });
        assertNoRouteViolation();

        const advanceMs = clockAdvanceMsFor(stateId);
        if (advanceMs > 0) {
          await page.clock.fastForward(advanceMs);
        }
        assertNoRouteViolation();

        if (stateId === 'today' || stateId === 'today_empty') {
          const domSummary = await page.evaluate(() => {
            const stage = document.querySelector('#stage');
            if (!stage) return '';
            const text = stage.innerText || '';
            const heroMatch = text.match(/([\d,]+)\s*(?:kcal\s+eaten|of\s+[\d,]+)/i);
            const pMatch = text.match(/Protein\s+([\d,]+)\s*\/\s*170g/i);
            const cMatch = text.match(/Carbs\s+([\d,]+)\s*\/\s*250g/i);
            const fMatch = text.match(/Fat\s+([\d,]+)\s*\/\s*70g/i);
            if (heroMatch && pMatch && cMatch && fMatch) {
              return `${heroMatch[1]} kcal ${pMatch[1]} g ${cMatch[1]} g ${fMatch[1]} g`;
            }
            return text;
          });
          assertTodaySettlement(domSummary, stateId);
        }
        assertNoRouteViolation();

        const stageHandle = await page.$('#stage');
        if (!stageHandle) {
          throw new Error('RENDER_INVALID_INPUT: #stage element not found for screenshot');
        }
        assertNoRouteViolation();

        const pngName = `${key}.png`;
        const pngPath = join(stagedDir, pngName);
        await stageHandle.screenshot({ path: pngPath, type: 'png' });
        assertNoRouteViolation();

        const pngBytes = fs.readFileSync(pngPath);
        const pngSha = createHash('sha256').update(pngBytes).digest('hex');
        imageRecords.push({
          path: pngName,
          sha256: pngSha,
          bytes: pngBytes.length,
          width: 1080,
          height: 2400,
          clockAdvanceMs: advanceMs,
        });
      } catch (err) {
        throw formatScreenError(key, err);
      } finally {
        if (context) {
          try {
            await context.close();
          } catch {
            /* fail-closed cleanup */
          }
        }
      }
    }

    let gitCommit = 'unknown';
    let gitDirty = false;
    let dirtyPaths = [];
    try {
      gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: resolvedRepoRoot,
        encoding: 'utf8',
      }).trim();
      const gitStatus = execFileSync('git', ['status', '--porcelain'], {
        cwd: resolvedRepoRoot,
        encoding: 'utf8',
      });
      const lines = gitStatus.split('\n').filter(Boolean);
      const relevantSet = new Set();
      for (const line of lines) {
        for (const p of extractPathsFromPorcelainLine(line)) {
          if (isRelevantGitPath(p)) {
            relevantSet.add(p);
          }
        }
      }
      dirtyPaths = [...relevantSet].sort();
      gitDirty = dirtyPaths.length > 0;
    } catch {
      // fallback
    }

    let npmVersion = 'unknown';
    try {
      npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
    } catch {
      // fallback
    }

    const manifestData = buildDerivedManifest({
      sourceFingerprint,
      gitCommit,
      gitDirty,
      dirtyPaths,
      inventoryHash: fingerprintResult.inventoryHash,
      jsxTree: fingerprintResult.jsxTree,
      previewHash: fingerprintResult.previewHash,
      foodHash: fingerprintResult.foodHash,
      fontDigests: fingerprintResult.fontDigests,
      lockDigest: fingerprintResult.lockDigest,
      rendererDigest: fingerprintResult.rendererDigest,
      profileDigest: fingerprintResult.profileDigest,
      settlementDigest: fingerprintResult.settlementDigest,
      nodeVersion: process.version,
      npmVersion,
      playwrightVersion: playwright.version ?? '1.63.0',
      chromiumVersion: browser.version(),
      selection: normalizedSelection,
      readiness: {
        fontsReady: true,
        imagesDecoded: true,
        viewportVerified: true,
        dprVerified: true,
        stageRectVerified: true,
      },
      images: imageRecords,
    });

    const manifestPath = join(stagedDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifestData));

    await replaceLeafAtomically(targetLeaf, stagedDir, { replace });
    stagedDir = null;

    return { valid: true, leafPath: targetLeaf, manifest: manifestData };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* fail-closed cleanup */
      }
    }
    if (server) {
      try {
        await new Promise((res) => server.close(res));
      } catch {
        /* fail-closed cleanup */
      }
    }
    if (stagedDir && fs.existsSync(stagedDir)) {
      try {
        fs.rmSync(stagedDir, { recursive: true, force: true });
      } catch {
        /* fail-closed cleanup */
      }
    }
  }
}
