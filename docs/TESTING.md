# Testing

## Private beta B01–B12 — 2026-09-10

`npm run beta:check -- --mongod=<ABSOLUTE_BINARY> --browser-module=<ABSOLUTE_MODULE> --output=<EXTERNAL_DIRECTORY>` выполняет профильный pipeline и пишет identity-bound evidence + полный patch tracked/new files. Подробная методика, prerequisites, scoped режим и обязательные внешние gates: [BETA_VERIFICATION.md](BETA_VERIFICATION.md). Текущие counts берутся только из артефакта конкретного запуска; reported INT-63/64 не переносится автоматически. Отдельный workflow находится в `.github/workflows/private-beta.yml`.

## Measurement feature acceptance — 2026-09-09

Run `npm run acceptance:local -- --mongod <absolute-local-binary> --suite factors` in the owned disposable replica set harness. It runs onboarding-factor-engine, factor-engine-runtime and factor-profile-flow. Golden cases assert literal normalized values for two opposite profiles across all six areas, matching consumption, separate desires/grants, pair disclosure/revocation, once-only concurrency, crash recovery, pinned publications and compatible v7 sources. Product regression uses the same harness with `--suite product`. Neither suite reads application env files or existing DB targets. See [acceptance evidence](FACTOR_MEASUREMENT_ACCEPTANCE.md) for browser checks and limitations.

Status: active verification matrix. Run checks by blast radius; database commands require an isolated local replica set.

## Autonomous local acceptance and pagination, 2026-09-05

`npm run acceptance:local -- --mongod <absolute-path>` now starts a fresh loopback MongoDB replica set, runs the six-suite aggregate and removes only its newly created temporary instance after stopping its processes. `npm run acceptance:browser -- --mongod <absolute-path>` starts the current production build and two fixed synthetic, onboarded participants using real signed sessions. Both modes refuse runtime `.env` files and discard inherited application credentials. See [local launch, guards and browser limits](LOCAL_ACCEPTANCE.md). Existing external-instance integration commands retain their guards.

`selfcheck:local-acceptance` joins `check:self` as the 48th suite and checks argument/port validation, child-environment isolation, cleanup path ownership and fixed bootstrap subjects. Updated `selfcheck:continuation-ui` exercises pagination on the actual hook: coalesced clicks, deduplication, retry after a network failure, stale append versus refresh, and scope/access revocation. `selfcheck:product-workspace` validates strict cursor decoding. The MongoDB workspace suite traverses 65 unfinished records with identical creation timestamps, checks stable boundaries with insertion/completion between requests, and repeats access checks after paid-content revocation and Pair pause/end. Browser rendering and real Discord OAuth remain separate evidence.

## Continuation and published versions, 2026-09-05

`npm run integration:two-user-acceptance` runs six focused entry/matching/invite/workspace/lifecycle suites sequentially. It requires `MATCHING_TEST_MONGODB_URI` with an explicit loopback replica set and a disposable `_test` database name, assigns a fresh database per suite/run, and creates command-local synthetic JWT secrets. It never reads `.env`, falls back to the application DB, starts an HTTP authentication bypass, or drops a database. Each suite cleans only its synthetic fixtures. Economy and pair-event-settings remain separate commands: their existing stricter guard requires the dedicated `127.0.0.1:27029/vmeste_economy_product_test?replicaSet=vmesteTest` target. See [exact commands, current results and Discord checklist](TWO_USER_ACCEPTANCE.md).

The updated workspace integration creates a version-1 run, injects an append-only test publication of version 2 through the typed repository, then reads/completes/replays version 1 and creates a version-2 run. The production catalogue still publishes the original content; the test does not edit it or reinterpret old completions. `selfcheck:product-workspace` also pins a digest of published v1 and checks immutable questions/options, exact/latest lookup and duplicate-revision rejection.

`selfcheck:continuation-ui` joins `check:self` as the 47th suite. It exercises the actual `useDevelopment` and `useSharedLife` hooks with a minimal React adapter: late success/failure, a changed run/Pair, latest loading/error state, explicit refresh and access denial. Pure view-model checks cover unfinished runs, program order, partial/final/paused/closed copy; a focus/visibility adapter checks visible-only refresh, 15-second cooldown and no overlapping automatic request. It also verifies key page links and draft-revision wiring. These checks do not claim rendered browser coverage.

