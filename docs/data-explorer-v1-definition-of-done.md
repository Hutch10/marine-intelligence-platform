# Data Explorer v1 Definition of Done

## Surface Audit (Current State)

### Real backend-backed paths

- [x] Dataset list query path (`GET /datasets`) uses typed API route + repository DB reads.
- [x] Dataset detail path (`GET /datasets/:id`) uses typed API route + repository DB reads.
- [x] Dataset related-record path (`GET /datasets/:id/records`) uses typed API route + repository DB reads.
- [x] Workspace summary signals are generated from typed backend dataset results (not static mock text).

### Fallback-only or mock-backed behavior still present

- [x] Workspace `actions` payload is derived from route-backed dataset/page context.
- [x] Workspace `previewSeries` payload is derived from route-backed dataset slice values.
- [x] Workspace `metadata` payload is derived from route-backed source/filter/status context.
- [x] Dataset and related-record fallback paths use explicit degraded empty responses (no synthetic mock rows).
- [x] Data Explorer browser interactions now traverse Next API route boundaries (`/api/data-explorer*`) with typed provenance headers.
- [x] Initial server-render bootstrap now uses the same Next API boundary model, with in-process fallback only for resilience.

### Local-only behavior still present

- [x] Preset persistence now supports a shared repository-backed store with local fallback.
- [ ] Some secondary UI affordances remain local/static (e.g. preview metric cards and suggested next-step text).

## Definition of Done Checklist

### 1) Real data paths

- [x] Primary list/detail/records paths use typed backend route contracts.
- [x] At least one workspace context block is derived from backend data (summary signals).
- [x] All workspace context blocks (`actions`, `previewSeries`, `metadata`, `summarySignals`) are backend-derived.

### 2) Persistence

- [x] Preset schema versioning and migration are implemented.
- [x] Preset IDs are stable and mutation APIs are ID-based.
- [x] Usage tracking (`lastUsedAt`, `useCount`) is persisted.
- [x] Shared/team preset persistence path exists through the API repository/data layer.
- [x] Shared and personal preset scopes are explicit and operator-visible.

### 3) Error handling

- [x] Safe parse/load behavior for corrupt/invalid storage.
- [x] Typed backend fallback reason and source metadata exposed.
- [x] Non-blocking preset usage tracking on apply.
- [x] Operator-visible user-facing messaging for backend unavailable mode is explicit and actionable.

### 4) Test coverage

- [x] Persistence seam tests (save/load/upsert/delete/mark-used/migration).
- [x] Workspace behavior tests (sorting, usage metadata, apply/delete/update flows).
- [x] Shared selector/helper tests for preset presentation logic.
- [x] Client fallback integration tests for typed route-builder recovery.
- [x] Client network-boundary tests for Data Explorer browser-mode API fetch behavior.
- [x] Dataset route tests for dynamic backend-derived summary signals.

### 5) UX completeness

- [x] Preset save/apply/delete/update with compact controls.
- [x] Preset usage metadata display and recency-based sorting.
- [x] Preset in-sync/out-of-sync status and guarded update action.
- [x] Explicit empty/loading/error affordance for workspace-level backend degraded mode.
- [ ] Final operator polish pass for static preview cards and action buttons.
