# Changelog (Docs & Project Notes)

Date: 2026-09-05
Summary:
- Added a separate unfinished-development-run API with fixed 30-row keyset pages and a “Показать ещё” UI; the existing overview contract remains compatible.
- Revalidate actor/Pair/paid-content scope for every page; changed scope restarts the list, retries preserve ordinary network failures, and late responses cannot restore data after denied access.
- Added an autonomous local acceptance runner using a newly created loopback MongoDB replica set and isolated synthetic runtime settings; browser mode provisions two fixed onboarded participants using genuine sessions, outside production routes.
- Added 65-run pagination/access integration cases, actual-hook race regressions and local-runner guard checks. Documented launch commands, process ownership/cleanup and the remaining real Discord/OAuth boundary.
- Made the three-cycle acceptance fixture use future Mondays to avoid expiry against MongoDB's real TTL clock, measured timings with the monotonic clock, and made terminal failures observable instead of hanging on leftover handles. The updated six-suite local aggregate passed.
- Added `scripts/local-acceptance-server.ts`: two loopback servers of the same production build use explicit participant hostnames and preserve the application's normal session and Origin checks. This is local acceptance tooling only.
- Completed local browser acceptance for mutual invitation, 30→35 pagination/reload, joint partial→final completion with private notes, and concurrent shared-task edits with explicit conflict resolution. The final browser run stopped and cleaned up; one directory from an earlier interrupted run remains after an automatic deletion denial, recorded in `TWO_USER_ACCEPTANCE.md`.
Additional files: scripts/local-acceptance-server.ts, scripts/two-user-mvp.integration.ts, scripts/two-user-acceptance.integration.ts
Files: src/domain/model/development/runPagination.ts, src/domain/services/development.service.ts, src/lib/dto/development.dto.ts, src/app/api/development/runs/route.ts, src/client/api/development.api.ts, src/client/hooks/useDevelopment.ts, src/features/development/DevelopmentPage.tsx, src/components/profile/today/ContinuationPanel.tsx, scripts/product-workspace.integration.ts, scripts/product-workspace.selfcheck.ts, scripts/continuation-ui.selfcheck.ts, scripts/local-acceptance.ts, scripts/local-acceptance.selfcheck.ts, scripts/lib/local-acceptance-options.ts, scripts/lib/local-acceptance-fixtures.ts, package.json, README.md, docs/LOCAL_ACCEPTANCE.md, docs/API_CONTRACTS.md, docs/PRODUCT_WORKSPACE_UPDATE.md, docs/TESTING.md, docs/TWO_USER_ACCEPTANCE.md, docs/INDEX.md, docs/CHANGELOG.md

Date: 2026-09-05
Summary:
- Added an active pilot handoff that separates the September fixes present on `main`, limited manual pilot observations, the audited as-is first-entry flow, and the agreed but not-yet-implemented relationship/seeking split.
- Recorded explicitly that the requested beta user-data reset was not executed and documented the guarded backup/restore/full-linked-graph procedure required before the same Discord identities can start cleanly.
- Added operational troubleshooting for the exact Discord Activity OAuth boundary, first-login partial upsert, narrow weekly missing-index fallback, and safe closed-beta reset boundary.
- Refreshed active API/security document review metadata; no runtime, public contract, schema, environment, deployment, or database state changed in this documentation-only update.
Files: docs/CURRENT_PILOT_HANDOFF.md, docs/INDEX.md, docs/DOCS_STATUS.md, docs/TROUBLESHOOTING.md, docs/API_CONTRACTS.md, docs/SECURITY.md, docs/CHANGELOG.md

Date: 2026-09-01
Summary:
- Allowed the exact configured Discord Activity proxy origin at the centralized unsafe-request boundary while preserving fail-closed rejection for sibling, suffix and explicit cross-site origins.
- Aligned the server-side Discord token request with the Embedded SDK authorization flow by omitting the unused `redirect_uri`, without changing the client API or environment contract.
- Added focused security regressions for OAuth exchange and later cookie-authenticated Activity mutations.
- Fixed first-login user persistence by keeping invalid legacy onboarding defaults out of partial Discord identity upserts while retaining Mongoose validators.
- Restored the five-tile main-menu presentation while retaining the current cycle, recommendation, notification, retry and Factor Matching flows.
- Kept expired weekly-cycle reconciliation available when a deployment is temporarily missing its named performance index: the indexed path remains primary and only the exact Mongo missing-hint error retries without the hint.
Files: src/lib/auth/requestSafety.ts, src/domain/services/discordOAuth.service.ts, src/domain/services/users.service.ts, src/app/main-menu/page.tsx, src/domain/services/weeklyCycle.service.ts, scripts/security-critical.selfcheck.ts, scripts/frontend-mvp-ui.selfcheck.ts, scripts/weekly-cycle.selfcheck.ts, docs/SECURITY.md, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Added a persistent account write barrier: authenticated, OAuth, admin and billing writers hold expiring leases; deletion now fences `ACTIVE -> DELETING -> DELETED`, drains writers, deletes artifacts and rotates sessions transactionally.
- Closed Pair lifecycle races for weekly materialization, activity transitions, feedback, recommendation notification reconciliation and lazy Factor materialization; deterministic replica-set races all converge on the lifecycle winner.
- Completed the exact-tree local release gate: lint, types, all selfchecks, agent checks, production build, diff check, destructive deletion/race integrations, registry v6 migration, 28 + 97 indexes, 72 invariants and responsive production-browser smoke.
Files: package.json, src/models/SessionSubject.ts, src/domain/services/accountWriteBarrier.service.ts, src/lib/auth/accountWriteLeaseRuntime.ts, src/lib/auth/guards.ts, src/domain/services/accountDeletion.service.ts, src/domain/services/discordOAuth.service.ts, src/domain/services/entitlementGrant.service.ts, src/domain/services/billingWebhook.service.ts, src/domain/services/activities.service.ts, src/domain/services/weeklyCycle.service.ts, src/domain/services/activityFactorRuntime.service.ts, src/domain/services/recommendationWorkflow.service.ts, scripts/privacy-deletion-execution.integration.ts, scripts/activity-lifecycle-races.integration.ts, scripts/pair-context-lifecycle.integration.ts, scripts/pair-lifecycle-remaining.integration.ts, docs/MVP_RELEASE_STATUS.md, docs/PUBLIC_FREE_MVP_EXECUTION.md, docs/SCALE_READINESS.md, docs/RELEASE_RUNBOOK.md, docs/TESTING.md, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Made weekly cycle materialization, submission claims, skips and post-check-in synchronization share one transactional Pair lifecycle fence with their cycle, Pair Summary snapshot, Factor and notification writes.
- Restricted ended-Pair historical reconciliation to existing expired cycles without participant notifications, and added deterministic current/claim/skip-versus-end plus claim-versus-pause races.
Files: src/domain/services/weeklyCycle.service.ts, src/domain/services/factorEngineRuntime.service.ts, src/domain/services/factorEnginePersistence.service.ts, scripts/pair-context-lifecycle.integration.ts, docs/SECURITY.md, docs/TESTING.md, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Transactionally fenced lazy activity-recommendation Factor materialization against Pair end with an `active|paused` `lifecycleRevision` write and one propagated Mongo session.
- Ended Pair contexts now fail closed before any pair-scoped Factor read/write; a deterministic replica-set race proves end adds no individual, pair or evaluation snapshot revisions.
Files: src/domain/services/activityFactorRuntime.service.ts, scripts/activity-factor-read-batching.selfcheck.ts, scripts/pair-lifecycle-remaining.integration.ts, docs/SECURITY.md, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Published Factor registry v6 and algorithm v4 with immutable snapshot v3, dual `observedAt`/`recordedAt` as-of bounds, bounded definition-driven evidence selection, and fail-closed current-strategy reads.
- Added lazy daily rematerialization for DECAY-backed profile, Today and activity factors, plus transaction-safe sequential Factor writes and latest-per-factor server-side reads.
- Hardened the NEW_ONLY migration and release preflight with one immutable `asOf`, exact source-time markers, undeclared-index blocking, deep-history explain checks and strict p95 load gates.
Files: src/domain/model/aggregation/factorAggregation.ts, src/domain/model/definitions/mvpDefinitions.ts, src/domain/model/snapshots/snapshots.ts, src/domain/services/factorEngineRuntime.service.ts, src/domain/services/activityFactorRuntime.service.ts, src/domain/services/factorProfileSummary.service.ts, src/domain/services/personalToday.service.ts, src/domain/services/onboardingFactorEngine.service.ts, src/models/EvidenceEvent.ts, src/models/IndividualFactorSnapshot.ts, src/models/PairFactorEvaluationSnapshot.ts, scripts/lib/factor-engine-migration.ts, scripts/release-preflight.ts, scripts/release-load-smoke.ts, scripts/release-readiness.selfcheck.ts, scripts/factor-engine.selfcheck.ts, scripts/factor-engine-cutover.integration.ts, scripts/factor-engine-runtime.integration.ts, scripts/activity-factor-read-batching.selfcheck.ts, docs/ADR/ADR-008-factor-new-only-free-core.md, docs/RELEASE_RUNBOOK.md, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Closed privacy deletion residue by removing pairless owner/actor/observed-subject records from the active `factor_evidence_events` collection while preserving unrelated evidence.
- Replaced length-only PartnerSignal and daily private-string idempotency fingerprints with canonical, content-sensitive digests and added behavioral collision regressions.
- Made consented partner Factor disclosure summary-only for normal/private definitions and fail-closed for sensitive/matching-only definitions.
Files: src/domain/services/accountDeletion.service.ts, src/lib/idempotency/key.ts, src/app/api/users/me/daily-checkins/request.ts, src/app/api/users/me/daily-checkins/[id]/partner-signal/route.ts, src/domain/model/privacy/disclosure.ts, scripts/privacy-deletion-execution.integration.ts, scripts/partner-signal.integration.ts, scripts/factor-engine.selfcheck.ts, scripts/participant-disclosure.selfcheck.ts, scripts/security-critical.selfcheck.ts, docs/SECURITY.md, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Hardened immutable Factor snapshots with registry/definition/algorithm/snapshot/display pinning, canonical measurement/instrument references, strategy identity and actual relationship context.
- Added canonical effective intervals, daily rematerialization for DECAY factors, fail-closed active reads, replay-envelope verification and stale-marker contract detection.
- Added focused snapshot, runtime and cutover regressions for rejected evidence isolation, next-window revisions, expiry and malformed persisted contracts.
Files: src/domain/model/snapshots/snapshots.ts, src/models/factorEngineSchemas.ts, src/models/IndividualFactorSnapshot.ts, src/models/PairFactorSnapshot.ts, src/models/PairFactorEvaluationSnapshot.ts, src/domain/services/factorEnginePersistence.service.ts, src/domain/services/factorEngineRuntime.service.ts, src/domain/services/activityFactorRuntime.service.ts, src/domain/services/weeklyCycle.service.ts, scripts/factor-engine.selfcheck.ts, scripts/factor-engine-runtime.integration.ts, scripts/factor-engine-cutover.integration.ts, scripts/lib/factor-engine-migration.ts, docs/CHANGELOG.md