Browser return/refresh, private draft handling and navigation checks remain distinct from actual Discord OAuth, iframe and two-account interaction. Passing local route handlers with genuine synthetic sessions does not certify the external host.

The architecture checker now recognizes the existing `requireEconomyOwner` wrapper only for direct economy subroutes importing `../shared` and actually awaiting it, while also checking that the helper calls `requireSession(req)`. This resolves three pre-existing false positives without allowlist entries or production authentication changes.

## Product expansion verification, 2026-09-05

See [current evidence and manual Discord scenarios](PRODUCT_IMPLEMENTATION.md). `check:self` now includes `selfcheck:entry-pairing`, `selfcheck:matching-product`, `selfcheck:economy` and `selfcheck:product-workspace` in addition to the existing checks.

`selfcheck:client-request-race` reproduces the cancelled-request race found in the local browser smoke. It exercises the actual HTTP transport and `useApi` with a minimal hook adapter: cancel → newer successful request, stale failure, independent loading keys, body-read abort and genuine network failure. The original implementation fails the regression; cancelled/stale requests now leave the current error/loading state intact. Shared-life retry reloads both Pair context and workspace. This brings `check:self` to 46 suites.

New database scripts: `integration:entry-onboarding`, `integration:economy`, `integration:product-workspace`, `integration:pair-event-settings`. They require an explicitly configured isolated local replica set with a database name ending in `_test`, and clean up their own synthetic records. Existing `integration:two-user-mvp`, `integration:pair-lifecycle-remaining`, `integration:matching-social-flow` and `integration:matching-pair-transition` have also passed against that local replica set. Native route-handler probes use genuine signed test sessions and check cache replay after access revocation; this is not a real Discord OAuth/iframe test. Pair-event settings tests hold the unrelated weekly evaluator at `NOT_READY` while exercising real models, guards, activity creation and concurrent transactions.

The workspace suite exercises first-create races, immutable completions, exactly-once rewards, partial/final pair completion, hidden peer notes, paid content, canonical Pair ids, optimistic edits, stale content revision, receipt-only cache and pause/end access. Economy tests additionally cover concurrent purchases, capsule receipts and competing collection transfers. Entry tests cover a fresh minimal OAuth document, all 12 onboarding answers and one first coin. No test command uses the owner's Atlas database.

## Minimum checks by change

| Change | Minimum | Add when relevant |
| --- | --- | --- |
| Docs only | Link/path/status review, `git diff --check` | no build required |
| UI | targeted lint, typecheck | build and mobile/browser smoke for shared/routing changes |
| API/client contract | typecheck, targeted selfcheck/integration | build, disclosure review |
| Domain/Factor | factor selfcheck, typecheck | runtime/migration integration and build |
| Auth/privacy/lifecycle | security selfcheck plus database integration | full lint/build and independent security review |
| Model/index/migration | typecheck, dry-run, DTO/export/deletion review | guarded apply on disposable `_test` fixture |
| Broad release | lint, types, selfchecks, agents, build, diff, audit | all applicable integrations, migrations, load and browser gates |

## Static and database-free gates

Дополнительные регрессии пользовательских маршрутов: `npm run selfcheck:personal-diary-ui` исполняет реальные обработчики формы и схему транспорта для очистки/замены дневника и обновления нетронутого поля; `npm run selfcheck:notifications-pagination` проверяет реальный hook на отложенных ответах API, пагинации, retry, refresh, прочтении, потере доступа и unmount. Оба включены в `check:self`. `selfcheck:matching-product` также выполняет getMatchingInbox с изолированными адаптерами моделей и проверяет сохранение PAUSED при повторном чтении. Эти тесты не являются MongoDB/Discord/browser acceptance.

```text
npm run lint
npm run check:types
npm run check:self
npm run check:agents
npm run build
git diff --check
npm audit --omit=dev
```

Important focused commands:

