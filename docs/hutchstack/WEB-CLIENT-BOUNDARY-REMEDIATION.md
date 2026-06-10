# Web Client Boundary Remediation

**Remediated (UTC):** 2026-06-10  
**Trigger:** Phase 0B moved `harness-primitives.ts` (uses `node:crypto`) into `@marine/shared` index; web client bundles failed.  
**Method:** Export boundary split, import audit, vitest resolution fix, validation runs. No trust/replay/lineage behavior changes.

---

## Executive summary

| Item | Result |
|------|--------|
| Root cause | `node:crypto` leaked into client bundle via `@marine/shared` barrel |
| Fix | Server-only export `@marine/shared/server`; client-safe `@marine/shared` index |
| Web build | **PASS** |
| Web tests | **503/503 PASS** (68 files) |
| API typecheck | **PASS** |
| Shared build | **PASS** |
| **Final verdict** | **WEB BOUNDARY FIX VERIFIED** |

---

## 1. Root cause

Phase 0B added `export * from "./harness-primitives"` to `packages/shared/src/index.ts`.  
`harness-primitives.ts` imports `node:crypto` for `stableContentHash` and deterministic ID functions.

Import chain that broke Next.js client build:

```
node:crypto
  → packages/shared/src/harness-primitives.ts
  → packages/shared/src/index.ts
  → apps/web/lib/trust-utils.ts  (export * from "@marine/shared")
  → apps/web/app/ocean-map/page.tsx
```

Webpack cannot bundle `node:crypto` in browser client chunks.

Secondary issue: web `test` script resolved hoisted root `vitest@4` (rolldown native binding missing on Windows pnpm install).

---

## 2. Remediation

### 2.1 Server/client export boundary

| Export | Path | Contents | Client-safe? |
|--------|------|----------|--------------|
| `@marine/shared` | `dist/index.js` | types, harness contracts, trust-authority | **Yes** |
| `@marine/shared/server` | `dist/server.js` | `harness-primitives` (`node:crypto`) | **No** |

**Created:**

- `packages/shared/src/server.ts` — re-exports `harness-primitives`
- `packages/shared/server.js` + `server.d.ts` — legacy/subpath shim for Node + TypeScript Node resolution

**Removed from client barrel:**

- `export * from "./harness-primitives"` in `packages/shared/src/index.ts`

### 2.2 API import updates

Server/runtime imports moved to `@marine/shared/server`:

| File | Change |
|------|--------|
| `apps/api/src/services/environmental-harness/provenance.ts` | `@marine/shared/server` |
| `apps/api/src/services/environmental-harness/lineage.ts` | `@marine/shared/server` |
| `apps/api/src/repositories/environmental-harness-events.ts` | `@marine/shared/server` |

Hash functions and ID primitives **unchanged** — same implementations in `harness-primitives.ts`.

### 2.3 Web client imports

| File | Change |
|------|--------|
| `apps/web/lib/trust-utils.ts` | Named exports from `@marine/shared` (trust-authority only); **no** barrel re-export |
| `apps/web/next.config.mjs` | Fixed server webpack alias: `server.ts` (was invalid `server/index.ts`) |

No web file imports `@marine/shared/server`.

### 2.4 Vitest resolution

| Change | Reason |
|--------|--------|
| `"test": "node ./node_modules/vitest/vitest.mjs run"` | Use web-local vitest, not hoisted root |
| Pin `vitest@3.2.4`, `vite@5.4.21`, `@vitejs/plugin-react@4.3.4` | Avoid root `vitest@4`/rolldown binding failure |
| Pin `jsdom@24.1.3` | Compatible with vitest 3 test pool |
| `test/setup.ts` | `expect.extend(matchers)` for jest-dom on vitest 3 |

### 2.5 Boundary guard

`apps/web/lib/trust-utils.boundary.test.ts`:

- Asserts `trust-utils.ts` does not re-export full `@marine/shared` barrel
- Asserts shared `index.ts` does not reference `harness-primitives`

---

## 3. Why `node:crypto` stayed server-only

| Requirement | How met |
|-------------|---------|
| Do not polyfill crypto in browser | Primitives excluded from client barrel |
| Do not remove or change hash behavior | Same `harness-primitives.ts` code path on server |
| Do not change replay/trust/lineage logic | API imports same functions via `@marine/shared/server` |
| HutchStack invariants preserved | `stableContentHash`, `buildHarnessEventId`, etc. unchanged |

