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