- `npm run selfcheck:factor-engine` — registry/hash, values, all ten strategies, evidence isolation, replay, disclosure and recommendations.
- `npm run selfcheck:legacy-cutover` — legacy files/imports/fields/fallbacks/routes/UI and core billing gates are absent.
- `npm run selfcheck:weekly-checkin`, `selfcheck:weekly-cycle` — explicit input, privacy, cycle/canonical result invariants.
- `npm run selfcheck:pair-activity-decision`, `selfcheck:activity-flow` — decision and lifecycle/feedback/Factor binding.
- `npm run selfcheck:safety-gate`, `selfcheck:security-critical` — owner-private veto and request/DTO/audit boundaries.
- `npm run selfcheck:participant-disclosure` — qualitative, non-reconstructable participant responses and legacy match-route removal.
- `npm run selfcheck:frontend-mvp-ui` — active screen wiring, removal of legacy/paywall/placeholder UI, mojibake guard and `HELP_RESOURCE_CATALOG` validation.
- `npm run selfcheck:pair-event-new-only` — safe PairEvent Factor binding/migration plan.
- `npm run selfcheck:notifications`, `selfcheck:pair-history` — bounded neutral feeds.
- `npm run selfcheck:operational-events`, `selfcheck:release-readiness` — metrics/env/health/release script contracts.
- `npm run selfcheck:entitlement-webhook` — isolated sandbox infrastructure only; passing it does not make billing a core dependency.

### Factor Matching focused gates

- `npm run verify:matching:code` — typecheck plus matching boundaries, Factor policy/golden cases, social lifecycle, API/UI/disclosure/migration, Discord bootstrap and pure intelligence integration. It does not run the database-target guard or Atlas/replica-set suites.
- `npm run selfcheck:matching-boundaries`, `selfcheck:matching-factor-policy`, `selfcheck:matching-golden-cases` — separation from legacy scoring, explicit Factor-use policy and deterministic qualitative cases.
- `npm run selfcheck:matching-social`, `selfcheck:matching-api-contract`, `selfcheck:matching-ui`, `selfcheck:matching-disclosure` — state/actor/idempotency, route/DTO, screen and negative-disclosure contracts.
- `npm run selfcheck:matching-test-database`, `selfcheck:matching-migration`, `selfcheck:discord-bootstrap` — guarded target parsing, migration modes/legacy mapping and two-session bootstrap contract.
- `npm run integration:matching-intelligence` — database-free port-backed actual/preference/evaluation integration.

`npm run check:self` includes all matching selfchecks, including `selfcheck:matching-test-database`; `verify:matching:code` is the narrower matching aggregate described above.

`npm run check:self` is database-free. It is necessary but cannot replace persistence, concurrency, privacy or migration integrations.

## MongoDB integrations

All integration databases must be disposable and end in `_test`; each script uses run-scoped fixtures and must clean its own data. Never weaken a URI guard or point a test/migration/load script at production.

| Command | Coverage |
| --- | --- |
| `npm run integration:factor-engine-runtime` | Registry seed, evidence/snapshot persistence, immutable replay, versions and concurrency |
| `npm run integration:factor-engine-cutover` | Raw-source replay, legacy-only/mixed/invalid/idempotent NEW_ONLY cutover |
| `npm run integration:onboarding-factor-engine` | Onboarding source → semantic evidence/snapshots |
| `npm run integration:questionnaire-new-only` | Strict immutable owner questionnaire, no legacy scoring/disclosure |
| `npm run integration:pair-questionnaire-concurrency` | Fail-closed duplicate migration, canonical indexes, concurrent start/answer convergence and deterministic pause/end fencing |
| `npm run integration:pair-event-new-only` | Safe bind/scrub/retire/future-conflict PairEvent migration |
| `npm run integration:pair-context-lifecycle` | Pair end races, weekly current/claim/skip versus end, claim versus pause, old-id denial and new-context reconnect |
| `npm run integration:activity-lifecycle-races` | Activity start/feedback/recommendation notification versus Pair pause/end transaction fences |
| `npm run integration:partner-signal` | Explicit send, unique source binding, conflict and TTL |
| `npm run integration:privacy-lifecycle` | Bounded owner export and request/cancel lifecycle |
| `npm run integration:privacy-deletion-execution` | Account write-lease drain/reclaim, destructive cleanup, inverse writer race and durable session revocation |
| `npm run integration:privacy-factor-export` | Owner Factor export and pair-summary disclosure |
| `npm run integration:two-user-mvp` | Two users, three complete free weekly/action cycles and history/privacy assertions |
| `npm run integration:release-database` | Transaction/concurrency and notification/storage invariants |
| `npm run integration:matching-social-flow` | MatchingProfile/feed grant, Like/response/connection/block qualitative social flow on a guarded test replica set |
| `npm run integration:matching-idempotency-races` | Matching mutation replay, changed-body conflict and concurrent canonical-effect races |
| `npm run integration:matching-security-privacy` | Session subject, grant binding, negative disclosure, export/deletion and cross-user denial |
| `npm run integration:matching-pair-transition` | Two-party MatchingConnection confirmation, one Pair/two source-tagged claims and block/active-Pair races |
| `npm run integration:matching-atlas` | Ordered aggregate of the four matching database suites above; accepts Atlas/sharded or local replica-set `_test` target |
| `npm run selfcheck:reliability-reconciliation` | Failure/retry/lease/reconciliation on guarded local `foreverapp_rc` |
| `npm run release:load-smoke` | Two comparable hot-pair concurrency/query-plan runs |

