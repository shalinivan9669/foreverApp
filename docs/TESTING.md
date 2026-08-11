# Testing

Status: active verification matrix. Run checks by blast radius; database commands require an isolated local replica set.

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
| `npm run selfcheck:reliability-reconciliation` | Failure/retry/lease/reconciliation on guarded local `foreverapp_rc` |
| `npm run release:load-smoke` | Two comparable hot-pair concurrency/query-plan runs |

Example PowerShell environment:

```powershell
$env:MONGODB_URI='mongodb://127.0.0.1:27018/foreverapp_factor_test?replicaSet=rs0&directConnection=true'
$env:JWT_SECRET='local-test-secret-at-least-32-characters'
npm run integration:factor-engine-runtime
```

Use a fresh database name per suite if scripts can overlap. The reliability command is the documented exception and requires exactly the guarded `foreverapp_rc` URI from its source/runbook.

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

Apply modes require the exact flags/confirmation variables in [RELEASE_RUNBOOK.md](./RELEASE_RUNBOOK.md). Test apply on a restored disposable fixture, rerun dry-run and integration, and compare aggregate counts/index names only. Some utilities are deliberately local `_test`-only; they are evidence/harnesses, not authority to mutate production.

## Browser/mobile gate

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
