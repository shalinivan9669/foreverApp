# Release and operations runbook

Status: local release-candidate procedure. Production deploy, secrets, billing activation, and destructive data decisions require explicit authorization.

## 0. Evidence status

The repository has local synthetic evidence for the release preflight, MongoDB reconciliation/idempotency behavior, transaction races, additive indexes, the bounded load profile in [SCALE_READINESS.md](./SCALE_READINESS.md), and post-fix production-browser hydration plus 390x844 overflow/navigation smoke. That evidence came from a local one-node MongoDB replica set and an in-app browser outside Discord; it is not production or real-Discord verification.

There is no production evidence yet for latency, availability, failover, backup RPO/RTO, alert delivery, Discord behavior, billing behavior, or real privacy/retention operations. Keep those as external release blockers until named owners record the results.

`npm run release:load-smoke` intentionally refuses a database whose name does not end in `_test`. Never weaken or bypass that guard, and never point this command at production.

## 1. Environment contract

Required at runtime: `MONGODB_URI`, `JWT_SECRET` (at least 32 characters), `NEXT_PUBLIC_DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and one of `DISCORD_REDIRECT_URI` or `NEXT_PUBLIC_DISCORD_REDIRECT_URI`.

Optional boundaries:

- `ENTITLEMENTS_ADMIN_KEY` — at least 32 characters when the controlled grant endpoint is enabled;
- `BILLING_MODE=disabled|sandbox` — defaults to disabled;
- `BILLING_WEBHOOK_SECRET` — required when billing mode is not disabled;
- `TRUSTED_PROXY_MODE=disabled|x-forwarded-for` — defaults to disabled. Enable forwarded IP only behind ingress that overwrites and validates the header. When disabled, anonymous IP limits are inactive rather than globally shared; production OAuth/webhook IP abuse protection therefore requires trusted ingress.

Never print values during validation. `/api/health/live` reports process liveness only; `/api/health/ready` validates required configuration and a bounded MongoDB ping but returns no failure detail.

## 2. Pre-release checklist

Run this checklist against the exact build and database intended for the release. Record the environment name, database name, build identifier, operator, maintenance window, and rollback artifact without copying secrets.

1. Run the read-only general preflight: `npm run release:preflight`. On an upgrade database, the obsolete weekly `{ userId, weekKey }` unique index is an expected release blocker that still must be removed before traffic is enabled.
2. Run the weekly-check-in migration in its default dry-run mode: `npm run release:migrate-weekly-checkins`.
3. Resolve every reported duplicate, malformed, or missing invariant before creating indexes. Keep evidence to aggregate counts and error codes; never store identifiers or private payloads in release notes.
4. Create an encrypted backup of the target database and verify a restore in an isolated environment before any index decision.
5. Before the maintenance window, run typecheck, lint, relevant selfchecks/agent checks, production build, and `git diff --check` serially. On non-production data, run the replica reliability check plus `integration:release-database`, `integration:privacy-lifecycle`, `integration:billing-ordering`, `integration:like-idempotency`, `integration:two-user-mvp`, and `release:load-smoke`. Preserve the exact verified deploy artifact and a pair-scoped-compatible rollback artifact. The reliability check alone uses guarded local `foreverapp_rc`; every integration/load database must end in `_test`.
6. Enter a write-stopped maintenance window. On a fresh database, apply weekly indexes with `npm run release:migrate-weekly-checkins -- --apply-additive-indexes`. On an upgrade database with the obsolete unique index, obtain the separate destructive approval and run `npm run release:migrate-weekly-checkins -- --apply-additive-indexes --drop-legacy-unique`. Do not resume writes between old-index removal and application compatibility verification.
7. Apply remaining indexes with `npm run release:preflight:indexes`, deploy the exact verified build while traffic remains stopped, and rerun both dry-run commands. General preflight must report all 47 invariants passed, no missing required index, and no legacy weekly blocker; weekly dry-run must report no pair-scoped duplicate.
8. Start/smoke the deployed artifact: direct liveness/readiness, unauthenticated private response, and exact browser-generated `/.proxy/api/...` rewrite. For two document requests, verify distinct CSP nonces and a matching nonce on every Next script; verify API JSON is unaffected by page CSP. Complete post-fix interactive hydration/mobile/safe-area/keyboard QA in a supported browser/Discord host.
9. Complete [P0_TWO_USER_E2E.md](./P0_TWO_USER_E2E.md) with two controlled accounts and sanitized evidence.
10. Verify transaction-capable topology, intended indexes, dashboards, alert delivery, backup recency, a named incident owner, and rollback compatibility; only then resume traffic.

Do not proceed when command output indicates an environment/configuration mismatch, an invariant remains unresolved, a backup cannot be restored, or the rollback artifact is incompatible.

## 3. Migration and index rules

- `npm run release:preflight` and `npm run release:migrate-weekly-checkins` are read-only by default.
- Apply indexes only after the matching invariants pass. No release script may delete documents, anonymize users, rewrite private answers, or drop indexes by default.
- The additive-only weekly command may stage pair-scoped indexes, but if a pre-existing legacy `{ userId, weekKey }` unique index remains, release preflight stays blocked. That index rejects a valid solo and pair-scoped check-in for the same user/week and is not a safe rollback-window state for active traffic.
- Dropping the legacy unique index is a separate destructive decision: `npm run release:migrate-weekly-checkins -- --apply-additive-indexes --drop-legacy-unique`. It requires explicit approval, a verified current backup/restore, a write-stopped maintenance window, a completed rollback review, and evidence that deploy/rollback artifacts understand pair-scoped uniqueness. The script verifies removal before reporting readiness and creates the required non-unique user/week lookup.
- Runtime Mongoose connections use `autoIndex: false`. Release preflight/migration commands are the explicit production index path, preventing application startup from silently changing indexes. Preflight covers every indexed production model and blocks before additive apply when a unique-data invariant or obsolete weekly uniqueness remains.
- Additive fields require no data rewrite. Legacy generic-idempotency rows without lease metadata receive a bounded compatibility grace period. Legacy `WeeklyCheckIn` rows without the effects-finalization marker are treated as already finalized and are never replayed; this prevents duplicate effects but cannot reconstruct an old partial failure. Legacy `WeeklyCycle` rows without `expiredReconciliationCompletedAt` enter an indexed pending queue and are repaired/marked in batches of at most eight only after a canonical expired snapshot exists.
- Pair-history indexes are additive: `pair_activity_history_by_pair_status_offered` on `{ pairId: 1, status: 1, offeredAt: -1, _id: -1 }` and `weekly_cycle_history_by_pair_start` on `{ pairId: 1, startsAt: -1, cycleKey: -1 }`. Retain the legacy `{ pairId: 1, startsAt: -1 }` index during the compatibility window.
- Additional additive release indexes include `weekly_cycle_pending_expired_reconciliation`, `uniq_like_creation_key`, `pair_provider_current_subscription_unique`, `activity_template_published_selection`, and `questionnaire_published_catalog`. Preflight blocks duplicate/ambiguous unique identities and invalid documents claiming `published`; legacy or unpublished content is reported and remains unavailable rather than being auto-published.
- Pair-state snapshot joins use MongoDB's built-in `_id_` index; do not add a redundant join index.
- Store command outcomes, aggregate counts, and index names only. Never log raw duplicate keys, user IDs, pair IDs, answers, notes, cookies, authorization data, or tokens.

## 4. Rollout and rollback

Use this order: verified backup/restore, invariant checks, write stop, pair-scoped-compatible deploy and rollback artifacts, approved legacy-index removal when present, additive indexes, exact-build verification, then traffic resume. Keep billing enforcement disabled until signed sandbox webhook, duplicate-delivery, restore, cancel, grace, and cycle-two behavior are verified.

Any sandbox/provider webhook adapter must sign and send `occurredAt` plus monotonic nonnegative `version` before billing mode is enabled. Exercise later, stale, equivalent, conflicting-equal-order, cancellation, and provider-subscription replacement fixtures; do not enable a producer that cannot supply a stable ordering identity.

Every build participating in a rolling deployment must understand generic idempotency states `in_progress`, `completed`, and `failed`, including lease ownership/expiry and same-request takeover. A rollback to pre-lease code is unsafe: an old reader may mishandle a `failed` row because it lacks the replay envelope. The rollback artifact must retain the new reader semantics. If it does not, stop affected mutations and deploy a compatibility patch instead of rolling back directly.

Leave additive fields and indexes in place during an application rollback. Do not delete idempotency records to force progress. A release cannot serve the pair-scoped workflow while the legacy weekly unique index remains. After it is dropped, never roll back to code that assumes the old uniqueness rule; use only the pre-verified pair-scoped-compatible artifact.

When a client sees an unknown outcome after a possible primary commit, retry with the same idempotency key and identical body. Do not mint a fresh key or manually duplicate the mutation. A changed request hash must remain a conflict. Weekly reconciliation must resume the recorded phase and must not manually recreate vector, cycle, or snapshot effects.

Roll back or disable only the smallest affected boundary, then verify recovery with synthetic requests and record the decision. Never remove privacy filters, ownership checks, canonical-record constraints, or reconciliation merely to reduce latency.

## 5. Backup and restore expectations

Create named, encrypted checkpoints before additive-index application, before any approved legacy-index drop, and before first production traffic. Use provider-native snapshots or `mongodump`/`mongorestore` appropriate to the deployment.

Verify each release restore in an isolated database:

- compare aggregate collection counts and rerun release invariants;
- verify unique, lookup, and TTL indexes;
- verify replica-set transaction support and application readiness;
- exercise bounded critical reads and a controlled idempotent mutation/retry;
- record backup age, restore duration, operator, and outcome without sensitive payloads.

Production RPO, RTO, retention, deletion, and restore-drill cadence require explicit owner approval; local restore success does not establish them. Backup access must be least-privilege and audited. Shared-pair artifact retention/deletion follows the approved product and legal policy.

## 6. Incident checklist

1. Stop or disable the smallest affected mutation/provider boundary without deleting evidence.
2. Record time, build, low-cardinality error code, affected capability, and approximate count. Do not put payloads or identifiers in shared channels.
3. Check readiness, MongoDB topology and pool pressure, replication health, retry/conflict rates, slow operations, and recent deploy/migration state.
4. For generic idempotency, inspect aggregate counts of `in_progress`, `failed`, and expired leases. The normal lease is 30 seconds; retry only with the same key and body. A request-hash mismatch is a conflict, not a recovery path.
5. For weekly finalization, inspect phase counts and the 120-second processing lease. Resume through the recorded `effects_applied` marker; do not recreate snapshots, edit private answers, or manufacture completion records manually.
6. Treat any duplicate canonical notification, weekly cycle, pair-state snapshot, or subscription as critical: stop the relevant writer and preserve evidence before repair.
7. For slow pair history, separate expired-cycle reconciliation time from query time and verify the expected index plans. Do not remove reconciliation, privacy projection, or canonical checks as an emergency optimization.
8. Use only a compatibility-safe rollback or feature disable, verify recovery with synthetic requests, and document follow-up tests plus the reconciliation outcome.

Privacy incident additions: revoke exposed access, preserve minimal forensic metadata, avoid contacting a partner with sensitive detail, involve the designated privacy/legal owner, and follow the approved notification/retention policy. Never copy raw answers or intimate notes into tickets.

## 7. Required dashboards and provisional alerts

These dashboards and alert routes are required but have not been verified in production:

- readiness, MongoDB connection/replication health, pool pressure, slow operations, storage/index growth, and TTL lag;
- request count, latency, and error rate by low-cardinality route group;
- auth exchange failures without OAuth data;
- rate-limit, retry, request-hash conflict, lease takeover, and reconciliation counts;
- invite conversion, cycle completion, recommendation acceptance, and activity completion;
- notification delivery/dedupe and webhook signature/dedupe/failure counts;
- backup age, last restore-drill age, restore duration, and restore outcome.

Use provisional thresholds until production baselines and approved SLOs replace them:

- server error rate greater than 1% for 5 minutes;
- critical read p95 greater than 500 ms for 15 minutes;
- critical mutation p95 greater than 1,500 ms for 15 minutes;
- generic idempotency work older than 60 seconds or weekly processing older than 240 seconds;
- lease-takeover or request-hash-conflict rate materially above the established baseline;
- any duplicate canonical notification, weekly cycle, pair-state snapshot, or subscription: page immediately;
- replication, storage, pool, index, TTL, backup-age, or restore-age limit breach.

Track dashboard/history p95 and expired-cycle reconciliation duration separately. Two equivalent marked-history load runs measured history p95 at 195.08/222.07 ms and dashboard p95 at 515.29/459.70 ms. The first dashboard run was 15.29 ms above the provisional read target; the variance remains a local tuning signal, not production evidence. Legacy reconciliation bounds are verified independently with a batch of eight and poison-row isolation.

Metric labels must not contain user ID, pair ID, invite token, notes, answers, or summary content. Product analytics and security audit storage remain separate.

## 8. External production actions

- supply and rotate production secrets;
- provision a MongoDB replica set, backup policy, monitoring, and least-privilege network/user access;
- approve sensitive Russian content/help resources and shared-artifact retention/deletion policy;
- choose jurisdiction, billing owner/trial/grace/refund rules, and a real billing provider;
- configure the provider webhook/checkout and perform sandbox then controlled production verification;
- execute deployment, two-real-account Discord verification, alert wiring, and go/no-go approval.

Until these actions have named owners and recorded outcomes, the repository may be a local release candidate but is not production-verified.

## 9. First-production actions

Before traffic:

- identify the exact build and compatibility-safe rollback artifact;
- verify topology, least-privilege access, a current restorable backup, intended indexes, and readiness;
- prove alert delivery to the on-call owner and keep billing disabled;
- do not run `_test` smoke commands against production;
- start with the smallest approved audience/instances and name the operator with stop authority.

During the first hour:

- run controlled two-account and health checks without storing sensitive evidence;
- confirm no generic idempotency work remains older than twice its 30-second lease and no weekly processing remains older than twice its 120-second lease;
- confirm zero duplicate canonical records and verify expected index plans;
- compare production p50/p95/p99, error rate, pool pressure, conflicts, takeovers, and reconciliation duration with the local evidence without extrapolating local capacity.

During the first 24 hours:

- verify backup completion, alert delivery, TTL progress, dedupe, and reconciliation;
- record sanitized production p50/p95/p99, throughput, errors, conflicts, and saturation for each critical scenario;
- hold an explicit go/no-go review with engineering, operations, product/privacy, and billing owners; keep unverified capabilities disabled or scoped down.
