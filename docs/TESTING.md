# Testing

Run checks by blast radius. Do not run heavy suites just because they exist.

| Change type | Minimum checks | Extra checks |
| --- | --- | --- |
| docs only | no build required, verify links/paths | none |
| UI component only | lint relevant files if possible | build if shared component |
| client API/hook | typecheck + targeted usage check | build |
| API route | typecheck + targeted route tests/selfcheck | build |
| domain service | unit/selfcheck for service/state | build |
| auth/security | targeted tests + manual reasoning in report | full build |
| model/schema | typecheck + DTO exposure review | migration notes |
| broad refactor | lint + typecheck + build + relevant selfchecks | full suite |

## Existing commands

- `npm run lint` - existing lint command.
- `npm run check:types` - TypeScript no-emit check.
- `npm run check:self` - all fast, database-free selfchecks, including security, activity lifecycle, notifications, entitlement policy, content publication, product analytics, and release readiness.
- `npm run check:agents` - compact agent diagnostics.
- `npm run check:agents:json` - machine-readable agent diagnostics.
- `npm run check:agents:changed` - diagnostics limited to changed files.
- `npm run check:quick` - types plus fast selfchecks.
- `npm run check:build` - Next production build.
- `npm run selfcheck:activity-flow` - activity flow selfcheck.
- `npm run selfcheck:client-errors` - client error mapping selfcheck.
- `npm run selfcheck:security-critical` - targeted auth/resource, OAuth redirect, same-origin/body limits, DTO privacy, audit minimization, lifecycle, and match-confirm ordering selfcheck.
- `npm run selfcheck:notifications` - notification trigger, dedupe, copy, API, and UI source assertions.
- `npm run selfcheck:entitlement-webhook` - first-value/cycle-two entitlement and signed sandbox-webhook policy assertions.
- `npm run selfcheck:content-publication` - publication state/timestamp validation, official seed state, exact participant query filters, and preflight fail-closed assertions.
- `npm run selfcheck:product-analytics` - exact MVP event catalog and the identifier/payload-free event envelope.
- `npm run selfcheck:release-readiness` - environment, health/readiness, Mongo timeout, and release-script assertions.
- `npm run selfcheck:reliability-reconciliation` - real replica-set failure/retry coverage; requires the guarded `foreverapp_rc` local database URI shown below.
- `npm run integration:two-user-mvp` - real MongoDB two-user path from completed onboarding through pair history; requires a local replica set and a database ending in `_test`.
- `npm run integration:privacy-lifecycle` - owner export and reversible deletion-request integration; requires a database ending in `_test`.
- `npm run integration:release-database` - transaction/concurrency, notification ownership, and pair entitlement integration; requires a database ending in `_test`.
- `npm run integration:billing-ordering` - stale/equivalent/conflicting webhook order, cancellation non-resurrection, current provider identity, and more-than-20 legacy subscription resolution; requires a database ending in `_test`.
- `npm run integration:like-idempotency` - same-body replay, changed-body conflict, legacy compatibility, and concurrent like convergence; requires a database ending in `_test`.
- `npm run release:load-smoke` - guarded synthetic hot-pair load/query plan smoke; requires a database ending in `_test`.
- `npm run release:preflight` - read-only invariant and declared-index check.
- `npm run release:preflight:indexes` - explicitly apply additive declared indexes after reviewing the dry run.
- `npm run seed:questions` - seed questionnaire data.

## Local replica-set verification

The release integrations use synthetic, run-scoped identifiers and clean up only their own records. They must never target production. Example PowerShell commands:

```powershell
$env:MONGODB_URI='mongodb://127.0.0.1:27018/foreverapp_integration_test?replicaSet=rs0&directConnection=true'
npm run integration:release-database

$env:MONGODB_URI='mongodb://127.0.0.1:27018/foreverapp_privacy_test?replicaSet=rs0&directConnection=true'
npm run integration:privacy-lifecycle

$env:MONGODB_URI='mongodb://127.0.0.1:27018/foreverapp_two_user_test?replicaSet=rs0&directConnection=true'
npm run integration:two-user-mvp

$env:MONGODB_URI='mongodb://127.0.0.1:27018/foreverapp_billing_test?replicaSet=rs0&directConnection=true'
npm run integration:billing-ordering

$env:MONGODB_URI='mongodb://127.0.0.1:27018/foreverapp_like_test?replicaSet=rs0&directConnection=true'
npm run integration:like-idempotency

$env:MONGODB_URI='mongodb://127.0.0.1:27018/foreverapp_rc?replicaSet=rs0&directConnection=true'
npm run selfcheck:reliability-reconciliation
```

For the release gate, run database integrations independently of `check:quick`; the default quick gate intentionally remains usable without a running database. The exact production build must also receive an HTTP smoke for liveness, readiness, unauthenticated private access, correlation ID, private cache headers, and the exact browser-generated `/.proxy/api/...` transport path. For document responses, assert a distinct CSP nonce per request and that every Next framework/inline script carries the matching nonce; API/proxy JSON responses must remain unaffected. Browser smoke requires a host that supports Next RSC streaming; if the in-app browser closes the RSC connection for every route while HTTP remains healthy, record that host failure and repeat the visual/two-session smoke in Discord or another supported browser. Real Discord OAuth remains an external credential-dependent check.

## Report rule

- Do not paste full command logs.
- Show command, result, and only relevant failure excerpt.
- If a command is unavailable, say exactly why.

## Agent diagnostics

- `error` blocks the change.
- `warning` must be reported but does not block unrelated small tasks.
- `info` is context only.
- Allowlist entries require `rule`, `file`, `reason`, and optional `expires`.
- Expired allowlist entries do not suppress findings.
- Any new allowlist entry must be mentioned in the final report.
