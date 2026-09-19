import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WORKFLOW_URL = new URL(
  '../../../../.github/workflows/derived-ui-reference.yml',
  import.meta.url,
);
const PACKAGE_URL = new URL('../package.json', import.meta.url);

function readWorkflow() {
  return readFileSync(WORKFLOW_URL, 'utf8');
}

function readPackage() {
  return JSON.parse(readFileSync(PACKAGE_URL, 'utf8'));
}

// Bounded block extraction helpers for static YAML verification without external dependencies
function extractTopLevelBlock(yaml, key) {
  const lines = yaml.split('\n');
  let inBlock = false;
  const blockLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const topLevelMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:/);
    if (topLevelMatch) {
      if (topLevelMatch[1] === key) {
        inBlock = true;
        blockLines.push(line);
      } else if (inBlock) {
        break;
      }
    } else if (inBlock) {
      blockLines.push(line);
    }
  }
  return blockLines.join('\n');
}

function extractSteps(yaml) {
  const lines = yaml.split('\n');
  let inSteps = false;
  let stepsIndent = -1;
  const stepBlocks = [];
  let currentStepLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inSteps) {
      const match = line.match(/^(\s*)steps\s*:/);
      if (match) {
        inSteps = true;
        stepsIndent = match[1].length;
      }
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('#')) {
      const indent = line.search(/\S/);
      if (indent <= stepsIndent) {
        break;
      }
    }

    const isStepStart = /^\s*-\s+/.test(line);
    if (isStepStart) {
      if (currentStepLines.length > 0) {
        stepBlocks.push(currentStepLines.join('\n'));
        currentStepLines = [];
      }
      currentStepLines.push(line);
    } else if (currentStepLines.length > 0) {
      currentStepLines.push(line);
    }
  }
  if (currentStepLines.length > 0) {
    stepBlocks.push(currentStepLines.join('\n'));
  }
  return stepBlocks;
}

function extractNestedBlock(blockText, key) {
  if (!blockText) return '';
  const lines = blockText.split('\n');
  let inBlock = false;
  let keyIndent = -1;
  const nestedLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      if (inBlock) nestedLines.push(line);
      continue;
    }
    const indent = line.search(/\S/);
    if (!inBlock) {
      const match = line.match(new RegExp(`^(\\s*)(?:-\\s+)?${key}\\s*:`));
      if (match) {
        inBlock = true;
        keyIndent = indent;
        nestedLines.push(line);
      }
    } else {
      if (indent <= keyIndent) {
        break;
      }
      nestedLines.push(line);
    }
  }
  return nestedLines.join('\n');
}

function extractRunScript(stepBlock) {
  if (!stepBlock) return '';
  const lines = stepBlock.split('\n');
  let inRun = false;
  let runIndent = -1;
  const scriptLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inRun) {
      const match = line.match(/^(\s*)(?:-\s+)?run\s*:\s*(.*)$/);
      if (match) {
        const afterColon = match[2].trim();
        if (afterColon && !afterColon.startsWith('|') && !afterColon.startsWith('>')) {
          return afterColon;
        }
        inRun = true;
        runIndent = match[1].length;
      }
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      scriptLines.push(line);
      continue;
    }
    const indent = line.search(/\S/);
    if (indent <= runIndent) {
      break;
    }
    scriptLines.push(line);
  }
  return scriptLines.join('\n').trim();
}

test('workflow file exists at exact test-relative path', () => {
  const text = readWorkflow();
  assert.ok(text.length > 0, 'workflow YAML is non-empty');
});

test('package render and validate scripts wire CLI entry', () => {
  const pkg = readPackage();
  assert.ok(
    typeof pkg?.scripts?.render === 'string' && pkg.scripts.render.includes('bin/render.mjs'),
    'render script must run bin/render.mjs',
  );
  assert.ok(
    typeof pkg?.scripts?.validate === 'string' && pkg.scripts.validate.includes('bin/render.mjs'),
    'validate script must run bin/render.mjs',
  );
  assert.ok(
    typeof pkg?.scripts?.validate === 'string' && pkg.scripts.validate.includes('--validate-only'),
    'validate must pass --validate-only',
  );
});

