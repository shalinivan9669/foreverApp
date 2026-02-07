# PROB-008: God Components And UI/API Coupling

## Problem
Крупные client components одновременно рендерят UI, хранят сложное состояние и выполняют API orchestration.

## Evidence
- Крупные страницы:
  - `src/app/match/inbox/page.tsx` (~466 строк)
  - `src/components/OnboardingWizard.tsx` (~369 строк)
  - `src/app/couple-activity/page.tsx` (~242 строки)
- Внутри этих файлов смешаны:
  - запросы к `/api/*` через `fetch` + `/.proxy`
  - маппинг API ошибок
  - ветвления доменного поведения (`match` статус, `PairActivity` actions)
  - UI-рендер.
- `useUserStore` используется как транспорт субъекта для API во множестве page.tsx.

## Impact
- Низкая переиспользуемость UI.
- Сложно тестировать UI отдельно от API и бизнес-сценариев.
- Высокий риск “случайно сломать сценарий” при визуальных правках.

## Target state
- Разделение на:
  - container/hooks (`useInbox`, `usePairActivities`, `useOnboardingFlow`)
  - presentational components.
- API вызовы и мутации вынесены в `src/features/*/api.ts`.
- `useUserStore` не используется как источник доверенного `userId` для защищенных API.

## Plan
- Итерация 1:
  - Вынести API/side-effects из `match/inbox/page.tsx` в `src/features/match/inbox/*`.
- Итерация 2:
  - Вынести flow из `couple-activity/page.tsx` в `src/features/activities/*`.
  - Вынести onboarding state machine в `src/features/onboarding/*`.
- Итерация 3:
  - Добавить component tests для presentational частей: `TODO(path): tests/ui/*`.

## Acceptance criteria
- В page-компонентах нет прямых многошаговых orchestration мутаций.
- Каждый большой экран разделен на container + presentational.
- Размер ключевых страниц снижен, и их логика покрыта отдельными hooks-тестами.

## Links
- `docs/01-product-loop.md`
- `docs/04-api-contracts.md`
- `docs/ui/questionnaire-cards.md`

## Status
- Owner: TBD
- Priority: P2
- ETA:
- Date created: 2026-02-07

## Done / Outcome

