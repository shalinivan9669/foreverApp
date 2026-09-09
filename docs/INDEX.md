# Documentation Index

## Current source of truth

- [Пользовательские маршруты: аудит и безопасные исправления — 2026-09-09](USER_JOURNEY_GAPS.md) — исправления пауз, прежних знакомств, дневника, уведомлений и подсказок; недавние завершённые занятия. Открыты выбор состояния, интерфейс разблокировки и полная история; отложенные возможности перечислены отдельно.

- [Промпт реализации характеристик, matching и профиля пары](FACTOR_PROFILE_IMPLEMENTATION_PROMPT.md) — окончательная постановка: отдельные характеристики в шести областях, одноразовые тесты, использование результатов по назначению и разрешениям; повтор за монеты отложен.

- [Анкеты → характеристики → профиль пары: аудит 2026-09-09](FACTOR_PROFILE_AUDIT.md) — подтверждённые разрывы основной механики; расчёт недельной сводки работает, сквозное обновление характеристик после обычных анкет не реализовано.

- [Продуктовые маршруты: реализация и приёмка 2026-09-09](PRODUCT_FLOW_ACCEPTANCE.md) — первый вход до поиска, единое ограничение знакомств, адресные уведомления, следующий шаг и принятие приглашения из личного профиля; проверенные сценарии и внешние ограничения.

- [Продолжение продуктовых маршрутов: задача от 2026-09-09](PRODUCT_FLOW_CONTINUATION_PROMPT.md) — исходная постановка владельца. Актуальная реализация и доказательства находятся в отчёте выше.

- [Согласованный продукт: реализация и проверки 2026-09-05](PRODUCT_IMPLEMENTATION.md) — текущее расширение после первого аудита.
- [Приёмка двумя пользователями](TWO_USER_ACCEPTANCE.md) — локальные синтетические сценарии, актуальное состояние и порядок проверки в Discord.
- [Автономная локальная приёмка](LOCAL_ACCEPTANCE.md) — запуск собственного тестового MongoDB, шести интеграционных наборов и двух браузерных сессий без реальных секретов.
- [Решения владельца](PRODUCT_DECISIONS.md) — ответы на 27 вопросов и явно отложенные функции.
- [Вход и связывание](ENTRY_AND_PAIRING_UPDATE.md), [Matching и знакомство](MATCHING_PRODUCT_UPDATE.md), [библиотека/общая жизнь](PRODUCT_WORKSPACE_UPDATE.md), [экономика](ECONOMY_UPDATE.md) — новые контракты и сценарии.
- [Настройки событий пары](PAIR_EVENT_SETTINGS_UPDATE.md) — общая дата отношений, праздники, история и конкурентные изменения.

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
- `docs/CURRENT_PILOT_HANDOFF.md` — historical pilot handoff before the 2026-09-05 implementation; current results are in `PRODUCT_IMPLEMENTATION.md`.
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
| Current implementation / historical pilot | `PRODUCT_IMPLEMENTATION.md`, `CURRENT_PILOT_HANDOFF.md` | relevant active flow/security/release documents |
| Documentation only | `INDEX.md`, `DOCS_STATUS.md` | affected active docs only |

## Historical material

The following paths are useful only for archaeology unless explicitly revalidated:

- `docs/01-product-loop.md`, `docs/02-domain-model.md`, `docs/04-api-contracts.md`, `docs/05-analytics-events.md`, `docs/06-entitlements-billing.md`, `docs/07-security-privacy.md`;
- archived activity snapshots and dated working inventories under `docs/activities/`;
- `docs/problems/**`, `docs/_evidence/**`, `docs/_inventory/**`.

They may describe six-axis vectors, diagnostics, paywalls or pre-cutover schemas. They do not override the active NEW_ONLY/free-core documents above. Architecture decisions live in `docs/ADR/README.md`.

## Agent process

- [Измерительные анкеты и характеристики](FACTOR_MEASUREMENT_CONTRACT.md) — значения, одноразовость, приватность и совместимость.
- [Приёмка механики характеристик](FACTOR_MEASUREMENT_ACCEPTANCE.md) — воспроизводимые проверки и границы локальной проверки.

- `docs/AGENT_OPERATING_MODES.md` — task classification.
- `docs/TASK_PACKS.md` — scoped read/check packs.
- `docs/CONTEXT_BUDGET.md` — planning guidance.
- `docs/AGENT_RETROSPECTIVE.md` — recurring mistakes and safeguards.

## UX/UI planning — 2026-09-07

- [Реализация и приёмка UX/UI](UX_UI_ACCEPTANCE.md) — изменения и ограниченная локальная приёмка от 7 сентября. Новые замечания владельца от 9 сентября открывают дополнительную работу по пользовательским маршрутам; прежний отчёт не подтверждает полную продуктовую готовность.
- [План реализации UX/UI «Вместе»](UX_UI_IMPLEMENTATION_PLAN.md) — исходный план, карта маршрутов и критерии приёмки. Актуальный результат находится в отчёте выше.
- [UI-основа и диалоги](UX_UI_FOUNDATION.md), [анкеты и знакомства](UX_UI_FORMS.md), [библиотека и общая жизнь](UX_UI_WORKSPACE.md) — поведение реализованных потоков.

## Target-product audit — 2026-09-05

- [Product questions awaiting owner answers](PRODUCT_DECISIONS_PENDING.md) — 27 questions and an answer template for the full product contour; proposals remain unapproved, account-deletion work is owner-deferred.
- [First audit baseline and product mapping](audits/2026-09-05-baseline.md) — revision, source integrity, 76-requirement coverage, decisions, discrepancies, executed checks and a historical next-task recommendation now deferred by the owner; does not certify release readiness.
- [Analytics and Factor Matching evidence](audits/2026-09-05-analytics-matching.md) — real consumers, legacy boundaries, purpose/consent and connection gaps.
- [Auth, onboarding and privacy evidence](audits/2026-09-05-auth-privacy.md) — fresh-user path, disclosure, export/deletion and recovery findings.
- [Pair, content and economy evidence](audits/2026-09-05-pair-content-economy.md) — cycle, activity, events, history, rewards and roadmap boundaries.