Date: 2026-07-02
Summary:
- Added the Personal Today MVP on `/profile`: daily read-model DTO/API, daily check-in storage, relationship lens settings, explicit partner signals, and the top-of-profile dashboard.
- Added deterministic personal-today rules/copy services with a targeted selfcheck for lens defaults, fallback freshness, rules priority, copy safety, and partner-signal privacy.
- Documented the new self endpoints and privacy boundaries for daily journal, body context, and sent partner signals.
Files: package.json, src/models/User.ts, src/models/PersonalDailyCheckIn.ts, src/models/PartnerSignal.ts, src/domain/services/relationshipLens.service.ts, src/domain/services/personalTodayRules.service.ts, src/domain/services/personalTodayCopy.service.ts, src/domain/services/personalToday.service.ts, src/domain/services/personalDailyCheckIn.service.ts, src/domain/services/partnerSignal.service.ts, src/app/api/users/me/today/route.ts, src/app/api/users/me/daily-checkins/route.ts, src/app/api/users/me/daily-checkins/[id]/partner-signal/route.ts, src/app/api/users/me/relationship-lens/route.ts, src/client/api/types.ts, src/client/api/users.api.ts, src/client/viewmodels/personalToday.viewmodels.ts, src/client/viewmodels/index.ts, src/components/profile/today/PersonalTodayDashboard.tsx, src/app/(auth)/profile/page.tsx, scripts/personal-today.selfcheck.ts, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Added the relationship experience layer to the private profile summary: "Сегодня", personal axis guidance, private helpful notes, and lightweight needs/boundaries.
- Reordered solo and paired profile dashboards around the new guidance while keeping legacy profile-summary fields compatible.
- Extended the profile selfcheck with scenario coverage and forbidden-wording assertions.
Files: src/domain/services/profileExperience.service.ts, src/app/api/users/me/profile-summary/route.ts, src/client/api/types.ts, src/client/viewmodels/profile.viewmodels.ts, src/components/profile/ModeAwareProfileOverview.tsx, scripts/user-profile-summary.selfcheck.ts, docs/API_CONTRACTS.md, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Hardened Pair Events lifecycle rules for accept/decline/snooze and made accept generation transactional with deterministic anti-duplicate activity lookup.
- Connected and expanded the pair-events selfcheck, including reserved `partner_birthday` coverage and accepted-state UI action checks.
- Added privacy-safe event source visibility to activity DTO/viewmodel/cards and clarified Stage 5 API behavior.
Files: package.json, src/domain/services/pairEvent.service.ts, src/client/hooks/usePairEvents.ts, src/client/viewmodels/pairEvent.viewmodels.ts, src/components/events/PairEventsPanel.tsx, src/lib/dto/activity.dto.ts, src/client/api/types.ts, src/client/viewmodels/activity.viewmodels.ts, src/components/activities/ActivityCard.tsx, scripts/selfcheck-pair-events.ts, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Added PairEvent model, DTO, lazy event generation, events API, event accept/decline/snooze flow, and event-sourced PairActivity offer creation.
- Added pair events client API/hook/viewmodel and embedded PairEventsPanel into the pair profile after weekly check-in.
- Documented new pair events API contracts and added a pure rules selfcheck for event candidates/status behavior.
Files: src/models/PairEvent.ts, src/lib/dto/pairEvent.dto.ts, src/domain/services/pairEvent.service.ts, src/app/api/pairs/[id]/events/route.ts, src/app/api/pairs/[id]/events/[eventId]/[action]/route.ts, src/client/api/types.ts, src/client/api/pairEvents.api.ts, src/client/hooks/usePairEvents.ts, src/client/viewmodels/pairEvent.viewmodels.ts, src/components/events/PairEventsPanel.tsx, src/features/pair/PairProfilePageClient.tsx, scripts/selfcheck-pair-events.ts, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Implemented Pair Profile 2.0 dashboard with hero, pair state, next step, current activity, weekly check-in, compatibility preview, pair insights, and source match block.
- Extended pair summary with public members, peer, compact diagnostics, current-week check-in signal, and deterministic next-step recommendation.
Files: src/app/api/pairs/[id]/summary/route.ts, src/domain/services/pairDashboardSummary.service.ts, src/client/api/types.ts, src/client/viewmodels/pair.viewmodels.ts, src/features/pair/PairProfilePageClient.tsx, src/components/profile/InsightsList.tsx, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-06-04
Summary:
- Added idempotent beta questionnaire seed set for baseline communication, resource/state, pair expectations, and weekly check-in content.
- Extended questionnaire question DTO/schema with safe scoring metadata and added a beta questionnaire selfcheck.
- Fixed readable safe copy for pair-answer diagnostics and canonical insight DTO copy.
Files: package.json, src/models/Questionnaire.ts, src/lib/dto/questionnaire.dto.ts, src/client/api/types.ts, src/domain/services/pairAnswerScoring.service.ts, src/domain/services/insightRules.service.ts, src/domain/services/weeklyCheckIn.service.ts, scripts/seedBetaQuestionnaires.ts, scripts/beta-questionnaires.selfcheck.ts, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-06-04
Summary:
- Added closed-beta weekly check-in backend/API/UI, pair-answer-aware diagnostics, pair/profile insights UI wiring, and idempotent vector snapshot backfill script.
- Expanded insight rules to 10 deterministic safe rules and added weekly/backfill selfchecks.
Files: package.json, src/models/User.ts, src/models/Insight.ts, src/models/WeeklyCheckIn.ts, src/domain/services/weeklyCheckIn.service.ts, src/domain/services/pairAnswerScoring.service.ts, src/domain/services/insightRules.service.ts, src/domain/services/questionnaires.service.ts, src/app/api/checkins/weekly/route.ts, src/app/api/checkins/weekly/current/route.ts, src/app/api/pairs/[id]/diagnostics/route.ts, src/app/api/users/me/profile-summary/route.ts, src/app/pair/[id]/diagnostics/page.tsx, src/app/(auth)/profile/page.tsx, src/features/pair/PairProfilePageClient.tsx, src/components/checkins/WeeklyCheckInCard.tsx, src/components/profile/InsightsList.tsx, src/client/api/checkins.api.ts, src/client/api/pairs.api.ts, src/client/api/types.ts, src/client/viewmodels/profile.viewmodels.ts, scripts/backfill-vector-snapshots.ts, scripts/backfill-vector-snapshots.selfcheck.ts, scripts/weekly-checkin.selfcheck.ts, scripts/insights-safety.selfcheck.ts, scripts/pair-diagnostics.selfcheck.ts, scripts/vector-e2e.selfcheck.ts, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-06-04
Summary:
- Completed MVP-0/MVP-1 bridge for vector snapshots and deterministic insights.
- Added snapshot persistence for questionnaire and activity vector writes, deterministic insight rules/endpoints, and targeted selfchecks for e2e vector flow, cooldown dedupe, wording safety, and raw-answer privacy.
Files: package.json, src/models/Insight.ts, src/models/VectorSnapshot.ts, src/domain/services/insightRules.service.ts, src/domain/services/pairDiagnostics.service.ts, src/domain/services/questionnaires.service.ts, src/domain/services/vectorScoring.service.ts, src/domain/vectors/apply.ts, src/domain/vectors/types.ts, src/lib/audit/eventTypes.ts, src/utils/activities.ts, src/app/api/insights/me/route.ts, src/app/api/pairs/[id]/insights/route.ts, scripts/vector-scoring.selfcheck.ts, scripts/vector-e2e.selfcheck.ts, scripts/pair-diagnostics.selfcheck.ts, scripts/insights-safety.selfcheck.ts, docs/04-api-contracts.md, docs/CHANGELOG.md

## 2026-02-05
- Initialized docs-as-primary-context workflow.
- Added rules for keeping docs and changelog in sync after changes.
- Added a docs map for quick navigation.
- Files: `AGENTS.md`, `docs/README.md`, `docs/CHANGELOG.md`

## 2026-02-05
- Fixed ESLint `no-explicit-any` errors in bulk answers API handler.
- Files: `src/app/api/answers/bulk/route.ts`, `docs/CHANGELOG.md`

## 2026-02-05
- Strengthened AGENTS rules for build blockers and pre-finish checks.
- Files: `AGENTS.md`, `docs/CHANGELOG.md`

## 2026-02-05
- Updated Next.js and React to patched versions to address Vercel security block.
- Files: `package.json`, `package-lock.json`, `docs/CHANGELOG.md`

## 2026-02-05
- Added a spinner loader while user/avatar data loads on the landing screen.
- Switched avatar images to `next/image` with remote patterns configured.
- Files: `src/app/page.tsx`, `src/components/profile/UserHeader.tsx`, `src/components/ui/Spinner.tsx`, `next.config.ts`, `docs/CHANGELOG.md`

## 2026-02-05
- Added JWT-based session cookie and secured questionnaire cards endpoint.
- Implemented server-side questionnaire cards DTO with batch status/progress aggregation.
- Updated questionnaires UI to use new DTO and card design.
- Added questionnaire cards UI/data-flow docs.
- Files: `src/lib/jwt.ts`, `src/app/api/exchange-code/route.ts`, `src/app/api/questionnaires/cards/route.ts`, `src/models/Questionnaire.ts`, `src/app/questionnaires/page.tsx`, `src/components/QuestionnaireCard.tsx`, `docs/ui/questionnaire-cards.md`, `docs/data/questionnaire-flow.md`, `docs/README.md`, `docs/CHANGELOG.md`
Date: 2026-02-05
Summary:
- Fixed questionnaire session narrowing to satisfy TypeScript for cards API.
Files: src/app/api/questionnaires/cards/route.ts

Date: 2026-02-05
Summary:
- Set session cookie SameSite/Secure to work inside Discord iframe in production.
Files: src/app/api/exchange-code/route.ts, docs/07-security-privacy.md

Date: 2026-02-05
Summary:
- Restored readable Russian text in questionnaire flow and UI docs.
Files: docs/data/questionnaire-flow.md, docs/ui/questionnaire-cards.md

Date: 2026-02-05
Summary:
- Restored readable Russian labels in questionnaire cards and list page UI.
Files: src/components/QuestionnaireCard.tsx, src/app/questionnaires/page.tsx

Date: 2026-02-05
Summary:
- Added GET /api/questionnaires/[id] to return questionnaire data.
Files: src/app/api/questionnaires/[id]/route.ts, docs/04-api-contracts.md

Date: 2026-02-05
Summary:
- Fixed GET handler signature for Next.js 15 params typing.
Files: src/app/api/questionnaires/[id]/route.ts

Date: 2026-02-05
Summary:
- Allow /api/questionnaires/[id] POST to accept single answer payload.
Files: src/app/api/questionnaires/[id]/route.ts, docs/04-api-contracts.md

Date: 2026-02-05
Summary:
- Remove any-typed route context for match card GET.
Files: src/app/api/match/card/[id]/route.ts

Date: 2026-02-05
Summary:
- Added facets/passports as-is inventory doc with evidence tables.
Files: docs/_inventory/facets-passports-as-is.md, docs/CHANGELOG.md

Date: 2026-02-05
Summary:
- Added questionnaire→vectors→profile expected-vs-as-is inventory report.
Files: docs/_inventory/questionnaire-vectors-profile-expected-vs-as-is.md, docs/CHANGELOG.md

Date: 2026-02-05
Summary:
- Updated pair questionnaire answer to use JWT user, idempotent upsert, and vector recalculation; refactored vector update helper and documented pair flow updating profile.
Files: src/utils/vectorUpdates.ts, src/app/api/answers/bulk/route.ts, src/app/api/questionnaires/[id]/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts, docs/data/questionnaire-flow.md, docs/CHANGELOG.md

Date: 2026-02-05
Summary:
- Fixed pair questionnaire answer mapping to allow optional question _id with a safe type guard.
Files: src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts, docs/CHANGELOG.md

Date: 2026-02-07
Summary:
- Added a dedicated `docs/problems/` registry separated from ADR and core docs.
- Added 16 starter PROB files for security, API contracts, state-machine guards, analytics, entitlements, UI/domain layering, and retention debt.
- Updated docs map with the new Problems section.
Files: docs/problems/README.md, docs/problems/PROB-001-client-userid-trust-in-api.md, docs/problems/PROB-002-fragmented-session-auth-adoption.md, docs/problems/PROB-003-missing-resource-authorization-guards.md, docs/problems/PROB-004-no-idempotency-layer-for-mutations.md, docs/problems/PROB-005-inconsistent-api-response-contracts.md, docs/problems/PROB-006-no-centralized-dto-layer.md, docs/problems/PROB-007-business-logic-inside-route-handlers.md, docs/problems/PROB-008-god-components-and-ui-api-coupling.md, docs/problems/PROB-009-duplicate-activity-suggestion-flows.md, docs/problems/PROB-010-legacy-relationship-activity-still-present.md, docs/problems/PROB-011-state-machine-guards-not-centralized.md, docs/problems/PROB-012-analytics-events-not-unified-and-auditable.md, docs/problems/PROB-013-entitlements-abstraction-not-implemented.md, docs/problems/PROB-014-missing-rate-limiting-and-abuse-controls.md, docs/problems/PROB-015-log-privacy-and-retention-policy-missing.md, docs/problems/PROB-016-no-cross-cutting-validation-layer-zod.md, docs/README.md, docs/CHANGELOG.md

Date: 2026-02-07
Summary:
- Introduced centralized session auth modules (`readSessionUser`, `requireSession`, auth error helpers) and removed duplicated inline session parsing.
- Applied `requireSession` to private API routes across `activities`, `pairs`, `match`, `users`, `answers`, `questionnaires` (private POST/cards), and `logs`.
- Documented Iteration 1 progress for PROB-002 and added auth MVP note in API contracts.
Files: src/lib/auth/session.ts, src/lib/auth/guards.ts, src/lib/auth/errors.ts, src/app/api/activities/[id]/accept/route.ts, src/app/api/activities/[id]/cancel/route.ts, src/app/api/activities/[id]/checkin/route.ts, src/app/api/activities/[id]/complete/route.ts, src/app/api/activities/next/route.ts, src/app/api/answers/bulk/route.ts, src/app/api/logs/route.ts, src/app/api/match/accept/route.ts, src/app/api/match/card/[id]/route.ts, src/app/api/match/card/route.ts, src/app/api/match/confirm/route.ts, src/app/api/match/feed/route.ts, src/app/api/match/inbox/route.ts, src/app/api/match/like/[id]/route.ts, src/app/api/match/like/route.ts, src/app/api/match/reject/route.ts, src/app/api/match/respond/route.ts, src/app/api/pairs/[id]/activities/from-template/route.ts, src/app/api/pairs/[id]/activities/route.ts, src/app/api/pairs/[id]/activities/suggest/route.ts, src/app/api/pairs/[id]/diagnostics/route.ts, src/app/api/pairs/[id]/pause/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts, src/app/api/pairs/[id]/resume/route.ts, src/app/api/pairs/[id]/suggest/route.ts, src/app/api/pairs/[id]/summary/route.ts, src/app/api/pairs/create/route.ts, src/app/api/pairs/me/route.ts, src/app/api/pairs/status/route.ts, src/app/api/questionnaires/[id]/route.ts, src/app/api/questionnaires/cards/route.ts, src/app/api/users/[id]/onboarding/route.ts, src/app/api/users/[id]/route.ts, src/app/api/users/me/profile-summary/route.ts, src/app/api/users/route.ts, docs/problems/PROB-002-fragmented-session-auth-adoption.md, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-02-07
Summary:
- Removed client `userId` trust from self-scoped API contracts and switched subject resolution to session user across match/pairs/questionnaire/answers/logs/users endpoints.
- Updated client calls to stop sending `?userId=`/`userId` in self-scoped requests while keeping `/.proxy` transport unchanged.
- Added `/api/users/me` and `/api/users/me/onboarding` for self profile flows; updated PROB-001, API contracts, and security docs for Iteration 2.
Files: src/app/api/activities/next/route.ts, src/app/api/answers/bulk/route.ts, src/app/api/logs/route.ts, src/app/api/match/accept/route.ts, src/app/api/match/card/route.ts, src/app/api/match/confirm/route.ts, src/app/api/match/feed/route.ts, src/app/api/match/inbox/route.ts, src/app/api/match/like/route.ts, src/app/api/match/reject/route.ts, src/app/api/match/respond/route.ts, src/app/api/pairs/create/route.ts, src/app/api/pairs/me/route.ts, src/app/api/pairs/status/route.ts, src/app/api/questionnaires/[id]/route.ts, src/app/api/users/me/profile-summary/route.ts, src/app/api/users/route.ts, src/app/api/users/me/route.ts, src/app/api/users/me/onboarding/route.ts, src/app/search/page.tsx, src/app/match/inbox/page.tsx, src/app/match/like/[id]/page.tsx, src/app/match-card/create/page.tsx, src/app/questionnaire/page.tsx, src/app/questionnaire/[id]/page.tsx, src/app/couple-activity/page.tsx, src/app/pair/page.tsx, src/app/(auth)/profile/page.tsx, src/app/profile/(tabs)/matching/page.tsx, src/app/page.tsx, src/components/LikeModal.tsx, src/components/OnboardingWizard.tsx, src/components/main-menu/SearchPairTile.tsx, docs/problems/PROB-001-client-userid-trust-in-api.md, docs/04-api-contracts.md, docs/07-security-privacy.md, docs/CHANGELOG.md

Date: 2026-02-07
Summary:
- Added centralized resource authorization guards (`requirePairMember`, `requireActivityMember`, `requireLikeParticipant`) and unified not-found error helper (`jsonNotFound`).
- Applied guard-based authz to pair/activity/like protected routes so valid foreign sessions receive `403` and missing resources return `404`.
- Removed client-driven questionnaire role (`by`) dependency and resolved `A|B` role server-side via pair membership guard.
Files: src/lib/auth/errors.ts, src/lib/auth/resourceGuards.ts, src/app/api/pairs/[id]/summary/route.ts, src/app/api/pairs/[id]/diagnostics/route.ts, src/app/api/pairs/[id]/activities/route.ts, src/app/api/pairs/[id]/activities/suggest/route.ts, src/app/api/pairs/[id]/activities/from-template/route.ts, src/app/api/pairs/[id]/suggest/route.ts, src/app/api/pairs/[id]/pause/route.ts, src/app/api/pairs/[id]/resume/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts, src/app/api/activities/[id]/accept/route.ts, src/app/api/activities/[id]/cancel/route.ts, src/app/api/activities/[id]/checkin/route.ts, src/app/api/activities/[id]/complete/route.ts, src/app/api/match/like/[id]/route.ts, src/app/api/match/respond/route.ts, src/app/api/match/accept/route.ts, src/app/api/match/reject/route.ts, src/app/api/match/confirm/route.ts, docs/problems/PROB-003-missing-resource-authorization-guards.md, docs/07-security-privacy.md, docs/CHANGELOG.md

