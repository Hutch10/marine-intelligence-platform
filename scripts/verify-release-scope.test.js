const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, 'verify-release-scope.js');
const repoRoot = path.resolve(__dirname, '..');

function runGuard(target, head, authContent, extraArgs = '') {
  const authFile = path.resolve(__dirname, 'temp-auth.txt');
  fs.writeFileSync(authFile, authContent, 'utf8');
  try {
    const output = execSync(`node ${scriptPath} ${extraArgs} ${target} ${head} ${authFile}`, { encoding: 'utf8', stdio: 'pipe', cwd: repoRoot });
    return { status: 0, output };
  } catch (err) {
    return { status: err.status, output: err.stdout + '\n' + err.stderr };
  } finally {
    if (fs.existsSync(authFile)) fs.unlinkSync(authFile);
  }
}

describe('Merge Integrity Guard', () => {
  const main = '19b9fd57297c57f64a6e8eca532144f1edd53cb3';
  const pr4head = 'cbbe29cdb229493ee404e22dffbe6e9fbaedddd3';
  const pr4base = 'c08823b0c2056a82ea2a5bf47eac65d2bbd222a8';
  const pr5head = 'e99e529e5045abdbed803754a4eeb03bd2732cad';
  const pr5base = '3fc966c702321ba35517678d5b2f4db91b930f2c';

  const pr4Auth = `apps/web/app/page.test.tsx\napps/web/app/page.tsx\napps/web/components/layout/sidebar.test.tsx\napps/web/components/layout/sidebar.tsx\napps/web/middleware.test.ts\napps/web/middleware.ts`;
  const pr5Auth = `apps/api/src/server.ts\napps/api/src/server.publication-aliases.test.ts`;

  let headWithScopeOnly;
  let headWithScopeAndFile;
  let headWithScopeAndUnauthorizedFile;

  before(() => {
    // create test branches
    execSync('git checkout -b test-scope1 ' + main, { cwd: repoRoot, stdio: 'ignore' });
    fs.writeFileSync(path.resolve(repoRoot, 'RELEASE_SCOPE.txt'), 'fake/file.ts\n');
    execSync('git add RELEASE_SCOPE.txt', { cwd: repoRoot, stdio: 'ignore' });
    execSync('git commit -m "add scope only"', { cwd: repoRoot, stdio: 'ignore' });
    headWithScopeOnly = execSync('git rev-parse HEAD', { cwd: repoRoot }).toString().trim();

    execSync('git checkout -b test-scope2 test-scope1', { cwd: repoRoot, stdio: 'ignore' });
    fs.writeFileSync(path.resolve(repoRoot, 'fake-file.ts'), 'test\n');
    execSync('git add fake-file.ts', { cwd: repoRoot, stdio: 'ignore' });
    execSync('git commit -m "add fake file"', { cwd: repoRoot, stdio: 'ignore' });
    headWithScopeAndFile = execSync('git rev-parse HEAD', { cwd: repoRoot }).toString().trim();

    execSync('git checkout -b test-scope3 test-scope2', { cwd: repoRoot, stdio: 'ignore' });
    fs.writeFileSync(path.resolve(repoRoot, 'unauth.ts'), 'test\n');
    execSync('git add unauth.ts', { cwd: repoRoot, stdio: 'ignore' });
    execSync('git commit -m "add unauth file"', { cwd: repoRoot, stdio: 'ignore' });
    headWithScopeAndUnauthorizedFile = execSync('git rev-parse HEAD', { cwd: repoRoot }).toString().trim();

    execSync('git checkout fix/merge-integrity-guard', { cwd: repoRoot, stdio: 'ignore' });
  });

  after(() => {
    execSync('git branch -D test-scope1 test-scope2 test-scope3', { cwd: repoRoot, stdio: 'ignore' });
  });

  it('1. exact authorized set -> PASS (PR #5 scenario)', () => {
    const res = runGuard(pr5base, pr5head, pr5Auth);
    assert.strictEqual(res.status, 0, res.output);
  });

  it('2. unauthorized extra file -> BLOCK', () => {
    const res = runGuard(pr5base, pr5head, 'apps/api/src/server.ts');
    assert.strictEqual(res.status, 1, res.output);
  });

  it('10. RELEASE_SCOPE.txt itself does not cause a false BLOCK', () => {
    const res = runGuard(main, headWithScopeOnly, '');
    assert.strictEqual(res.status, 0, res.output);
    assert.ok(res.output.includes('[EXCLUDED CONTROL METADATA] RELEASE_SCOPE.txt'));
  });

  it('11. RELEASE_SCOPE.txt plus exact authorized application set remains exact', () => {
    const res = runGuard(main, headWithScopeAndFile, 'fake-file.ts');
    assert.strictEqual(res.status, 0, res.output);
    assert.ok(res.output.includes('[EXCLUDED CONTROL METADATA] RELEASE_SCOPE.txt'));
    assert.ok(res.output.includes('[AUTHORIZED]   fake-file.ts'));
  });

  it('12. adding another arbitrary file next to RELEASE_SCOPE.txt still BLOCKS', () => {
    const res = runGuard(main, headWithScopeAndUnauthorizedFile, 'fake-file.ts');
    assert.strictEqual(res.status, 1, res.output);
    assert.ok(res.output.includes('[UNAUTHORIZED] unauth.ts'));
  });
});
