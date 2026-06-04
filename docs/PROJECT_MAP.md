# Project Map

| Path | Purpose | Agent notes |
| --- | --- | --- |
| `src/app/` | Next App Router pages and API routes | Route handlers should stay thin |
| `src/app/api/` | API endpoints | Use guards, validation, DTO, `jsonOk`/`jsonError` |
| `src/client/api/` | Browser API clients | Prefer over direct fetch in UI |
| `src/client/hooks/` | Client orchestration hooks | Keep UI components mostly presentational |
| `src/client/viewmodels/` | DTO-to-view-model mapping | Keep raw API/DB shapes out of deep UI |
| `src/client/stores/` | Client UI/entity stores | Do not persist secrets or Discord tokens |
| `src/components/` | Shared UI components | No domain side effects |
| `src/features/` | Feature-level UI views | Map DTO to view models before rendering |
| `src/domain/services/` | Business use cases | Put stateful business operations here |
| `src/domain/state/` | State machines | Transitions and guards live here |
| `src/domain/vectors/` | Questionnaire/vector scoring logic | Keep deterministic and selfcheckable |
| `src/lib/auth/` | Session and resource guards | Never trust client `userId` as subject |
| `src/lib/api/` | API response/validation helpers | Use common envelope |
| `src/lib/dto/` | DTO mappers | Prevent raw DB leakage |
| `src/lib/audit/` | Audit events and sanitization | No sensitive metadata |
| `src/lib/idempotency/` | Mutation idempotency | Use for retryable mutations |
| `src/lib/entitlements/` | Plans/features/quotas | Keep billing rules centralized |
| `src/lib/abuse/` | Rate limit helpers | Use for abuse-prone endpoints |
| `src/lib/discord/` | Discord-specific helpers | Keep token handling private |
| `src/models/` | Mongoose schemas | Check indexes and DTO exposure |
| `src/utils/` | Legacy/shared utilities | Prefer newer `src/client/api` for browser transport |
| `scripts/` | Seed/selfcheck/dev scripts | Prefer targeted scripts |
| `seed/` | Seed data | Keep data format compatible with seed scripts |
| `docs/` | Project context | Start at `docs/INDEX.md` |
| `.codex/` | Codex task/report/plan templates | Keep templates compact |