Date: 2026-02-07
Summary:
- Added shared API response envelope helpers (`jsonOk`, `jsonError`) and migrated all `/api/*` handlers to the unified `{ ok, data|error }` contract.
- Added centralized Zod-based request validation (`parseJson`, `parseQuery`, `parseParams`) and normalized validation failures to `400 VALIDATION_ERROR`.
- Updated API/auth/problem docs for PROB-005/016 outcomes and standardized contract rules.
Files: src/lib/api/response.ts, src/lib/api/validate.ts, src/lib/auth/errors.ts, src/app/api/activities/[id]/accept/route.ts, src/app/api/activities/[id]/cancel/route.ts, src/app/api/activities/[id]/checkin/route.ts, src/app/api/activities/[id]/complete/route.ts, src/app/api/activities/next/route.ts, src/app/api/activity-templates/route.ts, src/app/api/answers/bulk/route.ts, src/app/api/exchange-code/route.ts, src/app/api/logs/route.ts, src/app/api/match/accept/route.ts, src/app/api/match/card/[id]/route.ts, src/app/api/match/card/route.ts, src/app/api/match/confirm/route.ts, src/app/api/match/feed/route.ts, src/app/api/match/inbox/route.ts, src/app/api/match/like/[id]/route.ts, src/app/api/match/like/route.ts, src/app/api/match/reject/route.ts, src/app/api/match/respond/route.ts, src/app/api/pairs/[id]/activities/from-template/route.ts, src/app/api/pairs/[id]/activities/route.ts, src/app/api/pairs/[id]/activities/suggest/route.ts, src/app/api/pairs/[id]/diagnostics/route.ts, src/app/api/pairs/[id]/pause/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts, src/app/api/pairs/[id]/resume/route.ts, src/app/api/pairs/[id]/suggest/route.ts, src/app/api/pairs/[id]/summary/route.ts, src/app/api/pairs/create/route.ts, src/app/api/pairs/me/route.ts, src/app/api/pairs/status/route.ts, src/app/api/questionnaires/[id]/route.ts, src/app/api/questionnaires/cards/route.ts, src/app/api/questionnaires/route.ts, src/app/api/questions/route.ts, src/app/api/users/[id]/onboarding/route.ts, src/app/api/users/[id]/route.ts, src/app/api/users/me/onboarding/route.ts, src/app/api/users/me/profile-summary/route.ts, src/app/api/users/me/route.ts, src/app/api/users/route.ts, docs/problems/PROB-005-inconsistent-api-response-contracts.md, docs/problems/PROB-016-no-cross-cutting-validation-layer-zod.md, docs/04-api-contracts.md, docs/CHANGELOG.md, package.json, package-lock.json
Date: 2026-02-07
Summary:
- Implemented centralized DTO layer in `src/lib/dto/*` and migrated high-risk API routes to explicit DTO/view-model returns.
- Added public/private user field boundaries and enforced route-level DTO guard comments across all API `route.ts` handlers.
- Updated PROB-006, API contracts, security/privacy docs, and added a manual 10-endpoint validation checklist for DTO regression control.
Files: src/lib/dto/index.ts, src/lib/dto/user.dto.ts, src/lib/dto/pair.dto.ts, src/lib/dto/activity.dto.ts, src/lib/dto/questionnaire.dto.ts, src/lib/dto/match.dto.ts, src/lib/dto/analytics.dto.ts, src/app/api/**/route.ts, docs/problems/PROB-006-no-centralized-dto-layer.md, docs/04-api-contracts.md, docs/07-security-privacy.md, docs/_evidence/prob-006-dto-manual-checklist-2026-02-07.md, docs/CHANGELOG.md

Date: 2026-02-07
Summary:
- Added `src/utils/apiClient.ts` with `fetchEnvelope<T>` and envelope types for unified client parsing.
- Fixed Discord Activity auth flow to read `access_token` from envelope and added one-time init guard to avoid duplicate `authenticate` calls.
- Updated `Go to main menu` flow to read `/api/users/me` via envelope and send minimal JSON body to `/api/logs` in fire-and-forget mode.
Files: src/utils/apiClient.ts, src/app/page.tsx, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-02-07
Summary:
- Fixed client envelope parsing in UI pages with array rendering/filtering (questionnaires, match inbox, search, main-menu status tile) using `fetchEnvelope` and safe array fallback.
- Added src/app/lootboxes/page.tsx as a minimal route to remove /lootboxes 404 from main-menu navigation/prefetch.
- Updated match inbox list loading to parse envelope before `rows.filter(...)`.
Files: src/app/questionnaires/page.tsx, src/app/match/inbox/page.tsx, src/app/search/page.tsx, src/components/main-menu/SearchPairTile.tsx, src/app/lootboxes/page.tsx, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-02-07
Summary:
- Introduced centralized domain transition layer (`src/domain/state/*`) and domain services (`src/domain/services/*`) for critical mutation flows.
- Added unified idempotency infrastructure (`Idempotency-Key`, Mongo store/model, `withIdempotency`) and migrated critical POST routes to replay-safe behavior.
- Updated critical client mutation calls to use `fetchEnvelope(..., { idempotency: true })`; documented outcomes in PROB-004/007/011 and API/state-machine docs.
Files: src/domain/errors.ts, src/domain/state/activityMachine.ts, src/domain/state/matchMachine.ts, src/domain/state/questionnaireMachine.ts, src/domain/services/activities.service.ts, src/domain/services/match.service.ts, src/domain/services/questionnaires.service.ts, src/lib/idempotency/types.ts, src/lib/idempotency/key.ts, src/lib/idempotency/store.ts, src/lib/idempotency/withIdempotency.ts, src/models/IdempotencyRecord.ts, src/lib/auth/errors.ts, src/lib/auth/resourceGuards.ts, src/app/api/match/like/route.ts, src/app/api/match/respond/route.ts, src/app/api/match/accept/route.ts, src/app/api/match/reject/route.ts, src/app/api/match/confirm/route.ts, src/app/api/activities/[id]/accept/route.ts, src/app/api/activities/[id]/cancel/route.ts, src/app/api/activities/[id]/checkin/route.ts, src/app/api/activities/[id]/complete/route.ts, src/app/api/answers/bulk/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts, src/utils/apiClient.ts, src/components/LikeModal.tsx, src/app/match/inbox/page.tsx, src/app/match/like/[id]/page.tsx, src/app/couple-activity/page.tsx, src/app/questionnaire/page.tsx, src/app/pair/[id]/questionnaire/[qid]/page.tsx, docs/problems/PROB-004-no-idempotency-layer-for-mutations.md, docs/problems/PROB-007-business-logic-inside-route-handlers.md, docs/problems/PROB-011-state-machine-guards-not-centralized.md, docs/03-state-machines.md, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Added unified auditable event runtime (`emitEvent`) with strict event typing, privacy-safe metadata sanitization, and retention-tiered TTL storage in Mongo.
- Added centralized Mongo fixed-window rate limiting with `429 RATE_LIMITED` contract and abuse-hit event emission on policy overflow.
- Expanded mutation coverage: migrated additional route handlers to thin-controller + service pattern, added pair state machine, and extended idempotency to `/api/users`, `/api/pairs/create`, `/api/users/me/onboarding`, `/api/logs`, `/api/pairs/[id]/pause`, `/api/pairs/[id]/resume`.
- Updated docs/contracts and problem trackers for PROB-012/014/015 and coverage progress for PROB-004/007/011.
Files: src/lib/audit/eventTypes.ts, src/lib/audit/emitEvent.ts, src/models/EventLog.ts, src/models/RateLimitBucket.ts, src/lib/abuse/rateLimit.ts, src/domain/state/pairMachine.ts, src/domain/services/activityOffer.service.ts, src/domain/services/pairs.service.ts, src/domain/services/users.service.ts, src/domain/services/logs.service.ts, src/domain/services/match.service.ts, src/domain/services/activities.service.ts, src/domain/services/questionnaires.service.ts, src/app/api/exchange-code/route.ts, src/app/api/logs/route.ts, src/app/api/users/route.ts, src/app/api/users/me/onboarding/route.ts, src/app/api/users/me/route.ts, src/app/api/users/[id]/route.ts, src/app/api/users/[id]/onboarding/route.ts, src/app/api/pairs/create/route.ts, src/app/api/pairs/[id]/pause/route.ts, src/app/api/pairs/[id]/resume/route.ts, src/app/api/activities/next/route.ts, src/app/api/pairs/[id]/suggest/route.ts, src/app/api/pairs/[id]/activities/suggest/route.ts, src/app/api/pairs/[id]/activities/from-template/route.ts, src/app/api/match/like/route.ts, src/app/api/match/respond/route.ts, src/app/api/match/accept/route.ts, src/app/api/match/reject/route.ts, src/app/api/match/confirm/route.ts, src/app/api/match/card/route.ts, src/app/api/answers/bulk/route.ts, src/app/api/questionnaires/[id]/route.ts, src/app/api/activities/[id]/accept/route.ts, src/app/api/activities/[id]/cancel/route.ts, src/app/api/activities/[id]/checkin/route.ts, src/app/api/activities/[id]/complete/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts, src/components/OnboardingWizard.tsx, src/app/page.tsx, docs/04-api-contracts.md, docs/05-analytics-events.md, docs/07-security-privacy.md, docs/problems/PROB-012-analytics-events-not-unified-and-auditable.md, docs/problems/PROB-014-missing-rate-limiting-and-abuse-controls.md, docs/problems/PROB-015-log-privacy-and-retention-policy-missing.md, docs/problems/PROB-004-no-idempotency-layer-for-mutations.md, docs/problems/PROB-007-business-logic-inside-route-handlers.md, docs/problems/PROB-011-state-machine-guards-not-centralized.md, docs/CHANGELOG.md


