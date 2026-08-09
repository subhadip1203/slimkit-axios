'use strict';

// Packs the package with `npm pack`, installs the resulting tarball into a
// throwaway scratch project (as a real dependency, not a symlink), and
// smoke-tests both CommonJS `require()` and ES module `import` consumption
// against what actually ships to npm. `npm run typecheck` only compiles
// against the source tree; this catches `package.json` `exports`/`files`
// mistakes that only surface once the package is actually installed.

const { execFileSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

function quoteArg(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}
function run(command, args, options = {}) {
  const needsShell = process.platform === 'win32' && command === 'npm';
  if (needsShell) {
    return execSync(['npm', ...args.map(quoteArg)].join(' '), { stdio: 'pipe', encoding: 'utf8', ...options });
  }
  return execFileSync(command, args, { stdio: 'pipe', encoding: 'utf8', ...options });
}

function listFilesRecursive(dir, base = dir) {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) entries.push(...listFilesRecursive(fullPath, base));
    else entries.push(path.relative(base, fullPath));
  }
  return entries;
}

function main() {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-axios-pack-'));
  let tarballPath;
  try {
    const packOutput = run('npm', ['pack', '--json', '--pack-destination', scratchDir], { cwd: repoRoot });
    const [packResult] = JSON.parse(packOutput);
    tarballPath = path.join(scratchDir, packResult.filename);
    console.log(`packed ${pkg.name}@${pkg.version} -> ${packResult.filename} (${packResult.entryCount} files, ${packResult.size} bytes)`);

    const consumerDir = path.join(scratchDir, 'consumer');
    fs.mkdirSync(consumerDir);
    fs.writeFileSync(path.join(consumerDir, 'package.json'), JSON.stringify({ name: 'consumer', private: true, version: '0.0.0' }));
    run('npm', ['install', '--no-audit', '--no-fund', tarballPath], { cwd: consumerDir });

    const installedFiles = listFilesRecursive(path.join(consumerDir, 'node_modules', pkg.name));
    for (const required of ['src/index.cjs', 'src/index.mjs', 'src/index.d.ts']) {
      if (!installedFiles.includes(required.replace(/\//g, path.sep))) {
        throw new Error(`installed package is missing ${required}`);
      }
    }
    console.log('installed package contains src/index.cjs, src/index.mjs, src/index.d.ts');

    fs.writeFileSync(path.join(consumerDir, 'smoke.cjs'), `
      const assert = require('node:assert/strict');
      const axios = require(${JSON.stringify(pkg.name)});
      assert.equal(typeof axios, 'function');
      assert.equal(typeof axios.get, 'function');
      assert.equal(typeof axios.query, 'function');
      assert.equal(typeof axios.AxiosError, 'function');
      console.log('cjs require() ok');
    `);
    run('node', ['smoke.cjs'], { cwd: consumerDir });

    fs.writeFileSync(path.join(consumerDir, 'smoke.mjs'), `
      import assert from 'node:assert/strict';
      import axios, { AxiosError, AxiosHeaders } from ${JSON.stringify(pkg.name)};
      assert.equal(typeof axios, 'function');
      assert.equal(typeof axios.get, 'function');
      assert.equal(typeof AxiosError, 'function');
      assert.equal(typeof AxiosHeaders, 'function');
      console.log('esm import ok');
    `);
    run('node', ['smoke.mjs'], { cwd: consumerDir });

    fs.writeFileSync(path.join(consumerDir, 'end-to-end.mjs'), `
      import assert from 'node:assert/strict';
      import axios from ${JSON.stringify(pkg.name)};
      const response = await axios.get('https://example.test/ping', {
        env: { fetch: async () => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } }) }
      });
      assert.deepEqual(response.data, { ok: true });
      console.log('end-to-end request through the installed package ok');
    `);
    run('node', ['end-to-end.mjs'], { cwd: consumerDir });

    console.log('\nPASS: packed artifact installs and works from both require() and import');
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error('\nFAIL: packed artifact verification failed');
  if (error.stdout) console.error(error.stdout);
  if (error.stderr) console.error(error.stderr);
  console.error(error.message);
  process.exit(1);
}
