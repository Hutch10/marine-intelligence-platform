import { readdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const apiPackageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function collectTestFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(relative(apiRoot, fullPath).split("\\").join("/"));
    }
  }

  return files.sort();
}

const testFiles = collectTestFiles(apiRoot);

if (testFiles.length === 0) {
  console.error("No API test files found under apps/api/src");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles.map((file) => `src/${file}`)],
  {
    cwd: apiPackageRoot,
    stdio: "inherit",
    env: process.env,
  },
);

process.exit(result.status ?? 1);