Date: 2026-02-08
Summary:
- Added runtime entitlements stack (`resolveEntitlements`, `assertEntitlement`, `assertQuota`) with plan catalog, subscription storage, quota usage storage, and dev/admin grant endpoint.
- Applied entitlement/quota guards to key monetization-sensitive endpoints (`/api/match/*` mutations, `/api/pairs/create`, `/api/pairs/[id]/suggest`, `/api/pairs/[id]/activities/suggest`, `/api/activities/next`) and wired profile-summary feature flags to entitlement resolution.
- Unified activity suggestion pipeline in `activityOfferService`, switched match-confirm seeding to the same pipeline, added `ActivityOfferDTO`, and introduced legacy `RelationshipActivity` read-only compatibility mapping with audit events.
Files: src/lib/entitlements/types.ts, src/lib/entitlements/catalog.ts, src/lib/entitlements/resolve.ts, src/lib/entitlements/guards.ts, src/models/Subscription.ts, src/models/EntitlementQuotaUsage.ts, src/app/api/entitlements/grant/route.ts, src/app/api/match/like/route.ts, src/app/api/match/respond/route.ts, src/app/api/match/accept/route.ts, src/app/api/match/reject/route.ts, src/app/api/match/confirm/route.ts, src/app/api/pairs/create/route.ts, src/app/api/pairs/[id]/suggest/route.ts, src/app/api/pairs/[id]/activities/suggest/route.ts, src/app/api/activities/next/route.ts, src/domain/services/activityOffer.service.ts, src/domain/services/match.service.ts, src/domain/services/relationshipActivityLegacy.service.ts, src/app/api/pairs/[id]/activities/route.ts, src/lib/dto/activity.dto.ts, src/lib/audit/eventTypes.ts, src/models/RelationshipActivity.ts, src/app/api/users/me/profile-summary/route.ts, docs/problems/PROB-013-entitlements-abstraction-not-implemented.md, docs/problems/PROB-010-legacy-relationship-activity-still-present.md, docs/problems/PROB-009-duplicate-activity-suggestion-flows.md, docs/06-entitlements-billing.md, docs/02-domain-model.md, docs/04-api-contracts.md, docs/05-analytics-events.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Added a new client architecture layer (`src/client/api`, `src/client/hooks`, `src/client/stores`, `src/client/viewmodels`) with typed envelope transport, idempotency support, centralized UI error mapping, and zustand cache-by-key patterns.
- Migrated priority UI slices to container/view + hooks: activity entry + main-menu, match flow (`search`, `match-card/create`, `match/inbox`, `match/like/[id]`, `LikeModal`), pair activities flow (`couple-activity`).
- Standardized async UX with reusable `LoadingView/ErrorView/PaywallView/EmptyStateView` and documented PROB-008 outcome + API contract notes for UI error mapping.
Files: src/client/api/types.ts, src/client/api/http.ts, src/client/api/errors.ts, src/client/api/match.api.ts, src/client/api/pairs.api.ts, src/client/api/activities.api.ts, src/client/api/questionnaires.api.ts, src/client/api/users.api.ts, src/client/api/entitlements.api.ts, src/client/hooks/useApi.ts, src/client/hooks/useCurrentUser.ts, src/client/hooks/usePair.ts, src/client/hooks/useMatchFeed.ts, src/client/hooks/useInbox.ts, src/client/hooks/useActivityOffers.ts, src/client/hooks/useQuestionnaires.ts, src/client/stores/useEntitiesStore.ts, src/client/stores/useUiStore.ts, src/client/viewmodels/activity.viewmodels.ts, src/components/ui/LoadingView.tsx, src/components/ui/ErrorView.tsx, src/components/ui/PaywallView.tsx, src/components/ui/EmptyStateView.tsx, src/components/main-menu/SearchPairTile.tsx, src/components/main-menu/SearchPairTileView.tsx, src/components/LikeModal.tsx, src/components/match/LikeModalView.tsx, src/features/match/feed/MatchFeedView.tsx, src/features/match/inbox/MatchInboxView.tsx, src/features/match/like/LikeDetailsView.tsx, src/features/activities/CoupleActivityView.tsx, src/app/page.tsx, src/app/search/page.tsx, src/app/match-card/create/page.tsx, src/app/match/inbox/page.tsx, src/app/match/like/[id]/page.tsx, src/app/couple-activity/page.tsx, docs/problems/PROB-008-god-components-and-ui-api-coupling.md, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Fixed profile crash after envelope/DTO migration by switching profile pages to envelope-safe reads and adding a unified `normalizeProfileSummary(...)` adapter with safe defaults (`levelsByAxis`, `positivesByAxis`, `negativesByAxis`, empty sections).
- Fixed pair-profile false "Пара не найдена" by standardizing on `pair.id`, adding `pairId` to `/api/pairs/status`, migrating pair UI links/routes to `/pair/[id]`, and normalizing `_id -> id` in client pair adapters.
- Added server-side guard-failure diagnostics in `/api/pairs/[id]/summary` with `{ userId, requestedPairId, foundPairId, membershipOk }` logging for 404/403 troubleshooting.
Files: src/app/(auth)/profile/page.tsx, src/app/profile/(tabs)/matching/page.tsx, src/client/viewmodels/profile.viewmodels.ts, src/client/viewmodels/pair.viewmodels.ts, src/client/viewmodels/index.ts, src/client/api/types.ts, src/client/api/pairs.api.ts, src/client/hooks/usePair.ts, src/components/profile/UserHeader.tsx, src/components/profile/InsightsList.tsx, src/components/activities/UserActivityCard.tsx, src/components/main-menu/SearchPairTile.tsx, src/components/main-menu/SearchPairTileView.tsx, src/features/pair/PairProfilePageClient.tsx, src/app/pair/page.tsx, src/app/pair/[id]/page.tsx, src/app/pair/[id]/diagnostics/page.tsx, src/app/pair/[id]/questionnaire/[qid]/page.tsx, src/app/api/pairs/status/route.ts, src/app/api/pairs/me/route.ts, src/app/api/pairs/[id]/summary/route.ts, src/app/api/users/me/profile-summary/route.ts, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Fixed mojibake (broken Cyrillic encoding) in profile and main-menu UI labels so Russian text renders correctly.
- Re-encoded affected client pages/components and questionnaire card API labels to valid UTF-8 text.
Files: src/app/(auth)/profile/page.tsx, src/app/profile/(tabs)/matching/page.tsx, src/features/pair/PairProfilePageClient.tsx, src/components/profile/UserHeader.tsx, src/components/main-menu/SearchPairTileView.tsx, src/components/activities/UserActivityCard.tsx, src/app/api/questionnaires/cards/route.ts, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Rebuilt docs navigation with normalized indexes for root docs, problems, and ADR records.
- Added an Engineering Playbook (`backend`, `frontend`, checklists, templates) as the mandatory coding entrypoint.
- Added `Prevention rule` and post-fix `Evidence` sections to all resolved `PROB-001..016` files.
Files: docs/README.md, docs/problems/README.md, docs/ADR/README.md, docs/engineering/README.md, docs/engineering/backend-playbook.md, docs/engineering/frontend-playbook.md, docs/engineering/checklists/api-endpoint-checklist.md, docs/engineering/checklists/domain-service-checklist.md, docs/engineering/checklists/state-machine-checklist.md, docs/engineering/checklists/idempotency-checklist.md, docs/engineering/checklists/audit-rate-limit-entitlements-checklist.md, docs/engineering/checklists/ui-container-view-checklist.md, docs/engineering/checklists/dto-contract-checklist.md, docs/engineering/templates/PROB-template.md, docs/engineering/templates/ADR-template.md, docs/engineering/templates/endpoint-template.md, docs/engineering/templates/event-template.md, docs/problems/PROB-001-client-userid-trust-in-api.md, docs/problems/PROB-002-fragmented-session-auth-adoption.md, docs/problems/PROB-003-missing-resource-authorization-guards.md, docs/problems/PROB-004-no-idempotency-layer-for-mutations.md, docs/problems/PROB-005-inconsistent-api-response-contracts.md, docs/problems/PROB-006-no-centralized-dto-layer.md, docs/problems/PROB-007-business-logic-inside-route-handlers.md, docs/problems/PROB-008-god-components-and-ui-api-coupling.md, docs/problems/PROB-009-duplicate-activity-suggestion-flows.md, docs/problems/PROB-010-legacy-relationship-activity-still-present.md, docs/problems/PROB-011-state-machine-guards-not-centralized.md, docs/problems/PROB-012-analytics-events-not-unified-and-auditable.md, docs/problems/PROB-013-entitlements-abstraction-not-implemented.md, docs/problems/PROB-014-missing-rate-limiting-and-abuse-controls.md, docs/problems/PROB-015-log-privacy-and-retention-policy-missing.md, docs/problems/PROB-016-no-cross-cutting-validation-layer-zod.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Fixed personal questionnaire loading hang by migrating `questionnaire/[id]` page to typed envelope API and explicit loading/error states.
- Added explicit questionnaire classification (`scope: personal|couple`) in DTO/contracts and cards endpoint filter support (`?audience=personal|couple`).
- Implemented explicit start routing (`startPersonalQuestionnaire` vs `startCoupleQuestionnaire`) and rebuilt questionnaires UI into personal/couple sections with per-item loading and deterministic error handling.
Files: src/lib/dto/questionnaire.dto.ts, src/client/api/types.ts, src/client/api/questionnaires.api.ts, src/client/hooks/useQuestionnaires.ts, src/app/api/questionnaires/route.ts, src/app/api/questionnaires/cards/route.ts, src/components/QuestionnaireCard.tsx, src/features/questionnaires/QuestionnairesPageView.tsx, src/app/questionnaires/page.tsx, src/app/questionnaire/[id]/page.tsx, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Removed unused legacy UI/client/backend files after import-chain verification (`rg`) and static checks (`ts-prune`, `knip`) without changing API routes/contracts.
- Removed dead DTO/model artifacts (`analytics.dto`, `Log`, `Insight`, `Match`) and unused client barrels/helpers (`client/api/index`, `client/hooks/index`, `client/api/entitlements.api`).
- Updated domain/analytics/ADR/problem docs to reflect `EventLog` canonical analytics runtime and removed references to deleted runtime files.
Files: src/components/common/EmptyState.tsx, src/components/common/ErrorCard.tsx, src/client/api/index.ts, src/client/hooks/index.ts, src/client/api/entitlements.api.ts, src/lib/dto/index.ts, src/lib/dto/analytics.dto.ts, src/models/Log.ts, src/models/Insight.ts, src/models/Match.ts, src/utils/passport.ts, docs/02-domain-model.md, docs/05-analytics-events.md, docs/ADR/ADR-003-event-log-monolith.md, docs/problems/PROB-012-analytics-events-not-unified-and-auditable.md, docs/problems/PROB-015-log-privacy-and-retention-policy-missing.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Fixed personal questionnaire vector application by introducing a canonical `src/domain/vectors/*` scoring/apply pipeline and switching both personal + couple questionnaire services to it.
- Made `POST /api/questionnaires/[id]` idempotent (`withIdempotency`) and questionnaire-scoped for scoring, with strict question match validation to prevent silent no-op vector updates.
- Added personal submit UI refetch (`current user` + `profile summary`), added no-store fetch policy for profile summary, and extended `ANSWERS_BULK_SUBMITTED` audit metadata with `audience/matchedCount/questionnaireId`.
Files: src/domain/vectors/types.ts, src/domain/vectors/scoring.ts, src/domain/vectors/apply.ts, src/domain/vectors/index.ts, src/domain/services/questionnaires.service.ts, src/app/api/questionnaires/[id]/route.ts, src/app/api/answers/bulk/route.ts, src/lib/audit/eventTypes.ts, src/client/api/http.ts, src/client/api/users.api.ts, src/app/questionnaire/[id]/page.tsx, docs/02-domain-model.md, docs/04-api-contracts.md, docs/05-analytics-events.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Improved vector stability by introducing weighted per-axis scoring, policy-based apply dampening, and clamp-safe step control in `src/domain/vectors/*`.

Date: 2026-02-15
Summary:
- Added a dedicated UI audit doc for React best-practices adoption with gaps, 3-step execution plan, and a ready-to-run prompt for skill-driven refactoring.
- Documented current UI/doc coverage gaps (main menu, pair profile, couple activity, match inbox, legacy questionnaire quick-flow).
- Linked the new UI audit document from the main docs map.
Files: docs/ui/react-best-practices-ui-audit.md, docs/README.md, docs/CHANGELOG.md
- Added explainability metadata from vector apply (`confidence`, `appliedStepByAxis`, `clampedAxes`, `deltaMagnitude`, `sumWeightsTotal`) into questionnaire audit events.
- Added pure-function self-check script for vectors policy scenarios (short/long confidence, edge damping, weight influence, clamp bounds).
Files: src/domain/vectors/types.ts, src/domain/vectors/scoring.ts, src/domain/vectors/apply.ts, src/domain/services/questionnaires.service.ts, src/lib/audit/eventTypes.ts, scripts/vectors-policy.selfcheck.ts, docs/02-domain-model.md, docs/05-analytics-events.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Added personal questionnaire anti-farm cooldown (7 days) so repeat submits of the same personal questionnaire do not re-apply full vector effect inside the cooldown window.
- Added `user.vectorsMeta.personalQuestionnaireCooldowns` tracking and deterministic cooldown decision helper in `src/domain/vectors/antifarm.ts` (with `bulk` key fallback for ad-hoc personal bulk submit).
- Extended `ANSWERS_BULK_SUBMITTED` audit metadata with cooldown application fields (`applied`, `reason`, `cooldownDays`, `scoringVersion`) while preserving existing API/envelope contracts.
- Added pure self-check script for anti-farm cooldown behavior.
Files: src/models/User.ts, src/domain/vectors/antifarm.ts, src/domain/vectors/index.ts, src/domain/services/questionnaires.service.ts, src/lib/audit/eventTypes.ts, scripts/vectors-antifarm.selfcheck.ts, docs/02-domain-model.md, docs/05-analytics-events.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Hardened `/couple-activity` checkin->complete chain with pending-complete recovery state and retry-complete UX that does not resend check-in answers.
- Added explicit client idempotency key flow for checkin/complete retries, plus in-flight button locks to reduce double-submit risk.
- Improved client error-kind mapping for 401/403/404/409/422, added self-check scripts, and updated pair-activity working inventory with explicit no-DB scope.
Files: src/app/couple-activity/page.tsx, src/features/activities/CoupleActivityView.tsx, src/components/activities/CheckInModal.tsx, src/client/hooks/useActivityOffers.ts, src/client/api/activities.api.ts, src/client/api/http.ts, src/client/api/idempotency.ts, src/client/api/errors.ts, src/client/viewmodels/activity.viewmodels.ts, src/features/activities/checkinCompleteFlow.ts, scripts/activity-flow.selfcheck.ts, scripts/client-errors.selfcheck.ts, package.json, docs/activities/pair-activity-inventory.working.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Added a deterministic embedded color system for Discord iframe (`globals` tokens + reusable `app-*` UI classes) to prevent host-theme contrast regressions.
- Updated shared UI surfaces (main menu tiles, cards, modals, tabs, back bar, loading/empty states) with explicit background/text/border colors while keeping existing flows unchanged.
- Documented the new embedded theme approach and constraints.
Files: src/app/globals.css, src/app/layout.tsx, src/app/main-menu/page.tsx, src/app/page.tsx, src/components/main-menu/SearchPairTileView.tsx, src/components/main-menu/ProfileTile.tsx, src/components/main-menu/QuestionnaireTile.tsx, src/components/main-menu/LootboxTile.tsx, src/components/main-menu/CoupleActivityTile.tsx, src/components/ui/BackBar.tsx, src/components/ui/LoadingView.tsx, src/components/ui/EmptyStateView.tsx, src/components/MatchTabs.tsx, src/components/CandidateCard.tsx, src/components/QuestionCard.tsx, src/components/QuestionnaireCard.tsx, src/components/activities/ActivityCard.tsx, src/components/activities/CheckInModal.tsx, src/components/match/LikeModalView.tsx, src/features/activities/CoupleActivityView.tsx, src/features/match/inbox/MatchInboxView.tsx, src/features/questionnaires/QuestionnairesPageView.tsx, docs/ui/discord-embedded-theme.md, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Restored readable UTF-8 Russian text in remaining UI surfaces that still rendered mojibake in embedded mode.
- Fixed action/aria/error/paywall labels so text is consistently readable in activities, match, and main-menu flows.
Files: src/app/main-menu/page.tsx, src/app/page.tsx, src/components/CandidateCard.tsx, src/components/MatchTabs.tsx, src/components/QuestionCard.tsx, src/components/activities/ActivityCard.tsx, src/components/activities/CheckInModal.tsx, src/components/main-menu/CoupleActivityTile.tsx, src/components/main-menu/LootboxTile.tsx, src/components/main-menu/ProfileTile.tsx, src/components/main-menu/QuestionnaireTile.tsx, src/components/main-menu/SearchPairTileView.tsx, src/components/match/LikeModalView.tsx, src/components/ui/BackBar.tsx, src/components/ui/ErrorView.tsx, src/components/ui/LoadingView.tsx, src/components/ui/PaywallView.tsx, src/features/activities/CoupleActivityView.tsx, src/features/match/inbox/MatchInboxView.tsx, src/features/questionnaires/QuestionnairesPageView.tsx, docs/CHANGELOG.md

Date: 2026-02-08
Summary:
- Fixed Vercel build failure caused by invalid/non-UTF-8 source encoding in shared UI components.
- Rewrote BackBar/ErrorView/PaywallView as clean UTF-8 files and verified repository text files are UTF-8.
Files: src/components/ui/BackBar.tsx, src/components/ui/ErrorView.tsx, src/components/ui/PaywallView.tsx, docs/CHANGELOG.md

Date: 2026-02-09
Summary:
- Expanded responsive behavior from mobile to desktop across main navigation and primary feature screens without changing product flows.
- Reworked main-menu to adaptive grid layout and updated shared cards/modals/tabs/action rows for wrapping and better small-screen ergonomics.
- Normalized page container widths and grid breakpoints for activities, match, questionnaires, and questionnaire runner screens.
Files: src/app/main-menu/page.tsx, src/app/match-card/create/page.tsx, src/app/questionnaire/[id]/page.tsx, src/app/questionnaires/page.tsx, src/app/search/page.tsx, src/components/CandidateCard.tsx, src/components/MatchTabs.tsx, src/components/QuestionCard.tsx, src/components/QuestionnaireCard.tsx, src/components/activities/ActivityCard.tsx, src/components/activities/CheckInModal.tsx, src/components/main-menu/CoupleActivityTile.tsx, src/components/main-menu/LootboxTile.tsx, src/components/main-menu/ProfileTile.tsx, src/components/main-menu/QuestionnaireTile.tsx, src/components/main-menu/SearchPairTileView.tsx, src/components/match/LikeModalView.tsx, src/components/ui/BackBar.tsx, src/features/activities/CoupleActivityView.tsx, src/features/match/feed/MatchFeedView.tsx, src/features/match/inbox/MatchInboxView.tsx, src/features/match/like/LikeDetailsView.tsx, src/features/questionnaires/QuestionnairesPageView.tsx, docs/ui/discord-embedded-theme.md, docs/CHANGELOG.md