test('dispatch-only trigger with subset string default all', () => {
  const text = readWorkflow();
  const onBlock = extractTopLevelBlock(text, 'on');
  assert.ok(onBlock.length > 0, 'top-level on block must exist');

  const dispatchBlock = extractNestedBlock(onBlock, 'workflow_dispatch');
  assert.ok(dispatchBlock.length > 0, 'on block must define workflow_dispatch');

  const inputsBlock = extractNestedBlock(dispatchBlock, 'inputs');
  assert.ok(inputsBlock.length > 0, 'workflow_dispatch must define inputs');

  const subsetBlock = extractNestedBlock(inputsBlock, 'subset');
  assert.ok(subsetBlock.length > 0, 'inputs must declare subset');
  assert.match(subsetBlock, /type\s*:\s*string/, 'subset input type must be string');
  assert.match(subsetBlock, /default\s*:\s*['"]?all['"]?/, 'subset input default must be all');

  // No forbidden triggers within on block
  assert.ok(!/\bpush\s*:/i.test(onBlock), 'on block must not contain push trigger');
  assert.ok(!/\bpull_request\s*:/i.test(onBlock), 'on block must not contain pull_request trigger');
  assert.ok(!/\bworkflow_call\s*:/i.test(onBlock), 'on block must not contain workflow_call trigger');
  assert.ok(!/\bschedule\s*:/i.test(onBlock), 'on block must not contain schedule trigger');
});

test('prohibits push/pull_request/workflow_call/schedule triggers and Verify coupling', () => {
  const text = readWorkflow();
  assert.ok(!text.includes('pull_request'), 'must not trigger on pull_request');
  assert.ok(!text.includes('workflow_call'), 'must not trigger on workflow_call');
  assert.ok(!/^\s*schedule\s*:/m.test(text), 'must not trigger on schedule');
  assert.ok(!/^\s*push\s*:/m.test(text), 'must not trigger on push');
  assert.ok(!text.includes('Verify'), 'must not couple to routine Verify');
});

test('least-privilege contents read on ubuntu-latest Node 20', () => {
  const text = readWorkflow();
  const permBlock = extractTopLevelBlock(text, 'permissions');
  assert.ok(permBlock.length > 0, 'permissions block must exist');
  assert.match(permBlock, /contents\s*:\s*read/, 'permissions must specify contents: read');
  assert.ok(!/\bwrite\b/.test(permBlock), 'permissions must not grant write access');
  assert.ok(!text.includes('contents: write'), 'must not grant contents: write');
  assert.ok(text.includes('ubuntu-latest'), 'must run on ubuntu-latest');

  const steps = extractSteps(text);
  const nodeStep = steps.find(s => s.includes('actions/setup-node@v4'));
  assert.ok(nodeStep, 'must include actions/setup-node@v4 step');
  const nodeWith = extractNestedBlock(nodeStep, 'with');
  assert.match(nodeWith, /node-version\s*:\s*['"]?20['"]?/, 'setup-node step with block must bind node-version to Node 20');
});

test('checks out dispatched SHA via checkout@v4', () => {
  const text = readWorkflow();
  const steps = extractSteps(text);
  const checkoutStep = steps.find(s => s.includes('actions/checkout@v4'));
  assert.ok(checkoutStep, 'must use actions/checkout@v4');
  const withBlock = extractNestedBlock(checkoutStep, 'with');
  assert.match(withBlock, /ref\s*:\s*.*github\.sha/, 'checkout step with block must bind ref to github.sha');
});

test('exact npm ci and npm test prefix commands', () => {
  const text = readWorkflow();
  const steps = extractSteps(text);
  const ciStep = steps.find(s => s.includes('npm ci'));
  assert.ok(ciStep, 'must include npm ci step');
  assert.match(
    extractRunScript(ciStep),
    /npm ci --prefix tool\/ui_capture\/reference_renderer/,
    'must run exact npm ci prefix command',
  );

  const testStep = steps.find(s => s.includes('npm test'));
  assert.ok(testStep, 'must include npm test step');
  assert.match(
    extractRunScript(testStep),
    /npm test --prefix tool\/ui_capture\/reference_renderer/,
    'must run exact npm test prefix command',
  );
});

test('local pinned Playwright install in renderer working-directory', () => {
  const text = readWorkflow();
  const steps = extractSteps(text);
  const pwStep = steps.find(s => s.includes('playwright install'));
  assert.ok(pwStep, 'must include Playwright browser install step');
  assert.match(
    extractRunScript(pwStep),
    /npx playwright install --with-deps chromium/,
    'must install browser via exact pinned Playwright command',
  );
  assert.match(
    pwStep,
    /working-directory\s*:\s*tool\/ui_capture\/reference_renderer/,
    'browser install must run in renderer working-directory',
  );
});

test('independently binds render step to env SUBSET from inputs.subset and quoted selection without interpolation in run', () => {
  const text = readWorkflow();
  const steps = extractSteps(text);
  const renderStep = steps.find(s => s.includes('npm run render'));
  assert.ok(renderStep, 'must include npm run render step');

  const envBlock = extractNestedBlock(renderStep, 'env');
  assert.match(
    envBlock,
    /SUBSET\s*:\s*.*inputs\.subset/,
    'render step env block must bind SUBSET from inputs.subset',
  );

  const runScript = extractRunScript(renderStep);
  assert.match(
    runScript,
    /npm run render --prefix tool\/ui_capture\/reference_renderer/,
    'render step must run package render script with prefix',
  );
  assert.match(
    runScript,
    /--selection\s+"\$SUBSET"/,
    'render step run must pass exact quoted --selection "$SUBSET"',
  );

  assert.ok(
    !runScript.includes('${{'),
    'render step run script must not directly interpolate GitHub Actions context expressions',
  );
  assert.ok(
    !runScript.includes('inputs.subset'),
    'render step run script must reject direct inputs interpolation',
  );
});

test('independently binds validate step to env SUBSET from inputs.subset and quoted selection without interpolation in run', () => {
  const text = readWorkflow();
  const steps = extractSteps(text);
  const validateStep = steps.find(s => s.includes('npm run validate'));
  assert.ok(validateStep, 'must include npm run validate step');

  const envBlock = extractNestedBlock(validateStep, 'env');
  assert.match(
    envBlock,
    /SUBSET\s*:\s*.*inputs\.subset/,
    'validate step env block must bind SUBSET from inputs.subset',
  );

  const runScript = extractRunScript(validateStep);
  assert.match(
    runScript,
    /npm run validate --prefix tool\/ui_capture\/reference_renderer/,
    'validate step must run package validate script with prefix',
  );
  assert.match(
    runScript,
    /--selection\s+"\$SUBSET"/,
    'validate step run must pass exact quoted --selection "$SUBSET"',
  );

  assert.ok(
    !runScript.includes('${{'),
    'validate step run script must not directly interpolate GitHub Actions context expressions',
  );
  assert.ok(
    !runScript.includes('inputs.subset'),
    'validate step run script must reject direct inputs interpolation',
  );
});

test('proves validate step precedes discovery and upload steps in execution order', () => {
  const text = readWorkflow();
  const steps = extractSteps(text);

  const validateIndex = steps.findIndex(s => s.includes('npm run validate'));
  const discoveryIndex = steps.findIndex(
    s => s.includes('LEAF_DIR') && (s.includes('GITHUB_ENV') || s.includes('find')),
  );
  const uploadIndex = steps.findIndex(s => s.includes('actions/upload-artifact@v4'));

  assert.ok(validateIndex >= 0, 'validate step must exist in steps');
  assert.ok(discoveryIndex >= 0, 'discovery step must exist in steps');
  assert.ok(uploadIndex >= 0, 'upload step must exist in steps');

  assert.ok(
    validateIndex < discoveryIndex,
    `validate step (index ${validateIndex}) must precede discovery step (index ${discoveryIndex})`,
  );
  assert.ok(
    discoveryIndex < uploadIndex,
    `discovery step (index ${discoveryIndex}) must precede upload step (index ${uploadIndex})`,
  );
});

test('binds leaf discovery to quoted SUBSET=all full branch and separate subsets depth-2 branch exporting LEAF_DIR', () => {
  const text = readWorkflow();
  const steps = extractSteps(text);
  const discoveryStep = steps.find(
    s => s.includes('LEAF_DIR') && (s.includes('GITHUB_ENV') || s.includes('find')),
  );
  assert.ok(discoveryStep, 'discovery step must exist');

  const runScript = extractRunScript(discoveryStep);
  assert.ok(runScript.length > 0, 'discovery step run script must exist');

  // Quoted SUBSET=all branch
  assert.match(
    runScript,
    /if\s+\[{1,2}\s*"\$SUBSET"\s*={1,2}\s*['"]?all['"]?\s*\]{1,2}/,
    'discovery must branch on quoted if [ "$SUBSET" = "all" ]',
  );

  // Full find rooted exactly at .ui-diff/expected-derived/samsung-s20fe with -mindepth 1 -maxdepth 1 -type d and ! -name subsets
  assert.match(
    runScript,
    /find\s+['"]?\.ui-diff\/expected-derived\/samsung-s20fe['"]?.*-mindepth\s+1.*-maxdepth\s+1.*-type\s+d.*(?:!|-not)\s+-name\s+['"]?subsets['"]?/,
    'full find must be rooted exactly at .ui-diff/expected-derived/samsung-s20fe with -mindepth 1 -maxdepth 1 -type d and explicit ! -name subsets',
  );

  // Exactly-one full leaf check using numeric -ne 1
  assert.match(
    runScript,
    /-ne\s+1\b/,
    'discovery must enforce exactly-one leaf check using numeric -ne 1',
  );

  // Full "$LEAF_DIR/manifest.json" file check
  assert.match(
    runScript,
    /(?:\[\s*!?\s*-f|test\s+!?\s*-f)\s+["']?\$LEAF_DIR\/manifest\.json["']?/,
    'discovery must verify presence of "$LEAF_DIR/manifest.json"',
  );

  // PNG find bounded -maxdepth 1 with name *.png and numeric exact 38 rejection
  assert.match(
    runScript,
    /find\s+.*-maxdepth\s+1.*-name\s+['"]?\*\.png['"]?/,
    'PNG find must be bounded to -maxdepth 1 with -name *.png',
  );
  assert.match(
    runScript,
    /-ne\s+38\b/,
    'full leaf discovery must reject PNG count with numeric -ne 38',
  );

  // Subset find rooted exactly at .ui-diff/expected-derived/samsung-s20fe/subsets with -mindepth 2 -maxdepth 2 -type d
  assert.match(
    runScript,
    /find\s+['"]?\.ui-diff\/expected-derived\/samsung-s20fe\/subsets['"]?.*-mindepth\s+2.*-maxdepth\s+2.*-type\s+d/,
    'subset find must be rooted exactly at .ui-diff/expected-derived/samsung-s20fe/subsets with -mindepth 2 -maxdepth 2 -type d',
  );

  // Explicit subset-mode search for any full leaf at base depth 1 excluding subsets and failure if any exists
  assert.match(
    runScript,
    /(?:else|elif)[\s\S]*find\s+['"]?\.ui-diff\/expected-derived\/samsung-s20fe['"]?[\s\S]*(?:!|-not)\s+-name\s+['"]?subsets['"]?[\s\S]*(?:-ne\s+0|-gt\s+0|\[\s*!?\s*-[nz]\s+)/,
    'subset mode must explicitly search for full leaf at base depth 1 excluding subsets and fail if any exists',
  );

  // Echo LEAF_DIR to "$GITHUB_ENV"
  assert.match(
    runScript,
    /echo\s+["']?LEAF_DIR=\$(?:LEAF_DIR|\{LEAF_DIR\})["']?\s*>>\s*"?\$GITHUB_ENV"?/,
    'must export LEAF_DIR to "$GITHUB_ENV"',
  );
});

test('upload-artifact@v4 of env LEAF_DIR with if-no-files-found error', () => {
  const text = readWorkflow();
  const steps = extractSteps(text);
  const uploadStep = steps.find(s => s.includes('actions/upload-artifact@v4'));
  assert.ok(uploadStep, 'upload step using actions/upload-artifact@v4 must exist');

  const withBlock = extractNestedBlock(uploadStep, 'with');
  assert.ok(withBlock.length > 0, 'upload step must include with block');
  assert.match(
    withBlock,
    /path\s*:\s*['"]?\${{\s*env\.LEAF_DIR\s*}}['"]?/,
    'upload path must be exactly ${{ env.LEAF_DIR }}',
  );
  assert.match(
    withBlock,
    /if-no-files-found\s*:\s*['"]?error['"]?/,
    'if-no-files-found must be configured as error',
  );
});

test('prohibits local-render bypass sandbox weakening commit push deploy release secrets', () => {
  const text = readWorkflow();
  assert.ok(!text.includes('--allow-local-render'), 'must not pass --allow-local-render');
  assert.ok(!text.includes('no-sandbox'), 'must not use no-sandbox');
  assert.ok(!text.includes('git commit'), 'must not git commit');
  assert.ok(!text.includes('git push'), 'must not git push');
  assert.ok(!text.includes('deploy'), 'must not deploy');
  assert.ok(!text.includes('release'), 'must not release');
  assert.ok(!text.includes('secrets.'), 'must not use secrets');
});