Cryptographic primitives belong on the server/API ingest and harness persistence path only. Web UI consumes **trust metadata types** and **trust-authority evaluators** (`evaluateConfidence`, `deriveIntegrityStatus`) which have no Node dependencies.

---

## 4. Validation results

**Environment:** Node v20.18.3, pnpm 10.28.2, Windows

| Command | Result |
|---------|--------|
| `pnpm install` | PASS |
| `pnpm --filter @marine/shared build` | PASS |
| `pnpm --filter api typecheck` | PASS |
| `pnpm --filter ./apps/web test` | **503/503 PASS** (68 files) |
| `pnpm --filter ./apps/web build` | **PASS** — `/ocean-map` 19.1 kB |

---

## 5. Remaining risks

| Risk | Mitigation |
|------|------------|
| Future barrel re-export of primitives | Boundary test + code review |
| Web route imports API modules using `@marine/shared/server` | Server-only webpack alias; client must not import those routes' modules |
| CI ingest must build shared before ingest | Already in `ingest-live-production.yml` (`74e770b`) |
| Vitest pinned to 3.x in web | Documented; API still on vitest 4 — acceptable split |
| `pnpm approve-builds` for esbuild | May be needed on fresh installs for vite; non-blocking in current validation |

---

## 6. Files changed

| File | Action |
|------|--------|
| `packages/shared/src/server.ts` | Created |
| `packages/shared/server.js` | Created |
| `packages/shared/server.d.ts` | Created |
| `packages/shared/src/index.ts` | Removed primitives export |
| `packages/shared/package.json` | Added `./server` export |
| `apps/api/.../provenance.ts` | Server import path |
| `apps/api/.../lineage.ts` | Server import path |
| `apps/api/.../environmental-harness-events.ts` | Server import path |
| `apps/web/lib/trust-utils.ts` | Client-safe named exports |
| `apps/web/next.config.mjs` | Fixed server alias |
| `apps/web/package.json` | Vitest/vite/jsdom pins + test script |
| `apps/web/test/setup.ts` | jest-dom matchers for vitest 3 |
| `apps/web/lib/trust-utils.boundary.test.ts` | Created |
| `pnpm-lock.yaml` | Updated (web vitest/vite/jsdom) |

---

## 7. Git reconciliation

**Reconciled (UTC):** 2026-06-10  
**Branch:** `main`  
**Commit:** *(recorded after push — see below)*

### Scope confirmed

Included in commit:

- `packages/shared/src/server.ts`, `server.js`, `server.d.ts`
- `packages/shared/src/index.ts`, `package.json`
- API import path updates (`provenance.ts`, `lineage.ts`, `environmental-harness-events.ts`)
- `apps/web/lib/trust-utils.ts`, `trust-utils.boundary.test.ts`
- `apps/web/next.config.mjs`, `package.json`, `test/setup.ts`
- `pnpm-lock.yaml`
- This document

**Excluded** (not part of boundary fix):

- `apps/api/.verification/*` — verification artifact drift
- `docs/hutchstack/H72-REPLAY-AWARE-BURN-IN-REPORT.md` — burn-in checkpoint docs
- Other burn-in/certification docs (untracked)
- `packages/shared/dist/*` — build output (gitignored)

No production routes, replay engine, trust gate, lineage logic, migrations, burn-in scripts, or scheduler workflow changes.

### Pre-commit validation (reconciliation run)

| Command | Result |
|---------|--------|
| `pnpm --filter @marine/shared build` | PASS |
| `pnpm --filter api typecheck` | PASS |
| `pnpm --filter ./apps/web test` | **503/503 PASS** (68 files) |
| `pnpm --filter ./apps/web build` | **PASS** |

### Deployment recommendation

**HOLD until H+72** unless a web deploy is explicitly required for stakeholder testing.

- Production API baseline unchanged (Phase 0B on ingest path; no trust/replay/lineage behavior change).
- Web fix is build/test recovery only — client bundle no longer pulls `node:crypto`.
- Phase 0C deploy remains on existing burn-in hold per `PHASE-0C-GIT-RECONCILIATION.md`.
- **Do not deploy automatically.**

---

## Final verdict

# **WEB BOUNDARY FIX VERIFIED**

Client bundle no longer transitively imports `node:crypto`. Server/API hash and ID primitives unchanged. Web test and build both green.

### Reconciliation verdict

*(Updated after commit/push)*

**Not deployed** (by instruction).