Example PowerShell environment:

```powershell
$env:MONGODB_URI='mongodb://127.0.0.1:27018/foreverapp_factor_test?replicaSet=rs0&directConnection=true'
$env:JWT_SECRET='local-test-secret-at-least-32-characters'
npm run integration:factor-engine-runtime
```

Use a fresh database name per suite if scripts can overlap. The reliability command is the documented exception and requires exactly the guarded `foreverapp_rc` URI from its source/runbook.

Matching database/release commands use command-scoped `MATCHING_TEST_MONGODB_URI` rather than the application runtime connection. This is not a new production environment contract: the guard requires a database name ending in `_test`, rejects production-like names and is intentionally unusable as production-mutation authority.

```powershell
$env:MATCHING_TEST_MONGODB_URI='mongodb://127.0.0.1:27018/foreverapp_matching_test?replicaSet=rs0&directConnection=true'
npm run selfcheck:matching-test-database
npm run integration:matching-atlas
```

## Migration verification

Migrations are dry-run by default:

```text
npm run release:migrate-factor-engine
npm run release:migrate-pair-events-new-only
npm run release:preflight:pair-questionnaires
npm run release:migrate-pair-context-index
npm run release:migrate-partner-signals
npm run release:migrate-privacy-requests-v2
npm run release:migrate-weekly-checkins
```

Factor Matching migration uses exactly three modes:

```powershell
# Read-only plan; DRY_RUN is the default.
npm run release:matching-migrate

# Apply only on a reviewed disposable/restored _test target.
$env:MATCHING_MIGRATION_CONFIRM='APPLY_ADDITIVE_MATCHING_MIGRATION'
npm run release:matching-migrate -- --mode=APPLY_ADDITIVE

# Require zero findings and zero pending rows/indexes.
npm run release:matching-migrate -- --mode=VERIFY
```

`release:migrate-matching` is an exact alias. `release:matching-preflight` is read-only unless an explicitly reviewed additive-index flag is forwarded; `release:matching-load-smoke` is writeful synthetic test work and cleans run-scoped fixtures. All three require the guarded `MATCHING_TEST_MONGODB_URI`.

`npm run verify:matching:release` runs matching preflight → migration `VERIFY` → `integration:matching-atlas` → matching load smoke. It never runs `APPLY_ADDITIVE`. Without `MATCHING_TEST_MONGODB_URI`, it must fail with `MATCHING_TEST_MONGODB_URI_REQUIRED` and cannot be recorded as Atlas validation.

Apply modes require the exact flags/confirmation variables in [RELEASE_RUNBOOK.md](./RELEASE_RUNBOOK.md). Test apply on a restored disposable fixture, rerun dry-run and integration, and compare aggregate counts/index names only. Some utilities are deliberately local `_test`-only; they are evidence/harnesses, not authority to mutate production.

## Browser/mobile gate

UX/UI regression commands added on 2026-09-07 (all included in `check:self`, with `today-ui` also imported by `frontend-mvp-ui`):

