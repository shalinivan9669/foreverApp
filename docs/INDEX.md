# Documentation Index

## Start here

- `README.md` - human setup and overview.
- `AGENTS.md` - agent operating rules.
- `docs/PROJECT_MAP.md` - codebase map.
- `docs/ARCHITECTURE.md` - architecture boundaries.
- `docs/API_CONTRACTS.md` - API envelope, validation, DTO rules.
- `docs/SECURITY.md` - auth, resource access, PII, logging.
- `docs/TESTING.md` - checks and when to run them.
- `docs/CODE_REVIEW.md` - review checklist.
- `docs/TROUBLESHOOTING.md` - common local/dev failures.
- `docs/DOCS_STATUS.md` - active vs historical/archive docs.
- `docs/AGENT_OPERATING_MODES.md` - required Codex task modes.
- `docs/TASK_PACKS.md` - task-specific read/inspect/check packs.
- `docs/CONTEXT_BUDGET.md` - context limits before planning.

## By task type

| Task type | Read first | Then inspect |
| --- | --- | --- |
| API route change | `docs/API_CONTRACTS.md` | `src/app/api`, `src/domain/services`, `src/lib/dto` |
| Frontend UI change | `docs/ARCHITECTURE.md` | `src/features`, `src/components`, `src/client/api` |
| Auth/security change | `docs/SECURITY.md` | `src/lib/auth`, `src/app/api`, `src/domain/services` |
| Matching logic | `docs/ARCHITECTURE.md` | `src/domain/services/match.service.ts`, `src/domain/state` |
| Pair/activity logic | `docs/ARCHITECTURE.md` | `src/domain/services`, `src/models/PairActivity.ts` |
| Mongoose model change | `docs/ARCHITECTURE.md` | `src/models`, `src/lib/dto`, `src/app/api` |
| Documentation-only change | `docs/INDEX.md` | affected docs only |
| Tooling/scripts change | `docs/TESTING.md` | `package.json`, `scripts`, `.codex` |

## Existing detailed docs

- `docs/01-product-loop.md` - product loop and user journey.
- `docs/02-domain-model.md` - domain entities, relations, canonical activity model.
- `docs/03-state-machines.md` - observed and centralized state transitions.
- `docs/04-api-contracts.md` - detailed historical API inventory and contract updates.
- `docs/05-analytics-events.md` - analytics/audit event notes.
- `docs/06-entitlements-billing.md` - plans, entitlements, quotas.
- `docs/07-security-privacy.md` - detailed security/privacy history.
- `docs/08-typography.md` - typography decisions.
- `docs/engineering/README.md` - engineering playbooks and checklists.
- `docs/ADR/README.md` - architecture decision records.
- `docs/problems/README.md` - archived problem reports and status.
- `docs/_evidence/` - evidence snapshots used by previous audits.
- `docs/_inventory/` - inventory notes.
- `docs/AGENT_RETROSPECTIVE.md` - repeated agent mistakes and new rules/checks.

## Do not read everything

If the task is scoped, read only the relevant docs and files. Do not scan the whole repository unless the task explicitly asks for architecture audit, migration, or broad refactor.
