# Marine Intelligence Platform — Vercel Deployment Configuration

## Critical Changes Applied

### 1. API Entry Point Updated
**File**: `apps/api/api/index.ts`
```typescript
// BEFORE: import { handleRequest } from "../src/server";
// AFTER:  import { handleRequest } from "../dist/api/src/server";
```
**Reason**: TypeScript compilation outputs to `dist/api/src/` due to `rootDir: ".."` in tsconfig.json. The Vercel entry point must import from the compiled output, not source.

### 2. Root-Level Vercel Configuration Created
**File**: `vercel.json` (monorepo root)
```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/api/api/index.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "apps/api/api/index.ts"
    }
  ]
}
```
**Reason**: API must build from monorepo root to resolve workspace dependency `@marine/shared`.

---

## Vercel Dashboard Settings

### Project: marine-api (API)

| Setting | Value | Notes |
|---------|-------|-------|
| **Root Directory** | `.` | Monorepo root. CRITICAL: Must see `packages/shared` for `@marine/shared` dependency |
| **Build Command** | `pnpm --filter api run build` | Compiles TypeScript from `apps/api/src` to `apps/api/dist/api/src` |
| **Install Command** | `pnpm install` | Installs all workspace dependencies including `@marine/shared` |
| **Output Directory** | *(leave blank)* | Vercel uses `vercel.json` build configuration |
| **Node.js Version** | 20.x | Match local development environment |

### Project: marine-web (Frontend)

| Setting | Value | Notes |
|---------|-------|-------|
| **Root Directory** | `apps/web` | Next.js handles workspace deps automatically |
| **Build Command** | `pnpm run build` | Next.js production build |
| **Install Command** | `pnpm install --frozen-lockfile` | Already in `apps/web/vercel.json` |
| **Output Directory** | `.next` | Already in `apps/web/vercel.json` |
| **Framework Preset** | Next.js | Auto-detected |

---

## Environment Variables (Vercel Dashboard)

### marine-api (API) — Production Environment

**REQUIRED — Set these or deployment will FAIL CLOSED:**

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `TURSO_DATABASE_URL` | `libsql://[name]-[org].turso.io` | Turso database connection URL. **DO NOT use localhost or file: in production** |
| `TURSO_AUTH_TOKEN` | `eyJhbGc...` (secret) | Turso authentication token. Mark as **Secret** in Vercel |
| `NODE_ENV` | `production` | Auto-set by Vercel |

**Verification**: When `TURSO_DATABASE_URL` is missing, `apps/api/src/db/async-client.ts` throws:
```
FAIL-CLOSED: TURSO_DATABASE_URL is not set. Configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for production.
```

---

### marine-web (Frontend) — Production Environment

**REQUIRED — Set these or frontend will be disconnected:**

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `NEXT_PUBLIC_MARINE_API_URL` | `https://marine-api.vercel.app` | **Public** API base URL. Baked into client bundle at build time |
| `MARINE_API_BASE_URL` | `https://marine-api.vercel.app` | **Server-side** API base URL for Next.js API routes |
| `NODE_ENV` | `production` | Auto-set by Vercel |

**Verification**: When these are missing:
- Client-side: `CoverageMap.tsx`, `ocean-map/page.tsx` skip fetch, show empty state
- Server-side: `/api/v1/*` routes, `lib/server/*.ts` functions throw configuration error

**Security Note**: `NEXT_PUBLIC_*` variables are **PUBLIC** — they're embedded in the client JavaScript bundle. Never put secrets in `NEXT_PUBLIC_*` variables.

---

## Deployment Sequence

### 1. Set Environment Variables
**In Vercel Dashboard → Project Settings → Environment Variables:**

1. **marine-api project**: Add `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` to **Production** environment
2. **marine-web project**: Add `NEXT_PUBLIC_MARINE_API_URL`, `MARINE_API_BASE_URL` to **Production** environment

**CRITICAL**: Set `NEXT_PUBLIC_MARINE_API_URL` to the **actual deployed API domain**. If the API project is `https://marine-api-xyz.vercel.app`, use that exact URL.

### 2. Update API Project Root Directory
**In Vercel Dashboard → marine-api → Settings → General:**

1. Set **Root Directory** to `.` (period, meaning monorepo root)
2. Click **Save**
3. Vercel will show: "Root Directory: . (Monorepo root)"