Date: 2026-02-09
Summary:
- Added a global UI polish layer (page shells, richer panel depth, unified button ergonomics, focus rings, hover lift, and reduced-motion-safe reveal helpers).
- Applied shared polish classes to main menu, activities, questionnaires, and match surfaces for a more consistent and elegant visual language.
- Restored readable Russian text in key match-flow screens and state views (search/inbox/match-card/create/like-details/tabs/error/paywall).
Files: src/app/globals.css, src/components/ui/BackBar.tsx, src/components/ui/LoadingView.tsx, src/components/ui/EmptyStateView.tsx, src/components/ui/ErrorView.tsx, src/components/ui/PaywallView.tsx, src/components/MatchTabs.tsx, src/features/match/feed/MatchFeedView.tsx, src/app/search/page.tsx, src/app/match/inbox/page.tsx, src/app/match-card/create/page.tsx, src/features/match/like/LikeDetailsView.tsx, src/features/match/inbox/MatchInboxView.tsx, src/components/CandidateCard.tsx, src/components/activities/ActivityCard.tsx, src/components/QuestionnaireCard.tsx, src/features/activities/CoupleActivityView.tsx, src/features/questionnaires/QuestionnairesPageView.tsx, src/components/main-menu/SearchPairTileView.tsx, src/components/main-menu/ProfileTile.tsx, src/components/main-menu/QuestionnaireTile.tsx, src/components/main-menu/LootboxTile.tsx, src/components/main-menu/CoupleActivityTile.tsx, src/app/main-menu/page.tsx, src/app/questionnaires/page.tsx, docs/ui/discord-embedded-theme.md, docs/CHANGELOG.md
Date: 2026-02-09
Summary:
- Retuned the app palette in `globals.css` to warm cream/peach/pink tones and softened shared motion easing/shadows.
- Added reusable UI classes for navigation and state surfaces (`app-backbar*`, `app-alert*`, `app-tile*`) and applied them to shared UI components.
- Restyled main-menu tiles and polished `ErrorView`/`PaywallView`/`BackBar` to align interaction feel with the updated visual language.
Files: src/app/globals.css, src/components/ui/PaywallView.tsx, src/components/ui/ErrorView.tsx, src/components/ui/BackBar.tsx, src/components/main-menu/SearchPairTileView.tsx, src/components/main-menu/ProfileTile.tsx, src/components/main-menu/QuestionnaireTile.tsx, src/components/main-menu/LootboxTile.tsx, src/components/main-menu/CoupleActivityTile.tsx, docs/ui/discord-embedded-theme.md, docs/CHANGELOG.md
Date: 2026-02-09
Summary:
- Added a second visual pass to reduce flatness by introducing layered panel/alert surfaces with stronger depth and accent separation.
- Increased palette diversity across main-menu cards via new tile variants (`app-tile-mint`, `app-tile-plum`) and retuned gradient contrast.
- Added subtle background texture and slow gradient breathing on tiles (with existing reduced-motion fallback preserved).
Files: src/app/globals.css, src/components/main-menu/ProfileTile.tsx, src/components/main-menu/QuestionnaireTile.tsx, docs/ui/discord-embedded-theme.md, docs/CHANGELOG.md
Date: 2026-02-09
Summary:
- Fixed transparent-looking containers in profile and pair-profile screens by replacing legacy border-only blocks with explicit `app-panel` / `app-panel-soft` surfaces.
- Updated pair/profile action controls to shared themed button classes so controls remain readable on textured backgrounds.
- Applied the same surfaced treatment to profile tabs (`profile`, `matching`, `activities`, `history`, `settings`) for consistent visual depth.
Files: src/features/pair/PairProfilePageClient.tsx, src/app/(auth)/profile/page.tsx, src/components/profile/UserHeader.tsx, src/components/profile/SummaryTiles.tsx, src/components/profile/InsightsList.tsx, src/components/profile/PreferencesCard.tsx, src/components/activities/UserActivityCard.tsx, src/components/activities/UserActivitiesPlaceholder.tsx, src/app/profile/(tabs)/profile/page.tsx, src/app/profile/(tabs)/matching/page.tsx, src/app/profile/(tabs)/activities/page.tsx, src/app/profile/(tabs)/history/page.tsx, src/app/profile/(tabs)/settings/page.tsx, docs/ui/discord-embedded-theme.md, docs/CHANGELOG.md
Date: 2026-02-09
Summary:
- Added explicit opaque profile surface modifiers (`app-panel-solid`, `app-panel-soft-solid`) to prevent background texture from visually bleeding through profile and pair-profile blocks.
- Applied solid surface modifiers to profile overview, profile tabs, pair profile sections, and profile activity/summary/header blocks.
- Kept logic untouched; only visual surface rendering and component class names were adjusted.
Files: src/app/globals.css, src/features/pair/PairProfilePageClient.tsx, src/app/(auth)/profile/page.tsx, src/app/profile/(tabs)/profile/page.tsx, src/app/profile/(tabs)/matching/page.tsx, src/app/profile/(tabs)/activities/page.tsx, src/app/profile/(tabs)/history/page.tsx, src/app/profile/(tabs)/settings/page.tsx, src/components/profile/UserHeader.tsx, src/components/profile/SummaryTiles.tsx, src/components/profile/InsightsList.tsx, src/components/profile/PreferencesCard.tsx, src/components/activities/UserActivityCard.tsx, src/components/activities/UserActivitiesPlaceholder.tsx, docs/ui/discord-embedded-theme.md, docs/CHANGELOG.md
Date: 2026-02-11
Summary:
- Fixed first-login registration path by handling Discord users without a custom avatar (`avatar = null`) via avatar normalization and safer `/api/users` input validation.
- Removed the third user gender option from onboarding and constrained `User.personal.gender` to only `male` and `female`.
- Unified avatar URL resolution (hash/url/fallback) across onboarding, landing, key main-menu cards, match modals, and profile-summary/match DTO mapping.
Files: src/lib/discord/avatar.ts, src/app/page.tsx, src/components/OnboardingWizard.tsx, src/app/api/users/route.ts, src/models/User.ts, src/lib/dto/match.dto.ts, src/app/api/users/me/profile-summary/route.ts, src/components/main-menu/ProfileTile.tsx, src/components/main-menu/SearchPairTileView.tsx, src/components/CandidateCard.tsx, src/components/match/LikeModalView.tsx, docs/07-security-privacy.md, docs/CHANGELOG.md
Date: 2026-02-11
Summary:
- Fixed `401 AUTH_REQUIRED` on private client writes by making `fetchEnvelope` always send cookies (`credentials: include`).
- Updated session cookie policy in `/api/exchange-code` to use secure-context detection (`https` / `x-forwarded-proto`) instead of `NODE_ENV` only.
- Documented the embedded-session update in security docs.
Files: src/utils/apiClient.ts, src/app/api/exchange-code/route.ts, docs/07-security-privacy.md, docs/CHANGELOG.md
Date: 2026-02-12
Summary:
- Added `Cormorant Infant` (display) and `Hachi Maru Pop` (accent) via `next/font/google` with Cyrillic + Latin subsets and CSS variables.
- Introduced typography tokens (`font-sans`, `font-display`, `font-accent`) in Tailwind and base styles; applied display/accent fonts to key tile/card/profile/question components.
- Added typography specification doc and linked it in docs map.
Files: src/app/layout.tsx, src/app/globals.css, tailwind.config.ts, src/components/main-menu/LootboxTile.tsx, src/components/main-menu/CoupleActivityTile.tsx, src/components/main-menu/ProfileTile.tsx, src/components/main-menu/QuestionnaireTile.tsx, src/components/main-menu/SearchPairTileView.tsx, src/components/activities/ActivityCard.tsx, src/components/activities/UserActivityCard.tsx, src/components/profile/UserHeader.tsx, src/components/profile/SummaryTiles.tsx, src/components/QuestionCard.tsx, src/components/QuestionnaireCard.tsx, src/components/ui/EmptyStateView.tsx, docs/08-typography.md, docs/README.md, docs/CHANGELOG.md

Date: 2026-02-13
Summary:
- Fixed personal questionnaire vector gain issue by switching `/questionnaire/[id]` submit from per-question POST to one final batched POST.
- Added `submitPersonalAnswers(...)` client API helper for questionnaire batch payload.
- Documented updated personal questionnaire apply mode and cooldown behavior impact.
Files: src/app/questionnaire/[id]/page.tsx, src/client/api/questionnaires.api.ts, docs/data/questionnaire-flow.md, docs/CHANGELOG.md

Date: 2026-02-15
Summary:
- Migrated legacy UI transport in questionnaire/onboarding/pair flows to typed `src/client/api/*` and hook orchestration.
- Removed page-level direct fetch from Discord landing flow via typed Discord client module.
- Fixed user-facing mojibake in touched pair/questionnaire/onboarding/match-feed screens and aligned legacy loading/error/empty states to shared UI blocks.
Files: src/client/api/types.ts, src/client/api/users.api.ts, src/client/api/questionnaires.api.ts, src/client/api/pairs.api.ts, src/client/api/discord.api.ts, src/client/hooks/useLegacyQuestionnaireQuickFlow.ts, src/app/page.tsx, src/app/questionnaire/page.tsx, src/components/OnboardingWizard.tsx, src/app/pair/[id]/diagnostics/page.tsx, src/app/pair/[id]/questionnaire/[qid]/page.tsx, src/components/QuestionnaireCard.tsx, src/features/pair/PairProfilePageClient.tsx, src/features/match/feed/MatchFeedView.tsx, docs/ui/react-best-practices-ui-audit.md, docs/CHANGELOG.md

Date: 2026-02-15
Summary:
- Fixed mojibake in user-facing personal activity card strings.
- Replaced corrupted inline comments in profile-summary and pair-activities API routes with readable text.
- Recreated questionnaire cards UI doc in clean UTF-8.
Files: src/components/activities/UserActivityCard.tsx, src/app/api/users/me/profile-summary/route.ts, src/app/api/pairs/[id]/activities/route.ts, docs/ui/questionnaire-cards.md, docs/CHANGELOG.md

Date: 2026-02-16
Summary:
- Added dedicated questionnaire/match view-model layers and moved targeted presentation components to VM contracts instead of direct DTO types.
- Completed store/hook consolidation in auth/profile/questionnaire/pair flows by migrating to `useCurrentUser` and removing legacy `useUserStore`.
- Updated UI audit documentation to close previously recorded residuals for DTO leakage and mixed store/hook orchestration.
Files: src/client/viewmodels/questionnaire.viewmodels.ts, src/client/viewmodels/match.viewmodels.ts, src/client/viewmodels/index.ts, src/components/QuestionnaireCard.tsx, src/features/questionnaires/QuestionnairesPageView.tsx, src/features/match/feed/MatchFeedView.tsx, src/features/match/inbox/MatchInboxView.tsx, src/features/match/like/LikeDetailsView.tsx, src/app/questionnaires/page.tsx, src/app/search/page.tsx, src/app/match/inbox/page.tsx, src/app/match/like/[id]/page.tsx, src/app/page.tsx, src/components/OnboardingWizard.tsx, src/app/(auth)/profile/page.tsx, src/features/pair/PairProfilePageClient.tsx, src/app/profile/(tabs)/matching/page.tsx, src/app/questionnaire/page.tsx, src/app/pair/[id]/questionnaire/[qid]/page.tsx, src/components/main-menu/ProfileTile.tsx, src/store/useUserStore.ts, docs/ui/react-best-practices-ui-audit.md, docs/CHANGELOG.md

Date: 2026-06-04
Summary:
- Added compact Codex/agent navigation, architecture, API, security, testing, review, and troubleshooting entrypoint docs.
- Added nested `AGENTS.md` files for app, client, components, features, domain, lib, models, scripts, and docs.
- Updated README and package check scripts for agent-friendly setup and targeted verification.
Files: AGENTS.md, README.md, package.json, docs/INDEX.md, docs/PROJECT_MAP.md, docs/ARCHITECTURE.md, docs/API_CONTRACTS.md, docs/SECURITY.md, docs/TESTING.md, docs/CODE_REVIEW.md, docs/TROUBLESHOOTING.md, docs/README.md, docs/AGENTS.md, src/app/AGENTS.md, src/client/AGENTS.md, src/components/AGENTS.md, src/features/AGENTS.md, src/domain/AGENTS.md, src/lib/AGENTS.md, src/models/AGENTS.md, scripts/AGENTS.md, .codex/TASK_TEMPLATE.md, .codex/REPORT_TEMPLATE.md, .codex/PLAN_TEMPLATE.md, docs/CHANGELOG.md

Date: 2026-06-04
Summary:
- Added agent operating modes, context budgets, task packs, docs status, and retrospective loop for Codex discipline.
- Added machine-readable agent diagnostics with severity model, allowlist support, changed-only filtering, and compact/JSON output.
- Updated package scripts to use local `tsx`, ESLint CLI linting, and agent diagnostics in quick checks.
Files: AGENTS.md, README.md, package.json, package-lock.json, .agent-checks.allowlist.json, scripts/agent-checks.ts, docs/AGENT_OPERATING_MODES.md, docs/CONTEXT_BUDGET.md, docs/TASK_PACKS.md, docs/DOCS_STATUS.md, docs/AGENT_RETROSPECTIVE.md, docs/INDEX.md, docs/TESTING.md, docs/CODE_REVIEW.md, docs/TROUBLESHOOTING.md, docs/README.md, .codex/TASK_TEMPLATE.md, .codex/REPORT_TEMPLATE.md, .codex/PLAN_TEMPLATE.md, docs/CHANGELOG.md

Date: 2026-06-04
Summary:
- Closed critical by-id user write access gaps with self-only target enforcement while keeping public user reads DTO-only.
- Validated Discord OAuth `redirect_uri` against server env, fixed match confirmation safe ordering, and persisted create-like initiator answers.
- Added derived user lifecycle DTO state, vector-based create-like scores, and a targeted security-critical selfcheck.
Files: README.md, src/app/api/users/[id]/route.ts, src/domain/services/users.service.ts, src/app/api/exchange-code/route.ts, src/domain/services/match.service.ts, src/lib/dto/user.dto.ts, scripts/security-critical.selfcheck.ts, docs/API_CONTRACTS.md, docs/SECURITY.md, docs/ARCHITECTURE.md, docs/TESTING.md, docs/CHANGELOG.md

