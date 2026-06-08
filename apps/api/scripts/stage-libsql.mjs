import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(scriptDir, "..");
const distRoot = join(apiRoot, "dist");
const targetScope = join(distRoot, "node_modules", "@libsql");

function resolveLibsqlScope() {
  const candidates = [
    join(apiRoot, "node_modules", "@libsql"),
    join(apiRoot, "..", "..", "node_modules", "@libsql"),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "client", "package.json"))) {
      return candidate;
    }
  }

  const clientPackage = require.resolve("@libsql/client/package.json");
  return dirname(dirname(clientPackage));
}

const sourceScope = resolveLibsqlScope();

mkdirSync(targetScope, { recursive: true });

for (const entry of ["client", "core", "hrana-client", "isomorphic-fetch", "isomorphic-ws"]) {
  const source = join(sourceScope, entry);
  const target = join(targetScope, entry);

  if (!existsSync(source)) {
    continue;
  }

  cpSync(source, target, { recursive: true });
  console.log(`Staged @libsql/${entry} -> ${target}`);
}

console.log("LibSQL runtime dependencies staged for Vercel bundle.");
