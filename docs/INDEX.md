# Documentation Index

## Current source of truth

- `README.md` — setup, environment and command overview.
- `AGENTS.md` — repository operating rules.
- `docs/PRODUCT_SPEC.md` — public-free Pair loop and Factor Matching product direction/exclusions.
- `docs/MVP_SPEC.md` — canonical MVP scope and release gates.
- `docs/MVP_FLOWS.md` — detailed acceptance behavior.
- `docs/ARCHITECTURE.md` — current code boundaries and NEW_ONLY runtime.
- `docs/TARGET_DOMAIN_MODEL.md` — implemented semantic Factor and Factor Matching model.
- `docs/TARGET_DOMAIN_OPERATIONS.md` — privacy, versioning, storage and safety invariants.
- `docs/API_CONTRACTS.md` — current HTTP/DTO contracts.
- `docs/SECURITY.md` — auth, authorization, disclosure, deletion and logging rules.
- `docs/TESTING.md` — available checks and guarded database commands.
- `docs/MVP_RELEASE_STATUS.md` — current evidence/gap matrix.
- `docs/PUBLIC_FREE_MVP_EXECUTION.md` — execution ledger for the 2026-08-11 cutover.
- `docs/SCALE_READINESS.md` — measured local performance and remaining capacity risks.
- `docs/RELEASE_RUNBOOK.md` — preflight, migration, rollout, rollback and incidents.
- `docs/SAFETY_RETENTION_EXTERNAL_REVIEW.md` — draft technical packet for named safety, legal/privacy and operations reviewers; not an approval.
- `docs/P0_CAPABILITY_MATRIX.md` — compact implementation/evidence matrix.
- `docs/P0_TWO_USER_E2E.md` — mandatory real two-session acceptance checklist.
- `docs/03-state-machines.md` — current lifecycle transition reference.
- `docs/PROJECT_MAP.md` — current repository map.
- `docs/CODE_REVIEW.md` — review checklist.
- `docs/TROUBLESHOOTING.md` — local failure notes.
- `docs/DOCS_STATUS.md` — active versus historical material.

## By task type

| Task | Read first | Then inspect |
| --- | --- | --- |
| Product/MVP | `PRODUCT_SPEC.md`, `MVP_SPEC.md` | `MVP_FLOWS.md`, current status/ledger |
| Factor/domain | `TARGET_DOMAIN_MODEL.md`, `TARGET_DOMAIN_OPERATIONS.md` | `src/domain/model`, persistence/runtime services |
| Factor Matching | `PRODUCT_SPEC.md`, `TARGET_DOMAIN_MODEL.md`, `API_CONTRACTS.md`, `SECURITY.md` | `src/domain/model/matching`, `src/domain/services/matching`, matching models/routes/scripts |
| API route | `API_CONTRACTS.md`, `SECURITY.md` | route, domain service, DTO |
| Frontend | `ARCHITECTURE.md` | `src/features`, `src/components`, `src/client` |
| Auth/privacy | `SECURITY.md`, `TARGET_DOMAIN_OPERATIONS.md` | guards, DTO/disclosure, audit, deletion/session services |
| Model/schema | `ARCHITECTURE.md`, `SECURITY.md` | model, indexes, migration, DTO consumers |
| Release | `MVP_RELEASE_STATUS.md`, `RELEASE_RUNBOOK.md` | `TESTING.md`, `SCALE_READINESS.md`, execution ledger |
| Documentation only | `INDEX.md`, `DOCS_STATUS.md` | affected active docs only |

## Historical material

The following paths are useful only for archaeology unless explicitly revalidated:

- `docs/01-product-loop.md`, `docs/02-domain-model.md`, `docs/04-api-contracts.md`, `docs/05-analytics-events.md`, `docs/06-entitlements-billing.md`, `docs/07-security-privacy.md`;
- archived activity snapshots and dated working inventories under `docs/activities/`;
- `docs/problems/**`, `docs/_evidence/**`, `docs/_inventory/**`.

They may describe six-axis vectors, diagnostics, paywalls or pre-cutover schemas. They do not override the active NEW_ONLY/free-core documents above. Architecture decisions live in `docs/ADR/README.md`.

## Agent process

- `docs/AGENT_OPERATING_MODES.md` — task classification.
- `docs/TASK_PACKS.md` — scoped read/check packs.
- `docs/CONTEXT_BUDGET.md` — planning guidance.
- `docs/AGENT_RETROSPECTIVE.md` — recurring mistakes and safeguards.