Date: 2026-06-04
Summary:
- Fixed pair questionnaire vector over-application by applying scoring only for newly answered questions.
- Completed pair questionnaire sessions once both members answer every questionnaire question.
- Tightened questionnaire answer `ui` validation and rejected zero-match bulk answer submissions.
Files: src/domain/services/questionnaires.service.ts, src/app/api/answers/bulk/route.ts, src/app/api/questionnaires/[id]/route.ts, src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts, scripts/pair-questionnaire-vectors.selfcheck.ts, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-06-04
Summary:
- Added MVP-0 layered vector support with legacy flat-vector reads, scoring helpers, VectorSnapshot and ScoringVersion models.
- Moved pair passport/diagnostic thresholds to a domain service on the `0..1` scale and stopped pair questionnaire answers from mutating user trait vectors.
- Added profile-summary v2 axis confidence/data-status fields and targeted vector/pair diagnostic selfchecks.
Files: eslint.config.mjs, package.json, src/models/User.ts, src/models/Pair.ts, src/models/VectorSnapshot.ts, src/models/ScoringVersion.ts, src/domain/services/vectorScoring.service.ts, src/domain/services/pairDiagnostics.service.ts, src/domain/services/pairs.service.ts, src/domain/services/match.service.ts, src/domain/services/questionnaires.service.ts, src/domain/services/users.service.ts, src/domain/vectors/apply.ts, src/lib/audit/eventTypes.ts, src/lib/mongodb.ts, src/app/api/exchange-code/route.ts, src/app/api/users/me/profile-summary/route.ts, src/app/api/pairs/[id]/diagnostics/route.ts, scripts/vector-scoring.selfcheck.ts, scripts/pair-diagnostics.selfcheck.ts, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Fixed mobile/embedded login session cookie handling by treating production `/api/exchange-code` responses as secure even when proxy headers are incomplete.
Files: src/app/api/exchange-code/route.ts, scripts/security-critical.selfcheck.ts, docs/SECURITY.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Updated vulnerable direct dependencies and removed unused `next-auth`, eliminating the vulnerable `uuid` chain.
- Blocked client profile writes to `vectors` and `embeddings`, tightened `location` validation, and kept vector mutations behind scoring/snapshot services.
- Hardened entitlement grants with constant-time admin key comparison and local-only unkeyed development access; reduced browser Discord token exposure by returning a minimal profile from `/api/exchange-code`.
- Marked `/api/exchange-code` token responses as non-cacheable.
- Required session auth for closed-beta catalog/questionnaire/question endpoints that expose product content or scoring metadata.
- Required session auth for `GET /api/users/[id]` to avoid unauthenticated user enumeration while preserving public-scope DTO output.
- Added baseline security headers while preserving Discord iframe embedding via CSP instead of `X-Frame-Options`.
- Removed the unused browser-side direct Discord API helper so access-token usage stays in the SDK authentication path.
- Ignored generated `next-env.d.ts` in ESLint so Next route-type references do not break source linting.
Files: eslint.config.mjs, next.config.ts, package.json, package-lock.json, next-auth.d.ts, tsconfig.json, scripts/security-critical.selfcheck.ts, src/app/api/activity-templates/route.ts, src/app/api/entitlements/grant/route.ts, src/app/api/exchange-code/route.ts, src/app/api/questionnaires/route.ts, src/app/api/questionnaires/[id]/route.ts, src/app/api/questions/route.ts, src/app/api/users/route.ts, src/app/api/users/me/route.ts, src/app/api/users/[id]/route.ts, src/app/page.tsx, src/client/api/discord.api.ts, src/client/api/types.ts, src/domain/services/users.service.ts, docs/API_CONTRACTS.md, docs/SECURITY.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Made mobile/embedded Discord login persist the basic user profile inside `/api/exchange-code`, avoiding an immediate protected `/api/users` write before the session cookie is reliably available.
- Added an in-memory bearer fallback for embedded mobile clients so all shared `requireSession` routes continue to work when iframe cookies are not returned.
- Kept `/api/users` and other private endpoints session-protected and documented the OAuth profile/session fallback boundary.
Files: src/app/api/exchange-code/route.ts, src/app/page.tsx, src/lib/auth/session.ts, src/client/api/http.ts, scripts/security-critical.selfcheck.ts, docs/API_CONTRACTS.md, docs/SECURITY.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Added pair-scoped weekly check-in identity, an idempotent index migration, and fresh weekly aggregation for Pair readiness/fatigue.
- Added a privacy-safe pair weekly summary endpoint with submitted status, aggregates, unresolved-topic count, and divergence without peer notes.
- Replaced the pair profile's standalone form with a weekly loop panel and refreshed dashboard/next-step state after submit.
Files: src/models/WeeklyCheckIn.ts, scripts/migrate-weekly-checkins-pair-scope.ts, src/domain/services/weeklyCheckIn.service.ts, src/app/api/pairs/[id]/weekly-checkin/current/route.ts, src/lib/audit/eventTypes.ts, src/client/api/types.ts, src/client/api/checkins.api.ts, src/components/checkins/WeeklyCheckInCard.tsx, src/components/checkins/PairWeeklyCheckInPanel.tsx, src/features/pair/PairProfilePageClient.tsx, src/domain/services/pairDashboardSummary.service.ts, src/client/viewmodels/pair.viewmodels.ts, scripts/weekly-checkin.selfcheck.ts, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Added a deterministic pair activity decision engine using diagnostics, weekly check-ins, fatigue/readiness, divergence, risk zones, closeness, pair state, and current activity.
- Reworked pair suggestion generation with idempotency, offered limits, cooldown/deduplication, consent-safe sensitive templates, and a 24-template system fallback catalog.
- Extended the suggestion response with a typed plan and explanation, updated activity cards with human-readable labels, and aligned pair dashboard current-activity priority.
Files: src/domain/services/pairActivityDecision.service.ts, src/domain/services/activityOffer.service.ts, src/app/api/pairs/[id]/suggest/route.ts, src/client/api/types.ts, src/client/api/activities.api.ts, src/client/hooks/useActivityOffers.ts, src/client/viewmodels/activity.viewmodels.ts, src/components/activities/ActivityCard.tsx, src/domain/services/pairDashboardSummary.service.ts, scripts/pair-activity-decision.selfcheck.ts, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Added universal activity completion feedback, pair-aware result summaries, replace-on-retry answers, and preliminary one-participant completion.
- Added bounded result-based vector/readiness/fatigue effects with `activity_completion` snapshots and privacy-safe completion audit metadata.
- Added result/effect history UI, second-participant result refinement, completion notifications, and recent-result signals for future suggestions.
Files: scripts/activity-flow.selfcheck.ts, src/app/couple-activity/page.tsx, src/client/api/types.ts, src/components/activities/ActivityCard.tsx, src/components/activities/CheckInModal.tsx, src/domain/services/activities.service.ts, src/domain/services/activityOffer.service.ts, src/features/activities/CoupleActivityView.tsx, src/lib/audit/eventTypes.ts, src/lib/dto/activity.dto.ts, src/models/PairActivity.ts, src/models/VectorSnapshot.ts, src/utils/activities.ts, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Stabilized the activity result path through the canonical client viewmodel and added legacy-history fallbacks.
- Added persistent suggestion-plan/skip context, status-aware completion messages, and clearer feedback scale/privacy UX.
- Made repeated completion side-effect free and covered late-peer refinement, DTO privacy, and viewmodel propagation in the activity selfcheck.
Files: scripts/activity-flow.selfcheck.ts, src/app/couple-activity/page.tsx, src/client/hooks/useActivityOffers.ts, src/client/viewmodels/activity.viewmodels.ts, src/components/activities/ActivityCard.tsx, src/components/activities/CheckInModal.tsx, src/domain/services/activities.service.ts, src/features/activities/CoupleActivityView.tsx, src/utils/activities.ts, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Added account profile mode, relationship context, profile completion, and primary next-step fields to `/api/users/me/profile-summary`.
- Fixed paused pairs so they stay in paired mode and expose a paused `currentPair` instead of looking like solo/history.
- Replaced the `/profile/profile` placeholder with a read-only account details page and added a mode-aware hero/completion/CTA overview to `/profile`.
Files: package.json, src/app/api/users/me/profile-summary/route.ts, src/domain/services/userProfileSummary.service.ts, src/client/api/types.ts, src/client/viewmodels/profile.viewmodels.ts, src/components/profile/ModeAwareProfileOverview.tsx, src/app/(auth)/profile/page.tsx, src/app/profile/(tabs)/profile/page.tsx, scripts/user-profile-summary.selfcheck.ts, docs/API_CONTRACTS.md, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-06-05
Summary:
- Added `pairedProfileState` to profile-summary with weekly check-in, pair weekly status, read-only activity state, contribution, and safe resource messaging.
- Made paired active `nextStep` prioritize weekly check-in, activity feedback, current activity, passport completion, and then opening the pair.
- Split `/profile` into solo and paired dashboards, removing the solo personal-activity placeholder from paired mode.
Files: src/domain/services/pairedUserProfileState.service.ts, src/domain/services/userProfileSummary.service.ts, src/app/api/users/me/profile-summary/route.ts, src/client/api/types.ts, src/client/viewmodels/profile.viewmodels.ts, src/components/profile/ModeAwareProfileOverview.tsx, src/app/(auth)/profile/page.tsx, scripts/user-profile-summary.selfcheck.ts, docs/API_CONTRACTS.md, docs/04-api-contracts.md, docs/CHANGELOG.md

Date: 2026-06-08
Summary:
- Added distinct compact, collection, dashboard, and main-menu layout modes with fluid spacing and ultrawide page shells.
- Reworked the main menu into a stable bento grid and moved pair/profile/diagnostics content into semantic full, wide, and narrow dashboard spans.
- Added fluid questionnaire/activity card grids, a wide activity workspace, and locally constrained reading widths for questionnaire runners.
Files: src/app/globals.css, src/app/main-menu/page.tsx, src/app/(auth)/profile/page.tsx, src/app/questionnaires/page.tsx, src/app/questionnaire/[id]/page.tsx, src/app/pair/[id]/questionnaire/[qid]/page.tsx, src/app/pair/[id]/diagnostics/page.tsx, src/components/QuestionCard.tsx, src/components/QuestionnaireCard.tsx, src/components/activities/ActivityCard.tsx, src/components/main-menu/CoupleActivityTile.tsx, src/components/main-menu/LootboxTile.tsx, src/components/main-menu/ProfileTile.tsx, src/components/main-menu/QuestionnaireTile.tsx, src/components/main-menu/SearchPairTileView.tsx, src/components/profile/ModeAwareProfileOverview.tsx, src/components/profile/SummaryTiles.tsx, src/components/ui/BackBar.tsx, src/features/activities/CoupleActivityView.tsx, src/features/pair/PairProfilePageClient.tsx, src/features/questionnaires/QuestionnairesPageView.tsx, docs/RESPONSIVE_LAYOUT.md, docs/CHANGELOG.md

Date: 2026-06-11
Summary:
- Standardized compact, collection, and dashboard width caps while preserving the main-menu bento and internal diagnostics layouts.
- Limited collection cards to stable readable columns on desktop and ultrawide screens.
- Unified search, lootboxes, and standalone loading or empty states with the shared responsive primitives.
Files: src/app/globals.css, src/app/lootboxes/page.tsx, src/app/pair/[id]/diagnostics/page.tsx, src/components/ui/LoadingView.tsx, src/features/match/feed/MatchFeedView.tsx, docs/RESPONSIVE_LAYOUT.md, docs/CHANGELOG.md

Date: 2026-08-07
Summary:
- Consolidated the supplied product concepts into canonical product, MVP, and target-domain documents with explicit source precedence.
- Narrowed the first release to the repeatable pair cycle and separated commercial launch gates, post-MVP opportunities, and long-term AI/Family OS ideas.
- Replaced the universal vector/compatibility concept with typed atomic dimensions, versioned rules, privacy-safe projections, and explicit insufficient-data behavior.
- Reclassified the dated product-loop and domain-model inventories as historical snapshots so stale evidence is not mistaken for current implementation.
Files: docs/PRODUCT_SPEC.md, docs/MVP_SPEC.md, docs/MVP_FLOWS.md, docs/TARGET_DOMAIN_MODEL.md, docs/TARGET_DOMAIN_OPERATIONS.md, docs/01-product-loop.md, docs/02-domain-model.md, docs/INDEX.md, docs/DOCS_STATUS.md, docs/CHANGELOG.md

Date: 2026-08-07
Summary:
- Stabilized activity vector provenance so source type, activity id, result revision, and scoring version are supplied as one snapshot payload.
- Strengthened vector selfchecks for current activity metadata and backward-compatible legacy snapshots without changing scoring semantics or storage schema.
Files: src/domain/services/vectorScoring.service.ts, src/utils/activities.ts, scripts/vector-scoring.selfcheck.ts, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-08-07
Summary:
- Replaced participant-facing weekly averages/divergence with a qualitative pair projection and explicit privacy-safe data status.
- Stopped pair/dashboard DTOs from exposing readiness or fatigue metrics and made weekly retries/concurrent duplicates return the immutable first submission.
- Added security assertions for one-sided, equal, divergent, insufficient, sensitive-content, membership, retry, and non-reconstruction paths.
Files: src/domain/services/weeklyCheckIn.service.ts, src/app/api/pairs/[id]/weekly-checkin/current/route.ts, src/app/api/pairs/me/route.ts, src/domain/services/pairDashboardSummary.service.ts, src/client/api/types.ts, src/components/checkins/PairWeeklyCheckInPanel.tsx, src/components/checkins/WeeklyCheckInCard.tsx, src/features/pair/PairProfilePageClient.tsx, scripts/weekly-checkin.selfcheck.ts, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-08-07
Summary:
- Removed numeric limits on the number of files an agent may edit for a coherent task.
- Kept operating-mode scope, context-reading limits, verification requirements, and risk-based stop conditions intact.
Files: AGENTS.md, docs/AGENT_OPERATING_MODES.md, docs/CONTEXT_BUDGET.md, docs/CODE_REVIEW.md, docs/CHANGELOG.md