### 3. Deploy API First
**Option A: Git Push**
```bash
git add vercel.json apps/api/api/index.ts VERCEL_DEPLOYMENT.md
git commit -m "fix(deploy): configure API for monorepo workspace dependencies"
git push origin main
```

**Option B: Vercel CLI**
```bash
cd C:/Users/hetfw/marine
vercel --prod
```

**Expected Result**: API build succeeds, serverless function deployed at `/apps/api/api/index.ts`

### 4. Verify API Health
**Browser/curl test:**
```bash
curl https://marine-api-[YOUR-DOMAIN].vercel.app/health
```

**Expected Response** (or 404 if /health route doesn't exist — check available routes):
```json
{"status": "ok", "timestamp": "..."}
```

### 5. Update Frontend API URL (if needed)
If the API domain changed from previous deployment:
1. Update `NEXT_PUBLIC_MARINE_API_URL` in **marine-web** Vercel environment variables
2. Trigger a new frontend build (redeploy or git push)

**CRITICAL**: The frontend MUST be rebuilt after changing `NEXT_PUBLIC_*` variables because they're baked in at build time.

### 6. Deploy Frontend
Git push or redeploy marine-web project in Vercel dashboard.

---

## Verification Checklist

### ✅ API Verification

1. **Build succeeded** in Vercel deployment logs
2. **No "workspace dependency" errors** in build logs
3. **Serverless function deployed** — check Functions tab in Vercel dashboard
4. **API responds** at production URL:
   ```bash
   curl https://[api-domain]/health
   # or try a known route like /regions or /operational-alerts
   ```
5. **Database connected** — check logs for Turso connection (no "ephemeral SQLite" warnings)
6. **No localhost:4000 references** in API responses

### ✅ Frontend Verification

1. **Build succeeded** with no missing env var warnings
2. **Environment variables baked in** — check `_buildManifest.js` in deployment (should NOT contain "localhost:4000")
3. **Browser DevTools → Network tab**:
   - API requests go to `https://[api-domain]`, NOT `localhost:4000`
   - No CORS errors
   - No 502 "API unreachable" errors (unless API is actually down)
4. **CoverageMap renders** with live regions (not empty state)
5. **Ocean Map loads** with markers
6. **Console shows no errors** related to missing `NEXT_PUBLIC_MARINE_API_URL`

### ✅ Security & Trust Verification

1. **WITHHELD masking intact** — unverified signals show "WITHHELD" not raw values
2. **TRUST_BLOCKED respected** — low-integrity regions show TRUST_BLOCKED badge
3. **FIELD_TRUTH isolation active** — partition purity metrics visible
4. **No unverified data displayed** — confidence scores show degraded state when appropriate

---

## Expected Behavior by Environment

### Production (Vercel) — FAIL CLOSED
- **Missing `TURSO_DATABASE_URL`** → API crashes with explicit error, does not fall back to SQLite
- **Missing `NEXT_PUBLIC_MARINE_API_URL`** → Frontend shows offline/empty state, does not attempt localhost
- **Missing `MARINE_API_BASE_URL`** → Server-side API routes return 502 with explicit error

### Development (Local) — FAIL OPEN
- **Missing `TURSO_DATABASE_URL`** → Uses local SQLite at `apps/api/local-data/marine.db`
- **Missing `NEXT_PUBLIC_MARINE_API_URL`** → Falls back to `http://localhost:4000`
- **Missing `MARINE_API_BASE_URL`** → Falls back to `http://localhost:4000`

**Detection**: Code checks `process.env.NODE_ENV === "production" || process.env.VERCEL`

---

## Rollback Plan

If deployment fails:

1. **Revert Root Directory**: Set marine-api Root Directory back to `apps/api` (but this will break `@marine/shared` imports)
2. **Revert API entry point**:
   ```bash
   cd apps/api/api
   # Change back to: import { handleRequest } from "../src/server";
   ```
3. **Delete root vercel.json**:
   ```bash
   rm vercel.json
   ```
4. **Redeploy** previous working commit

**Permanent Fix**: If monorepo approach continues to have issues, consider:
- Publishing `@marine/shared` as a private npm package
- Or duplicating types between API and web (NOT RECOMMENDED — violates DRY)

---

## Troubleshooting

### Build Error: "Cannot find module '@marine/shared'"
**Cause**: Root Directory is still set to `apps/api` instead of `.`
**Fix**: Update Vercel dashboard → marine-api → Settings → General → Root Directory to `.`

### Runtime Error: "Cannot find module '../dist/api/src/server'"
**Cause**: Build step didn't run, or dist folder not included in deployment
**Fix**: Verify Build Command is `pnpm --filter api run build` and check deployment Files tab for `apps/api/dist/`

### Frontend shows empty map / "No regions in database"
**Cause**: `NEXT_PUBLIC_MARINE_API_URL` not set or set incorrectly
**Fix**: Set to actual API domain in Vercel env vars, then **rebuild frontend** (redeploy)

### API returns 500: "TURSO_DATABASE_URL is not set"
**Cause**: Environment variable missing in Vercel production environment
**Fix**: Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to marine-api production env vars

### CORS errors in browser console
**Cause**: API and frontend on different domains, CORS headers not configured
**Fix**: Add CORS headers in `apps/api/src/server.ts` (check if already present)

---

## Post-Deployment Monitoring

1. **Vercel Logs**: Monitor real-time function logs in Vercel dashboard
2. **Sentry/Error Tracking**: (if configured) Check for runtime errors
3. **Database**: Monitor Turso connection count and query latency
4. **Trust Metrics**: Verify partition purity and integrity status in production UI

---

## Summary of Files Changed

| File | Change | Reason |
|------|--------|--------|
| `vercel.json` (root) | **Created** — Vercel build config for monorepo API | Route all requests to API entry point |
| `apps/api/api/index.ts` | Import path updated: `../src/server` → `../dist/api/src/server` | Point to compiled output |
| `apps/api/src/db/async-client.ts` | Already updated — production guard added | Fail closed when Turso not configured |
| `apps/web/lib/marine-intelligence.ts` | Already updated — production guard added | Throw error when API URL not configured |
| `apps/web/app/api/v1/*/route.ts` (3 files) | Already updated — localhost fallback removed | Fail closed in production |
| `apps/web/lib/server/*.ts` (2 files) | Already updated — localhost fallback removed | Fail closed in production |
| `apps/web/components/dashboard/CoverageMap.tsx` | Already updated — early return when env var missing | Show empty state instead of attempting localhost |
| `apps/web/app/ocean-map/page.tsx` | Already updated — early return when env var missing | Show empty state instead of attempting localhost |
| `apps/web/components/dashboard/CoverageMap.test.tsx` | Already updated — env var stubbed in test | Fix test broken by production guard |

---

## Deployment Verdict Criteria

### ✅ OPERATIONAL
- API health endpoint responds 200
- Database connected to Turso (not ephemeral SQLite)
- Frontend loads data from production API (no localhost:4000 requests)
- Trust integrity metrics show NORMAL or DEGRADED (not TRUST_BLOCKED)
- Zero configuration errors in logs

### ⚠️ DEGRADED
- API operational but some data sources unavailable
- Trust integrity shows DEGRADED (acceptable operational state)
- Some features disabled due to missing external dependencies (NDBC, ERDDAP, etc.)
- All security boundaries intact (WITHHELD, FIELD_TRUTH, fail-closed behavior)

### ❌ TRUST_BLOCKED
- Database not connected (ephemeral SQLite or connection failure)
- API URL misconfigured (frontend hitting localhost)
- Missing required environment variables
- Security boundaries compromised
- Unverified marine signals displayed

**TRUST_BLOCKED is NOT a deployment failure if authoritative data is genuinely unavailable.** It is the correct fail-closed state when real-world data cannot be verified.

---

## Next Steps After Successful Deployment

1. **Set up Vercel log drains** (Datadog, LogDNA, etc.) for production observability
2. **Configure custom domains** for marine-api and marine-web
3. **Set up monitoring alerts** for Turso connection failures, API 5xx errors
4. **Activate live telemetry** — follow [docs/telemetry-activation/RUNBOOK.md](./docs/telemetry-activation/RUNBOOK.md) (GitHub Actions `ingest:live` cron + Turso secrets)
5. **Document API endpoints** for external consumers (if applicable)
6. **Run security scan** on production deployment (OWASP checks, dependency audit)

---

**Generated**: 2026-05-09  
**Session**: Deployment remediation (context continuation)  
**Status**: Configuration complete, pending manual Vercel dashboard changes and deployment