- `selfcheck:today-ui` / `selfcheck:today-request-race`: CTA priority/lifecycle/readiness and delayed responses during a Pair switch.
- `selfcheck:dialog`: native dialog focus/return, nested lifecycle, busy close guards and scroll-lock ownership using an adapter executing the real component.
- `selfcheck:unsaved-changes`: the actual hook against event adapters; refusal, pending mutation, multiple forms, Back/navigation approval, cleanup and unload. This does not claim native confirmation UI was controlled inside every embedded host.
- `selfcheck:ui-contrast`: token contrast against all five actual surfaces and reduced-motion/CSS invariants.
- `selfcheck:workspace-ui`: task, calendar, budget, goal, memory projections and conflict rebase behavior.
- `selfcheck:matching-request-race`: stale feed/connection responses, access-loss hiding and mutation locking. `selfcheck:matching-ui` also covers composer steps, hard boundaries and stable retry intent.

Actual browser results and their host limitations are recorded in [UX_UI_ACCEPTANCE.md](UX_UI_ACCEPTANCE.md). Additional guarded fixture modes are documented in [LOCAL_ACCEPTANCE.md](LOCAL_ACCEPTANCE.md).

Verify the exact production build, not only dev mode:

- liveness/readiness, unauthenticated private route, correlation id, cache headers and `/.proxy/api/...` transport;
- distinct CSP nonce per document and matching nonce on Next scripts;
- two independent authenticated sessions in a supported Discord/browser host;
- refresh/back/retry, loading/error/empty states and no dead controls;
- 320, 360, 390 and 430 px widths; horizontal overflow, safe area, keyboard, focus and touch targets;
- no axis/radar/percentage/paywall/placeholder or private peer data.

An in-app-browser RSC host failure is not an application pass; repeat in Discord or another supported browser and record the environment.

## Evidence rules

- Record command, build/database alias, pass/fail and a short sanitized summary.
- Do not paste full logs, secrets, ids, answers, notes or duplicate keys.
- A previous release's result is baseline evidence, not proof for a changed tree.
- Source-string assertions supplement but do not replace behavior/integration tests.
- Agent warnings need resolution or explicit justification; allowlist additions must be reported.

## Проверки продуктовых маршрутов — 2026-09-09

Отдельная последующая проверка `npm run acceptance:local -- --mongod 'C:\path\to\mongod.exe' --suite factors` запускает три набора аналитической цепочки. Её PASS подтверждает наблюдаемое поведение, включая пять явно отсутствующих продуктовых связей; `questionnaireProfileWorkflowReady` остаётся false. См. [FACTOR_PROFILE_AUDIT.md](FACTOR_PROFILE_AUDIT.md). Этот аудит не входит в обычный release gate; при реализации измеряемых анкет ожидания отсутствия расчёта необходимо заменить целевыми регрессиями.

- `npm run selfcheck:profile-pair-invite` проверяет разбор ключа/кода/ссылки, отдельное согласие, ожидание второго подтверждения, prerequisites, активную пару, повтор мутации и поздний ответ после размонтирования.
- `selfcheck:matching-ui` включает регрессию сериализации GET preference DTO в strict PUT и отрисовку отдельного шага разрешений/публикации. `matching-social-flow.integration` выполняет первый черновик без готовых matching snapshots/grants, затем явные разрешения и отдельную публикацию.
- `selfcheck:notifications` проверяет адреса/выполненность/устаревание, выбор формы текущего пользователя, guards и карточку с восстановлением после сохранённого отзыва. `acceptance:browser --scenario notifications` дополнительно проверяет адресное чтение старше205 записей и отрицательные API-случаи на собственном replica set.
- `selfcheck:today-ui` и `selfcheck:today-request-race` проверяют entry/onboarding/место/карточку/поиск/приглашение, приоритет серверного парного шага, ожидание и гонки.
- `acceptance:browser --scenario first-entry` не заполняет ни entry, ни onboarding, ни matching за пользователя. Полный маршрут выполняется через UI. Итоговые доказательства и ограничения: [PRODUCT_FLOW_ACCEPTANCE.md](PRODUCT_FLOW_ACCEPTANCE.md).