Date: 2026-08-07
Summary:
- Implemented the integrated P0 pair loop: resumable private onboarding, invite-only pair formation, canonical weekly cycles/snapshots, one-replacement recommendations, activity feedback, light history, and an owner-private safety veto.
- Hardened participant DTOs and audit metadata so pair-facing flows expose only relative completion and qualitative non-reconstructable outputs; legacy pair creation/match confirmation and the reconstructable diagnostics endpoint are retired, while automatic/direct sensitive-template paths are blocked for P0.
- Added transaction/CAS/idempotency protections for invite acceptance, weekly submit/skip, recommendation decisions, and activity creation, plus self-healing recommendation-to-activity linkage and canonical adapters for every legacy suggestion endpoint.
- Added the P0 capability/evidence matrix and mandatory two-new-Discord-account pilot checklist; implementation is ready for pilot verification but is not marked release-complete before those environment gates pass.
Files: package.json, scripts/*selfcheck.ts, src/app/api/pair-invites/**, src/app/api/pairs/**, src/app/api/users/me/**, src/app/invite/page.tsx, src/app/join/page.tsx, src/app/main-menu/page.tsx, src/app/mvp-onboarding/page.tsx, src/client/**, src/components/**, src/domain/services/**, src/domain/state/**, src/features/**, src/lib/audit/**, src/lib/dto/**, src/models/**, docs/INDEX.md, docs/DOCS_STATUS.md, docs/API_CONTRACTS.md, docs/ARCHITECTURE.md, docs/SECURITY.md, docs/03-state-machines.md, docs/P0_CAPABILITY_MATRIX.md, docs/P0_TWO_USER_E2E.md, docs/CHANGELOG.md
Date: 2026-08-07
Summary:
- Added the active MVP release-status matrix after three independent functional, security/privacy, and reliability/scale audits.
- Recorded the clean baseline, confirmed P0/P1 gaps, privacy impact, evidence, and external decision/environment blockers without treating prior selfchecks as release proof.
Files: docs/MVP_RELEASE_STATUS.md, docs/INDEX.md, docs/CHANGELOG.md

Date: 2026-08-07
Summary:
- Completed the local MVP release candidate: synthetic two-user onboarding, invite race/retry, pair-scoped weekly summary, provenance-bound recommendation, full activity/feedback lifecycle, notifications, and privacy-safe history now pass on a MongoDB replica set.
- Added reversible owner export/deletion-request boundaries, pair-owned second-cycle entitlement, a signed deduplicated sandbox billing webhook, request-origin/media/body/cache protections, score redaction, minimal audit metadata, and rate limits on critical routes.
- Added recoverable idempotency leases and weekly finalization reconciliation, bounded history queries and additive indexes, environment validation, liveness/readiness, correlation IDs, provider-neutral operational events, safe preflight/migration scripts, and measured synthetic load evidence.
- Upgraded the existing Next.js and Mongoose dependencies to patched compatible versions, migrated ESLint/TypeScript/proxy conventions for Next 16, and regenerated the lockfile; the final production build and dependency audit are clean.
- Documented the exact external production gates: real Discord sessions, deploy/topology/backup/alerts, billing provider and commercial policy, retention/unlink/session-revocation decisions, and product/legal content review.
Files: package.json, package-lock.json, eslint.config.mjs, tsconfig.json, README.md, src/proxy.ts, src/instrumentation.ts, src/app/api/**, src/client/**, src/components/**, src/domain/**, src/features/**, src/lib/**, src/models/**, scripts/**, docs/API_CONTRACTS.md, docs/ARCHITECTURE.md, docs/SECURITY.md, docs/TESTING.md, docs/MVP_RELEASE_STATUS.md, docs/SCALE_READINESS.md, docs/RELEASE_RUNBOOK.md, docs/INDEX.md, docs/CHANGELOG.md

Date: 2026-08-07
Summary:
- Closed the final release races and privacy-ordering gaps: concurrent recommendation offers now converge on one canonical decision/activity, replacement successors recover after interruption, expired weekly reconciliation is bounded and poison-row tolerant, future-cycle entitlement cannot be bypassed, and non-members cannot probe paid state.
- Added monotonic sandbox billing delivery, intrinsic Like idempotency, fail-closed content publication, transition-guarded identifier-free product analytics, and regression coverage for stale/replayed/concurrent behavior.
- Disabled runtime auto-index mutation and made release preflight block the obsolete weekly user/week unique index; the reviewed migration gate must remove it before solo-plus-pair weekly writes are enabled, while fresh databases use the intended non-unique lookup.
- Re-ran the replica-set two-user path with run-scoped cleanup, the fixed-batch reconciliation suite, declared-index preflight/migration, and the 12-concurrency hot-pair load; no duplicate canonical artifacts or run-owned database documents remained.
- Recorded the local p95/query-plan evidence, the dashboard P2 tuning signal, and the production-only Discord, operations, billing, retention, and expert-content gates without claiming a production launch.
Files: src/app/api/pairs/[id]/recommendations/**, src/domain/services/recommendationDecision.service.ts, src/domain/services/recommendationWorkflow.service.ts, src/domain/services/weeklyCycle.service.ts, src/domain/services/billingWebhook.service.ts, src/lib/idempotency/**, src/models/**, scripts/**, docs/API_CONTRACTS.md, docs/MVP_RELEASE_STATUS.md, docs/SCALE_READINESS.md, docs/RELEASE_RUNBOOK.md, docs/TESTING.md, docs/CHANGELOG.md

Date: 2026-08-07
Summary:
- Replaced the hydration-blocking static CSP with a dynamic per-request nonce policy, preserved the Discord SDK HTTPS parent-origin allowlist, forced nonce-compatible rendering, and verified every production Next script plus the exact browser API rewrite.
- Removed the global unknown-IP rate-limit bucket, isolated authenticated policies by session user, guarded every recommendation compatibility adapter with membership/rate/idempotency/pair entitlement, and made recommendation quota claims atomic and retry/concurrency safe.
- Closed late reliability gaps: existing weekly submissions replay before entitlement checks, direct-template orphan offers recover by snapshot/template, current recommendation reads heal missing action notifications, and notification reads preserve their first timestamp.
- Made unexpected 500s generic, completed the 31-model index registry, blocked the incompatible legacy weekly unique index, and verified fresh plus explicitly migrated legacy databases at 47 invariants with zero final drift; a final exact-tree load repeat again produced zero errors/conflicts/duplicates and recorded dashboard p95 variability of 515.29/459.70 ms as P2 evidence.
- Clarified that the locally verified core-pair RC is not the full public release: unlink/reconnect and destructive retention/session-revocation behavior remain a product/legal decision followed by implementation, not a completed repository action.
Files: next.config.ts, src/proxy.ts, src/app/layout.tsx, src/app/api/activities/next/route.ts, src/app/api/pairs/[id]/**, src/app/api/notifications/[id]/read/route.ts, src/domain/errors.ts, src/domain/services/recommendationDecision.service.ts, src/domain/services/recommendationWorkflow.service.ts, src/domain/services/weeklyCheckIn.service.ts, src/domain/services/notification.service.ts, src/lib/abuse/rateLimit.ts, src/lib/auth/resourceGuards.ts, src/lib/entitlements/**, src/models/EntitlementQuotaUsage.ts, scripts/release-preflight.ts, scripts/migrate-weekly-checkins-pair-scope.ts, scripts/release-readiness.selfcheck.ts, scripts/security-critical.selfcheck.ts, scripts/reliability-reconciliation.selfcheck.ts, README.md, docs/API_CONTRACTS.md, docs/ARCHITECTURE.md, docs/SECURITY.md, docs/TESTING.md, docs/MVP_RELEASE_STATUS.md, docs/SCALE_READINESS.md, docs/RELEASE_RUNBOOK.md, docs/CHANGELOG.md

Date: 2026-08-10
Summary:
- Completed the post-fix local production-browser gate: hydration produced no console warnings/errors, retry and client-side back navigation were interactive, and `/` plus `/join` had no horizontal overflow at 390x844.
- Kept real Discord iframe/two-session and physical-mobile safe-area/keyboard checks external, synchronized the two-run dashboard/history latency evidence, normalized the release matrix to the required status enum with explicit privacy/security impact and next-step fields, and recorded sensitive-content/private-help approval as a separate full-release P1 gate.
Files: docs/MVP_RELEASE_STATUS.md, docs/RELEASE_RUNBOOK.md, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Cut questionnaire runtime over to the semantic `SEMANTIC_V1` content contract (`domainKey`/`topicKey`/`optionCount`/`contentRevision`) and removed the standalone question/vector-scoring flow.
- Added immutable, intrinsically idempotent owner-private questionnaire submissions with strict complete-answer validation; unbound content remains `UNMAPPED` and produces no Factor evidence or profile/passport mutation.
- Added bounded owner export and deletion coverage for personal questionnaire sources plus a Mongo integration for idempotency, pair completion, non-disclosure, export, and deletion.
Files: src/models/Questionnaire.ts, src/models/PersonalQuestionnaireSubmission.ts, src/domain/services/questionnaires.service.ts, src/domain/services/privacyExport.service.ts, src/domain/services/accountDeletion.service.ts, src/app/api/questionnaires/**, src/app/api/pairs/[id]/questionnaires/**, src/client/**, src/components/QuestionnaireCard.tsx, src/components/QuestionCard.tsx, scripts/seedBetaQuestionnaires.ts, scripts/beta-questionnaires.selfcheck.ts, scripts/questionnaire-new-only.integration.ts, package.json, docs/API_CONTRACTS.md, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Replaced the active six-axis/vector/diagnostics computation path with the published semantic Factor registry, typed unavailable states, immutable evidence, individual/pair/evaluation snapshots, all ten deterministic pair strategies, version/hash validation, replay, central disclosure and Factor-bound recommendation/action provenance.
- Cut onboarding, weekly Pair Summary, recommendation, PairEvent, activity feedback and owner profile to `NEW_ONLY`; removed vector/diagnostics models/services/routes/radar/passport UI and added guarded raw-source/PairEvent migrations that never infer atomic factors from aggregate legacy axes.
- Made the complete core loop free for every cycle, removed entitlement/paywall checks and purchase UI from core, and verified a no-entitlement pair through three weekly-summary/recommendation/activity/feedback/history cycles.
- Completed Pair end/new-context reconnect, durable logout/deletion session revocation, bounded Factor-aware export, destructive confirmed deletion, explicit source-bound PartnerSignal with TTL, private SafetyGate cleanup, settings and private help surfaces.
- Added focused selfchecks/integrations for Factor runtime/cutover, legacy absence, onboarding/questionnaires, PairEvent, Pair lifecycle, PartnerSignal, privacy/export/deletion and three-cycle behavior; fresh migration/preflight produced registry v3, 22 Factor plus 94 other declared indexes, no drift and 69 green blockers. Two strict load runs met dashboard/history/recommendation p95 targets with zero errors/conflicts/duplicates after post-auth per-Pair recommendation single-flight.
- Rewrote active product/domain/architecture/API/security/testing/release/scale/status documentation, added ADR-008, and marked pre-cutover vector/paywall inventories historical. Final exact-tree static/build/browser checks and independent reviews remain tracked in `docs/PUBLIC_FREE_MVP_EXECUTION.md`; production Discord/operations/content approval remains external.
Files: src/domain/model/**, src/domain/services/**, src/domain/state/**, src/models/**, src/app/api/**, src/app/**, src/client/**, src/components/**, src/features/**, src/lib/**, scripts/**, package.json, README.md, docs/ADR/ADR-008-factor-new-only-free-core.md, docs/ARCHITECTURE.md, docs/TARGET_DOMAIN_MODEL.md, docs/TARGET_DOMAIN_OPERATIONS.md, docs/API_CONTRACTS.md, docs/SECURITY.md, docs/TESTING.md, docs/PRODUCT_SPEC.md, docs/MVP_SPEC.md, docs/MVP_FLOWS.md, docs/P0_CAPABILITY_MATRIX.md, docs/P0_TWO_USER_E2E.md, docs/MVP_RELEASE_STATUS.md, docs/SCALE_READINESS.md, docs/RELEASE_RUNBOOK.md, docs/PUBLIC_FREE_MVP_EXECUTION.md, docs/INDEX.md, docs/DOCS_STATUS.md, docs/PROJECT_MAP.md, docs/03-state-machines.md, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Finalized the public-free help boundary with the versioned `help-ru-v1` catalog, documented complete removal of public legacy `/api/match/**` routes, and recorded passing participant-disclosure and guarded replica-set reliability/reconciliation evidence.
- Recorded lint/typecheck and a full selfcheck-chain pass after synchronizing stale assertions; kept reviewer-driven reruns, remaining exact-tree gates, supported-host browser/mobile validation and expert/legal jurisdiction-content approval open.
Files: src/client/content/helpCatalog.ts, src/app/profile/help/page.tsx, scripts/frontend-mvp-ui.selfcheck.ts, scripts/participant-disclosure.selfcheck.ts, docs/API_CONTRACTS.md, docs/03-state-machines.md, docs/PRODUCT_SPEC.md, docs/TESTING.md, docs/P0_CAPABILITY_MATRIX.md, docs/MVP_RELEASE_STATUS.md, docs/PUBLIC_FREE_MVP_EXECUTION.md, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Made rejected Factor evidence a strict provenance-only record: it carries the submitted value and rejection code but never a normalized value, while accepted evidence still requires one.
- Preserved append-only idempotency by validating the complete immutable document before the atomic insert-only upsert, and added runtime integration coverage for replay, changed-content conflict, document validation and zero snapshot influence.
Files: src/domain/model/evidence/evidence.ts, src/models/EvidenceEvent.ts, src/domain/services/factorEnginePersistence.service.ts, src/domain/services/factorEngineRuntime.service.ts, src/domain/services/activityFactorRuntime.service.ts, src/domain/services/privacyExport.service.ts, scripts/factor-engine-runtime.integration.ts, scripts/onboarding-factor-engine.integration.ts, docs/TARGET_DOMAIN_MODEL.md, docs/TARGET_DOMAIN_OPERATIONS.md, docs/SECURITY.md, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Versioned every pair-strategy definition and made its symmetric/directional contract part of registry validation and canonical hashing; pair evaluation now requires an exact relationship-context match and the registry rejects strategy confidence below the factor-level floor.
- Split HARD_CONSTRAINT outcomes by lifecycle context: only DATING produces a matching conflict, while every other relationship context produces a discussion-required result, with persisted status and deterministic regression coverage.
Files: src/domain/model/pair/**, src/domain/model/definitions/**, src/domain/model/recommendations/recommendation.ts, src/domain/services/weeklyCycle.service.ts, src/models/factorEngineSchemas.ts, scripts/pair-strategy-contract.selfcheck.ts, scripts/weekly-cycle.selfcheck.ts, package.json, docs/CHANGELOG.md

Date: 2026-08-11
Summary:
- Made pair-questionnaire start and answer writes transactionally fence the active Pair lifecycle, so pause/end wins cleanly and no questionnaire source write can commit after Pair termination.
- Added one canonical `in_progress` session per pair/questionnaire, immutable unique member answers, terminal `closed` sessions on Pair end, and conflict-safe convergence for concurrent requests using different idempotency keys.
- Added a fail-closed duplicate preflight/additive-index migration plus database-free and deterministic replica-set coverage; legacy duplicates are reported and never silently selected, deleted or rewritten.
Files: src/models/PairQuestionnaireSession.ts, src/models/PairQuestionnaireAnswer.ts, src/domain/services/questionnaires.service.ts, src/domain/services/pairs.service.ts, scripts/lib/pair-questionnaire-integrity.ts, scripts/migrate-pair-questionnaire-integrity.ts, scripts/pair-questionnaire-integrity.selfcheck.ts, scripts/pair-questionnaire-concurrency.integration.ts, package.json, docs/API_CONTRACTS.md, docs/TESTING.md, docs/RELEASE_RUNBOOK.md, docs/MVP_RELEASE_STATUS.md, docs/CHANGELOG.md

Date: 2026-08-13
Summary:
- Removed Pair/session/questionnaire duplicate samples from the Pair questionnaire release preflight; it now emits only aggregate group counts, migration version and canonical index names.
- Replaced raw report/error output across all seven target preflight/migration entrypoints with a shared `counts`/allowlisted `reasonCounts`/`indexNames` contract; import-time PairEvent validation is now inside the sanitized command boundary.
- Added regression and runtime probes proving missing env, invalid arguments and synthetic connection errors cannot disclose URI/database names, duplicate-key values, stack frames or local paths.
- Prepared a clearly non-approved external review packet containing the exact `help-ru-v1` copy, implemented retention/deletion inventory, reviewer decision templates and the precise jurisdiction/reviewer/operations blockers.
- Kept real Discord, authenticated/physical mobile, production target/restore, external content/legal approval and deployment authorization gates open; no production write or deploy was performed.
- Re-ran current-working-tree lint, TypeScript, the full selfcheck chain, agent checks, diff validation and production dependency audit after the security fix, then built and smoked a byte-matched isolated production snapshot; all locally available checks passed and the audit reported zero vulnerabilities. The deliberate unavailable-test-DB readiness result was `503`, so target readiness and an immutable deploy artifact remain open.
Files: scripts/lib/release-command-output.ts, scripts/lib/pair-questionnaire-integrity.ts, scripts/migrate-factor-engine.ts, scripts/migrate-pair-context-index.ts, scripts/migrate-pair-events-new-only.ts, scripts/migrate-pair-questionnaire-integrity.ts, scripts/migrate-partner-signals.ts, scripts/migrate-privacy-requests-v2.ts, scripts/migrate-weekly-checkins-pair-scope.ts, scripts/pair-questionnaire-integrity.selfcheck.ts, scripts/pair-questionnaire-concurrency.integration.ts, scripts/release-preflight.ts, scripts/release-readiness.selfcheck.ts, docs/SAFETY_RETENTION_EXTERNAL_REVIEW.md, docs/INDEX.md, docs/PUBLIC_FREE_MVP_EXECUTION.md, docs/MVP_RELEASE_STATUS.md, docs/RELEASE_RUNBOOK.md, docs/CHANGELOG.md

Date: 2026-08-13
Summary:
- Promoted Factor Matching to the documented free core: standalone `MatchingProfile`, separate Factor-use grants and partner preferences, bounded discovery/feed/presentation grants, qualitative candidate fit, Like/connection/block lifecycle and two-party-confirmed Pair formation.
- Documented that the authenticated session remains the actor, candidate grants are scoped presentation capabilities, numeric fit/raw Factor/preference/evidence data stays internal, and one participant cannot create a Pair alone.
- Added exact matching code/database/release command coverage and the guarded `DRY_RUN`/`APPLY_ADDITIVE`/`VERIFY` migration procedure, including production `autoIndex=false` preflight and dual-readable `legacyStatus` rollback constraints.
- Kept release claims conservative: after local verification `CODE_COMPLETE=NO` because transaction-capable DB integrations remain unrun, `ATLAS_VALIDATED=NOT RUN` without `MATCHING_TEST_MONGODB_URI`, `DISCORD_VALIDATED=NOT RUN` without two real accounts and `PUBLIC_READY=NO`.
Files: README.md, docs/PRODUCT_SPEC.md, docs/MVP_SPEC.md, docs/MVP_FLOWS.md, docs/ARCHITECTURE.md, docs/TARGET_DOMAIN_MODEL.md, docs/TARGET_DOMAIN_OPERATIONS.md, docs/API_CONTRACTS.md, docs/SECURITY.md, docs/TESTING.md, docs/MVP_RELEASE_STATUS.md, docs/SCALE_READINESS.md, docs/RELEASE_RUNBOOK.md, docs/PROJECT_MAP.md, docs/INDEX.md, docs/CHANGELOG.md

Date: 2026-08-13
Summary:
- Closed the final matching concurrency/privacy review findings: fenced feed/card disclosure, bidirectional grant revocation on block, serialized Mongo session operations, survivor-owned Pair history preservation, and owner-complete/non-leaking matching export.
- Made matching social audit and notifications transactionally idempotent, hardened migration verification for legacy payloads/orphans/unknown states, and required real Atlas topology evidence before `atlasValidated:true`.
- Replaced the generic load wrapper with a dedicated 10,000-projection Factor Matching smoke covering discovery explain, bounded batching, pagination, disclosure, latency budgets and cleanup.
- Passed code verification, the full selfcheck chain, lint, production build, agent checks and dependency audit; Atlas/Discord release evidence remains `NOT RUN`, so `PUBLIC_READY=NO`.
Files: src/domain/services/matching/**, src/domain/state/matching/**, src/domain/services/accountDeletion.service.ts, src/domain/services/privacyExport.service.ts, src/domain/services/pairFormation.service.ts, src/lib/audit/**, src/models/EventLog.ts, scripts/matching-*.ts, scripts/migrate-matching.ts, scripts/verify-matching-release.ts, scripts/agent-checks.ts, package.json, docs/ARCHITECTURE.md, docs/SECURITY.md, docs/RELEASE_RUNBOOK.md, docs/CHANGELOG.md

Date: 2026-09-05
Summary:
- Completed a documentation-only first audit against the separately extracted vmeste-codex-context-v0.1 target package at revision 70ad6017109ba2d223fc1fd9bb1e5b735613806d; preserved the pre-existing pilot handoff and documentation changes.
- Verified source hashes and the 76 requirements / 45 proposed acceptance scenarios / 25 decisions / 173 source-section index; mapped target concepts to actual code, consumers, evidence and release limits.
- Recorded the existing NEW_ONLY Factor/Matching and Pair flows, remaining first-entry/connection/event/economy gaps, stale documentation and the statically identified failed-deletion recovery path; recommended one bounded recovery task without implementing it.
- Passed lint, nonincremental TypeScript and 11 reviewed database-free selfchecks; no application, dependency, lockfile, configuration, database, migration, production or deployment changes. Live Discord/DB/E2E/release checks remain unrun for this audit.
Files: docs/audits/2026-09-05-baseline.md, docs/audits/2026-09-05-analytics-matching.md, docs/audits/2026-09-05-auth-privacy.md, docs/audits/2026-09-05-pair-content-economy.md, docs/INDEX.md, docs/CHANGELOG.md

Date: 2026-09-05
Summary:
- Recorded the owner's explicit priority correction: account-deletion work is deferred; preserve G07 as an audit finding rather than the next implementation task.
- Saved the already-sent 27-question product packet with stable numbering, proposed options and an empty answer template. All answers remain pending; no proposed product, API, schema, privacy or economic policy was accepted automatically.
- Linked the pending decision packet from the index and updated all four audit recommendation sections. No application, dependency, configuration or data changes; selected modules will remain in the full agreed scope after the owner responds.
Files: docs/PRODUCT_DECISIONS_PENDING.md, docs/audits/2026-09-05-baseline.md, docs/audits/2026-09-05-analytics-matching.md, docs/audits/2026-09-05-auth-privacy.md, docs/audits/2026-09-05-pair-content-economy.md, docs/INDEX.md, docs/CHANGELOG.md

Date: 2026-09-05
Summary:
- Implemented the owner's accepted 27-answer product scope after the audit: solo/existing-partner entry, stable internal pairing code with reciprocal confirmation, first-onboarding coin, structured matching reactions and independent conversation rounds with a three-connection limit.
- Added six development areas and a demo library (8 reflections, 19 solo practices, 18 joint practices, 30 conversation topics, 30 leisure ideas, 3 programs), private immutable completion records, weekly runs and partial/final joint completion. Demo self-reflection does not alter Factor evidence or claim clinically validated progress.
- Added versioned shared-life records for calendar/tasks/shopping/goals/manual budget/memories; aligned PairEvents to the actual relationship date and holiday settings. Added personal earned wallets, immutable reward/purchase ledger, inventory, transparent earned capsules and separate Pair collections; real household money remains separate.
- Updated strict HTTP/DTO contracts, exports, cleanup inventory and additive-index preflight. Independent reviews corrected cache-replay access, canonical Pair identity, private data retained in mutation caches, stale UI and concurrent event settings. No new production dependencies, lockfile or environment contract changes; no allowlist additions, Atlas reset or deployment.
- Verified lint, nonincremental TypeScript, production build, database-free selfchecks and eight bounded local MongoDB replica-set integration suites, including races, rollback, exactly-once rewards, reciprocal pairing and private disclosure. Target Discord iframe/Atlas checks remain separate; final evidence, implementation boundaries and owner smoke steps are in docs/PRODUCT_IMPLEMENTATION.md.
Files: README.md, docs/PRODUCT_DECISIONS.md, docs/PRODUCT_DECISIONS_PENDING.md, docs/PRODUCT_IMPLEMENTATION.md, docs/ENTRY_AND_PAIRING_UPDATE.md, docs/MATCHING_PRODUCT_UPDATE.md, docs/PRODUCT_WORKSPACE_UPDATE.md, docs/ECONOMY_UPDATE.md, docs/PAIR_EVENT_SETTINGS_UPDATE.md, docs/INDEX.md, docs/PRODUCT_SPEC.md, docs/MVP_SPEC.md, docs/ARCHITECTURE.md, docs/API_CONTRACTS.md, docs/SECURITY.md, docs/TESTING.md, docs/RELEASE_RUNBOOK.md, docs/CHANGELOG.md, package.json, next.config.ts, scripts/entry-*, scripts/matching-*, scripts/economy.*, scripts/product-workspace.*, scripts/pair-event-settings.integration.ts, scripts/selfcheck-pair-events.ts, scripts/pair-invite.selfcheck.ts, scripts/pair-lifecycle-remaining.integration.ts, scripts/two-user-mvp.integration.ts, scripts/release-preflight.ts, src/app/** (entry, onboarding, matching, development, shared-life, store and related API routes), src/client/**, src/components/matching/**, src/features/**, src/domain/model/**, src/domain/services/**, src/domain/state/matching/**, src/lib/api/domainResponse.ts, src/lib/contracts/**, src/lib/dto/**, src/models/**

Date: 2026-09-05
Summary:
- Completed visual/browser smoke of entry, development, store and shared life on synthetic local accounts. Verified entry-to-onboarding navigation, practice completion, wallet 1→4→1 through reward/purchase, and shared-task load 0→20→0 minutes.
- Fixed the cancelled-request race found in that smoke: preserve AbortError in HTTP, ignore stale hook errors/loading, and retry both Pair context and shared workspace. The regression fails on the original code and passes on the fix.
- Final production build, full lint, nonincremental types, all 46 selfchecks and changed-file agent checks passed. Temporary UI server and MongoDB listener are stopped; UI fixture database and temporary authentication wrapper removed. No real Discord/Atlas/deployment claim.
- Marked the pre-implementation pilot handoff and release snapshot as historical, corrected goal-stage responsibility documentation, and linked the current owner handoff and verification matrix. Existing user-authored documentation was preserved.
Files: src/client/api/http.ts, src/client/hooks/useApi.ts, src/features/sharedLife/SharedLifePage.tsx, src/app/globals.css, scripts/client-request-race.selfcheck.ts, package.json, docs/TESTING.md, docs/PRODUCT_IMPLEMENTATION.md, docs/PRODUCT_WORKSPACE_UPDATE.md, docs/PRODUCT_DECISIONS.md, docs/CURRENT_PILOT_HANDOFF.md, docs/MVP_RELEASE_STATUS.md, docs/DOCS_STATUS.md, docs/INDEX.md, docs/CHANGELOG.md

Date: 2026-09-05
Summary:
- Added continuation links on existing home/personal/Pair screens, explicit SOLO development/search choices, resumable development runs/programs, clear Connection and joint-feedback states, and bounded refresh on return with manual retry. Private drafts remain in memory; access failures hide stale protected data.
- Archived the original development publication and pinned run reads/completions to exact immutable questions and response options. New runs select latest; missing versions fail explicitly after access checks. Completed results/timestamps and reward identities remain unchanged on replay.
- Preserved the revision of an open shared-life draft and added explicit comparison/retry after a concurrent partner edit. Independent review fixed late client-response races and stale feedback forms after access denial.
- Added a guarded six-suite two-user acceptance runner and expanded existing entry/matching/invite/workspace integrations. All six suites and the two separate strict economy/event suites passed on newly created local test instances. Both temporary MongoDB servers were stopped; no user database, production endpoint, auth bypass, migration, dependency, lockfile, push or deploy changes.
- Updated current contracts, implementation evidence and the Discord checklist; deferred retrospective consent-policy editing with the required owner decisions. Corrected three architecture-checker false positives for the existing economy session wrapper; no allowlist entries added. Final code-check evidence is recorded in PRODUCT_IMPLEMENTATION.md.
- Passed all 47 selfchecks (including continuation-ui), full lint, nonincremental TypeScript, final production build and full/changed agent checks. Browser runtime smoke remained unavailable because the existing runtime guard rejects missing Discord/DB/session environment; the attempted HTTP server was stopped and all task-owned ports verified closed.
Files: src/app/{main-menu,mvp-onboarding,invite,couple-activity}/page.tsx, src/client/hooks/{useDevelopment,useSharedLife,useMatchingConnection,useInbox,useRefreshOnReturn}.ts, src/client/viewmodels/{development.viewmodels.ts,matching/index.ts}, src/components/{profile/today,checkins,matching}, src/features/{development,sharedLife,matching,pair,activities}, src/domain/model/development/**, src/domain/services/development.service.ts, scripts/{agent-checks.ts,product-workspace.selfcheck.ts,product-workspace.integration.ts,matching-social-flow.integration.ts,two-user-mvp.integration.ts,two-user-acceptance.integration.ts}, package.json, docs/{API_CONTRACTS,ARCHITECTURE,ENTRY_AND_PAIRING_UPDATE,INDEX,PRODUCT_IMPLEMENTATION,PRODUCT_WORKSPACE_UPDATE,TESTING,TWO_USER_ACCEPTANCE,CHANGELOG}.md
