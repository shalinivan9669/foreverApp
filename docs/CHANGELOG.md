# Changelog (Docs & Project Notes)

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
