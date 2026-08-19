const { execSync } = require('child_process');
const fs = require('fs');

const args = process.argv.slice(2);
const allowlistMode = args.includes('--allowlist');
const positionalArgs = args.filter(a => !a.startsWith('--'));

if (positionalArgs.length < 3) {
  console.error("Usage: node verify-release-scope.js [--allowlist] <target_branch> <head_branch> <authorized_paths_file>");
  process.exit(1);
}

const target = positionalArgs[0];
const head = positionalArgs[1];
const authorizedFile = positionalArgs[2];

let authorizedPathsList;
try {
  authorizedPathsList = fs.readFileSync(authorizedFile, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
} catch (e) {
  console.error(`BLOCK: Failed to read authorization file ${authorizedFile}: ${e.message}`);
  process.exit(1);
}

const authorizedPaths = new Set(authorizedPathsList);

console.log(`Verifying release scope: ${target} <- ${head}`);
console.log(`Mode: ${allowlistMode ? 'ALLOWLIST' : 'EXACT'}`);

let treeId;
try {
  // get merge tree
  const mergeTreeOut = execSync(`git merge-tree ${target} ${head}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  treeId = mergeTreeOut.split('\n')[0].trim();
  if (!treeId || treeId.length !== 40) {
     throw new Error("Invalid tree hash returned from git merge-tree");
  }
} catch (e) {
  console.error("BLOCK: Error calculating merge tree. Potential merge conflict, or invalid git references.");
  process.exit(1);
}

let diffOut;
try {
  diffOut = execSync(`git diff --name-only ${target} ${treeId}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
} catch (e) {
  console.error("BLOCK: Error generating diff against target. Invalid target reference?");
  process.exit(1);
}

const changedFiles = diffOut.split('\n').map(l => l.trim()).filter(l => l.length > 0);
const changedSet = new Set(changedFiles);

if (changedFiles.length > 0 && authorizedPaths.size === 0) {
  console.error("BLOCK: Proposed changes exist but authorization set is empty.");
  process.exit(1);
}

let failed = false;
console.log(`\nProposed changes against ${target}:`);
if (changedFiles.length === 0) {
  console.log("  (No changes)");
}

for (const file of changedFiles) {
  if (authorizedPaths.has(file)) {
    console.log(`  [AUTHORIZED]   ${file}`);
  } else {
    console.log(`  [UNAUTHORIZED] ${file}`);
    failed = true;
  }
}

// Check for missing paths
for (const file of authorizedPaths) {
  if (!changedSet.has(file)) {
    console.log(`  [MISSING]      ${file}`);
    if (!allowlistMode) {
      failed = true;
    }
  }
}

if (failed) {
  console.error("\nBLOCK: Proposed merge violates scope constraints!");
  if (!allowlistMode) {
    console.error("In EXACT mode, actual changed paths must perfectly match authorized paths.");
  }
  process.exit(1);
} else {
  console.log("\nPASS: All proposed changes satisfy scope constraints.");
  process.exit(0);
}
