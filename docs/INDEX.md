# Documentation Index

## Start here

- `README.md` - human setup and overview.
- `AGENTS.md` - agent operating rules.
- `docs/PRODUCT_SPEC.md` - canonical product direction, principles, phase boundaries, and rejected ideas.
- `docs/MVP_SPEC.md` - canonical MVP scope, gates, and core flow.
- `docs/MVP_FLOWS.md` - detailed MVP acceptance criteria and delivery checklist.
- `docs/P0_CAPABILITY_MATRIX.md` - P0 implementation evidence and remaining pilot gates.
- `docs/P0_TWO_USER_E2E.md` - mandatory two-account pilot verification checklist.
- `docs/TARGET_DOMAIN_MODEL.md` - target typed entities and computation model.
- `docs/TARGET_DOMAIN_OPERATIONS.md` - privacy, safety, versioning, storage, scaling, and AI boundaries.
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
| Product/MVP planning | `docs/PRODUCT_SPEC.md`, `docs/MVP_SPEC.md` | relevant MVP/domain appendix, then current contracts/code; dated snapshots only for archaeology |
| API route change | `docs/API_CONTRACTS.md` | `src/app/api`, `src/domain/services`, `src/lib/dto` |
| Frontend UI change | `docs/ARCHITECTURE.md` | `src/features`, `src/components`, `src/client/api` |
| Auth/security change | `docs/SECURITY.md` | `src/lib/auth`, `src/app/api`, `src/domain/services` |
| Matching logic | `docs/ARCHITECTURE.md` | `src/domain/services/match.service.ts`, `src/domain/state` |
| Pair/activity logic | `docs/ARCHITECTURE.md` | `src/domain/services`, `src/models/PairActivity.ts` |
| Mongoose model change | `docs/ARCHITECTURE.md` | `src/models`, `src/lib/dto`, `src/app/api` |
| Documentation-only change | `docs/INDEX.md` | affected docs only |
| Tooling/scripts change | `docs/TESTING.md` | `package.json`, `scripts`, `.codex` |

## Existing detailed docs

- `docs/PRODUCT_SPEC.md` - target product source of truth.
- `docs/MVP_SPEC.md` - MVP and commercial launch gates source of truth.
- `docs/MVP_FLOWS.md` - detailed MVP flows, acceptance criteria, and delivery gates.
- `docs/P0_CAPABILITY_MATRIX.md` - current P0 capability/evidence matrix; implementation-ready is not the same as pilot-complete.
- `docs/P0_TWO_USER_E2E.md` - manual two-new-account release gate for invite, weekly, recommendation, feedback, history, and safety flows.
- `docs/TARGET_DOMAIN_MODEL.md` - target domain/computation source of truth.
- `docs/TARGET_DOMAIN_OPERATIONS.md` - target privacy/safety/versioning/scaling boundaries.
- `docs/01-product-loop.md` - dated historical product-flow snapshot; re-audit before using evidence.
- `docs/02-domain-model.md` - dated historical domain snapshot; re-audit before using evidence.
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
