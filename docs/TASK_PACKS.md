# Task Packs

Use this file before manually browsing docs.

| Task type | Read first | Inspect next | Allowed edit areas | Minimum checks | Extra checks |
| --- | --- | --- | --- | --- | --- |
| Frontend UI | `docs/ARCHITECTURE.md`, `docs/TESTING.md` | `src/features`, `src/components`, `src/client/hooks`, `src/client/api` | UI/viewmodel/hook docs for one flow | `npm run check:agents:changed`, lint relevant files if available | build if shared UI or routing changed |
| API route | `docs/API_CONTRACTS.md`, `docs/SECURITY.md` | target `src/app/api/**/route.ts`, related service, DTO | route/service/DTO/docs for one endpoint | typecheck, `npm run check:agents:changed` | targeted selfcheck/build |
| Domain service | `docs/ARCHITECTURE.md`, `docs/TESTING.md` | `src/domain/services`, `src/domain/state`, related models | service/state/docs | typecheck, targeted selfcheck | build |
| Auth/security | `docs/SECURITY.md`, `docs/API_CONTRACTS.md` | `src/lib/auth`, target routes/services/DTO | auth/resource guards, DTO/audit docs | typecheck, `npm run check:agents`, targeted security reasoning | full build |
| Model/schema | `docs/ARCHITECTURE.md`, `docs/SECURITY.md` | `src/models`, DTO, routes/services exposing model | models/DTO/docs | typecheck, DTO exposure review | migration notes/build |
| Docs-only | `docs/INDEX.md`, `docs/DOCS_STATUS.md` | affected docs only | docs/templates/README/AGENTS | link/path review | `npm run check:agents:changed` |
| Tooling/scripts | `docs/TESTING.md`, `scripts/AGENTS.md` | `package.json`, target script, docs using command | scripts/tooling docs/package scripts | script smoke check, `npm run check:agents:changed` | typecheck/build if pipeline changed |

