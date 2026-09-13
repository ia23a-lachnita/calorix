import { fileURLToPath } from 'node:url';
import { assertLocalRenderAllowed } from '../harness/profile.mjs';

const SELECTION_KEY_PATTERN = /^[A-Za-z0-9_]+--(dark|light)$/;

function parseSelectionValue(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new Error('RENDER_INVALID_INPUT: --selection requires a non-empty value');
  }
  const value = String(raw).trim();
  if (value === 'all') {
    return 'all';
  }
  const keys = value.split(',').map((part) => part.trim());
  if (keys.some((key) => key === '')) {
    throw new Error('RENDER_INVALID_INPUT: --selection contains an empty key');
  }
  if (keys.includes('all')) {
    throw new Error('RENDER_INVALID_INPUT: --selection mixes all with explicit keys');
  }
  for (const key of keys) {
    if (!SELECTION_KEY_PATTERN.test(key)) {
      throw new Error(`RENDER_INVALID_INPUT: malformed selection key '${key}'`);
    }
  }
  return [...new Set(keys)].sort();
}

export function parseCliArgs(argv) {
  const args = [...argv];
  let selection;
  let selectionSeen = false;
  let replace = false;
  let replaceSeen = false;
  let noReplaceSeen = false;
  let allowLocalRender = false;
  let validateOnly = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--selection') {
      selection = parseSelectionValue(args[i + 1]);
      selectionSeen = true;
      i += 1;
    } else if (arg.startsWith('--selection=')) {
      selection = parseSelectionValue(arg.slice('--selection='.length));
      selectionSeen = true;
    } else if (arg === '--replace') {
      replace = true;
      replaceSeen = true;
    } else if (arg === '--no-replace') {
      replace = false;
      noReplaceSeen = true;
    } else if (arg === '--allow-local-render') {
      allowLocalRender = true;
    } else if (arg === '--validate-only') {
      validateOnly = true;
    } else {
      throw new Error(`RENDER_INVALID_INPUT: unknown flag '${arg}'`);
    }
  }

  if (selectionSeen === false) {
    selection = 'all';
  }
  if (replaceSeen && noReplaceSeen) {
    throw new Error('RENDER_INVALID_INPUT: conflicting --replace and --no-replace');
  }
  return { selection, replace, allowLocalRender, validateOnly };
}

export async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (err) {
    process.exitCode = 20;
    throw err;
  }
  try {
    assertLocalRenderAllowed({ allowLocalRender: parsed.allowLocalRender });
  } catch (err) {
    process.exitCode = 11;
    throw err;
  }
  try {
    const renderModule = await import('../harness/render.mjs');
    await renderModule.runReferenceRender({
      selection: parsed.selection,
      replace: parsed.replace,
      allowLocalRender: parsed.allowLocalRender,
      validateOnly: parsed.validateOnly,
    });
    process.exitCode = 0;
  } catch (err) {
    const message = String(err?.message ?? err);
    if (message.includes('RENDER_ARM_REFUSED')) {
      process.exitCode = 11;
    } else if (message.includes('RENDER_INVALID_INPUT')) {
      process.exitCode = 20;
    } else {
      process.exitCode = 30;
    }
    throw err;
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  try {
    await main();
  } catch (err) {
    process.exitCode ??= 30;
    console.error(err?.message ?? err);
  }
}
