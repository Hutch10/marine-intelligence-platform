const { describe, it } = require('node:test');
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

  it('1. exact authorized set -> PASS (PR #5 scenario)', () => {
    const res = runGuard(pr5base, pr5head, pr5Auth);
    assert.strictEqual(res.status, 0, res.output);
    assert.ok(res.output.includes('PASS: All proposed changes satisfy scope constraints.'));
  });

  it('2. unauthorized extra file -> BLOCK', () => {
    const res = runGuard(pr5base, pr5head, 'apps/api/src/server.ts');
    assert.strictEqual(res.status, 1, res.output);
    assert.ok(res.output.includes('[UNAUTHORIZED] apps/api/src/server.publication-aliases.test.ts'));
    assert.ok(res.output.includes('BLOCK: Proposed merge violates scope constraints!'));
  });

  it('3. missing authorized file -> BLOCK (Exact mode)', () => {
    const auth = pr5Auth + '\nfake/file.ts';
    const res = runGuard(pr5base, pr5head, auth);
    assert.strictEqual(res.status, 1, res.output);
    assert.ok(res.output.includes('[MISSING]      fake/file.ts'));
    assert.ok(res.output.includes('BLOCK: Proposed merge violates scope constraints!'));
  });

  it('allowlist mode permits missing authorized file -> PASS', () => {
    const auth = pr5Auth + '\nfake/file.ts';
    const res = runGuard(pr5base, pr5head, auth, '--allowlist');
    assert.strictEqual(res.status, 0, res.output);
    assert.ok(res.output.includes('[MISSING]      fake/file.ts'));
    assert.ok(res.output.includes('PASS: All proposed changes satisfy scope constraints.'));
  });

  it('4. contaminated stale branch equivalent to PR #4 -> BLOCK', () => {
    const res = runGuard(pr4base, pr4head, pr4Auth);
    assert.strictEqual(res.status, 1, res.output);
    assert.ok(res.output.includes('[UNAUTHORIZED] apps/api/src/server.ts'));
    assert.ok(res.output.includes('[UNAUTHORIZED] apps/api/src/server.publication-aliases.test.ts'));
  });

  it('6. identical base/head with empty expected set -> PASS', () => {
    const res = runGuard(main, main, '');
    assert.strictEqual(res.status, 0, res.output);
    assert.ok(res.output.includes('(No changes)'));
  });

  it('7. identical base/head with non-empty exact expected set -> BLOCK', () => {
    const res = runGuard(main, main, 'fake/file.ts');
    assert.strictEqual(res.status, 1, res.output);
    assert.ok(res.output.includes('[MISSING]      fake/file.ts'));
  });

  it('8. invalid base reference -> BLOCK', () => {
    const res = runGuard('invalidbase123', pr5head, pr5Auth);
    assert.strictEqual(res.status, 1, res.output);
    assert.ok(res.output.includes('BLOCK: Error calculating merge tree'));
  });

  it('9. invalid head reference -> BLOCK', () => {
    const res = runGuard(pr5base, 'invalidhead123', pr5Auth);
    assert.strictEqual(res.status, 1, res.output);
    assert.ok(res.output.includes('BLOCK: Error calculating merge tree'));
  });
});
