# PROB-001: Client `userId` Is Trusted By API

## Problem
Большая часть `/api/*` принимает `userId` из query/body и доверяет ему как идентификатору субъекта.

## Evidence
- Клиент хранит пользователя в `useUserStore` и передает `user.id` в API: `src/store/useUserStore.ts`, `src/utils/api.ts`, `src/app/search/page.tsx`, `src/app/pair/page.tsx`, `src/app/questionnaire/[id]/page.tsx`.
- `/.proxy` используется как транспортный префикс, но не решает аутентификацию: `src/utils/api.ts`, `src/app/page.tsx`.
- Эндпоинты с `userId` в query/body:
  - `src/app/api/match/feed/route.ts`
  - `src/app/api/match/inbox/route.ts`
  - `src/app/api/match/card/route.ts`
  - `src/app/api/pairs/me/route.ts`
  - `src/app/api/pairs/status/route.ts`
  - `src/app/api/users/me/profile-summary/route.ts`
  - `src/app/api/questionnaires/[id]/route.ts`
  - `src/app/api/answers/bulk/route.ts`
- В проекте уже есть сессионный cookie/JWT, но покрытие частичное: `src/app/api/exchange-code/route.ts`, `src/lib/jwt.ts`, `src/app/api/questionnaires/cards/route.ts`.

## Impact
- Риск подмены субъекта и несанкционированного чтения/мутаций.
- Непредсказуемые баги при рассинхроне `useUserStore` и серверной сессии.
- Усложнение перехода к строгой авторизации на уровне `Pair`/`PairActivity`/`QuestionnaireSession`.

## Target state
- Субъект запроса определяется только по server-side session (`cookie -> JWT -> userId`).
- `userId` исключен из публичных self-scoped контрактов.
- Клиент вызывает `/api/*` без передачи `userId` там, где субъект = текущая сессия.

## Plan
- Итерация 1:
  - Вынести `getSessionUserId` в `src/lib/auth/session.ts`.
  - Добавить `requireSession(req)` в `src/lib/auth/requireSession.ts`.
  - Перевести P0 маршруты: `match/feed`, `match/inbox`, `pairs/me`, `users/me/profile-summary`.
- Итерация 2:
  - Перевести оставшиеся маршруты с `userId` в body/query на сессию.
  - Обновить клиентские вызовы в `src/app/*` и убрать передачу `userId`.
- Итерация 3:
  - Оставить `userId` только в явных admin/service контрактах.
  - Зафиксировать контракт в `docs/04-api-contracts.md` и `docs/07-security-privacy.md`.

## Acceptance criteria
- Нет self-scoped эндпоинтов с обязательным `userId` в query/body.
- Все такие эндпоинты возвращают `401` без валидной сессии.
- В коде нет новых вызовов `fetch(api(...userId=...))` для self-scoped API.

## Links
- `docs/01-product-loop.md`
- `docs/04-api-contracts.md`
- `docs/07-security-privacy.md`
- `docs/ADR/ADR-006-channels-as-adapters.md`

## Status
- Owner: TBD
- Priority: P0
- ETA:
- Date created: 2026-02-07

## Done / Outcome
- 2026-02-07 (Iteration 2 / self-scoped contract hardening):
  - Self-scoped private endpoints переведены на session subject (`requireSession(...).data.userId`) без доверия к `userId` из query/body: `match/feed`, `match/inbox`, `match/card` (GET/POST), `match/like`, `match/respond`, `match/accept`, `match/reject`, `match/confirm`, `pairs/me`, `pairs/status`, `activities/next`, `answers/bulk`, `questionnaires/[id] POST`, `users/me/profile-summary`, `logs`, `users POST`, `pairs/create`.
  - Клиентские вызовы очищены от передачи `?userId=` и `userId` в body для self-scoped API (`src/app/search/page.tsx`, `src/app/match/inbox/page.tsx`, `src/app/match/like/[id]/page.tsx`, `src/app/match-card/create/page.tsx`, `src/app/questionnaire/page.tsx`, `src/app/questionnaire/[id]/page.tsx`, `src/app/pair/page.tsx`, `src/app/couple-activity/page.tsx`, `src/app/(auth)/profile/page.tsx`, `src/app/profile/(tabs)/matching/page.tsx`, `src/components/LikeModal.tsx`, `src/components/main-menu/SearchPairTile.tsx`).
  - Для self user-profile flow добавлены `/api/users/me` и `/api/users/me/onboarding`; клиент переведен на `/api/users/me*` вместо `/api/users/[id]` для собственных данных (`src/app/page.tsx`, `src/components/OnboardingWizard.tsx`).
  - Выбран подход backward compatibility: legacy `userId`/`fromId` поля в body игнорируются и не используются как основание доступа.
  - Acceptance criteria:
    - Нет self-scoped эндпоинтов с обязательным `userId` в query/body: `PASS`.
    - Self-scoped эндпоинты требуют валидную session и отдают `401` без нее: `PASS` (через `requireSession`).
    - В коде нет новых self-scoped вызовов `fetch(api(...userId=...))`: `PASS`.
