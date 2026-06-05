# Changelog (Docs & Project Notes)

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
- Fixed mojibake (broken Cyrillic encoding like `РџС...`) in profile and main-menu UI labels so Russian text renders correctly.
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
