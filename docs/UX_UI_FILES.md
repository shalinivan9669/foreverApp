# Состав UX/UI-поставки — 2026-09-07

Список отражает изменения текущей задачи. Пользовательские правки PRODUCT_IMPLEMENTATION.md, RELEASE_RUNBOOK.md и TWO_USER_ACCEPTANCE.md были до начала работы и сохранены. Исходный план UX_UI_IMPLEMENTATION_PLAN.md также предоставлен пользователем; добавлен только статус выполнения.

| Файл | Назначение |
| --- | --- |
| [docs/CHANGELOG.md](../docs/CHANGELOG.md) | Поведение, решения владельца и доказательства проверки |
| [docs/INDEX.md](../docs/INDEX.md) | Поведение, решения владельца и доказательства проверки |
| [docs/LOCAL_ACCEPTANCE.md](../docs/LOCAL_ACCEPTANCE.md) | Поведение, решения владельца и доказательства проверки |
| [docs/TESTING.md](../docs/TESTING.md) | Поведение, решения владельца и доказательства проверки |
| [docs/UX_UI_ACCEPTANCE.md](../docs/UX_UI_ACCEPTANCE.md) | Поведение, решения владельца и доказательства проверки |
| [docs/UX_UI_FORMS.md](../docs/UX_UI_FORMS.md) | Поведение, решения владельца и доказательства проверки |
| [docs/UX_UI_FOUNDATION.md](../docs/UX_UI_FOUNDATION.md) | Поведение, решения владельца и доказательства проверки |
| [docs/UX_UI_IMPLEMENTATION_PLAN.md](../docs/UX_UI_IMPLEMENTATION_PLAN.md) | Поведение, решения владельца и доказательства проверки |
| [docs/UX_UI_WORKSPACE.md](../docs/UX_UI_WORKSPACE.md) | Поведение, решения владельца и доказательства проверки |
| [package.json](../package.json) | Регистрация проверок; зависимости не изменены |
| [scripts/continuation-ui.selfcheck.ts](../scripts/continuation-ui.selfcheck.ts) | Регрессии интерфейса, гонок и доступности |
| [scripts/dialog.selfcheck.ts](../scripts/dialog.selfcheck.ts) | Регрессии интерфейса, гонок и доступности |
| [scripts/frontend-mvp-ui.selfcheck.ts](../scripts/frontend-mvp-ui.selfcheck.ts) | Регрессии интерфейса, гонок и доступности |
| [scripts/lib/local-acceptance-fixtures.ts](../scripts/lib/local-acceptance-fixtures.ts) | Изолированные синтетические сценарии приёмки |
| [scripts/lib/local-acceptance-matching.ts](../scripts/lib/local-acceptance-matching.ts) | Изолированные синтетические сценарии приёмки |
| [scripts/lib/local-acceptance-options.ts](../scripts/lib/local-acceptance-options.ts) | Изолированные синтетические сценарии приёмки |
| [scripts/local-acceptance-server.ts](../scripts/local-acceptance-server.ts) | Изолированные синтетические сценарии приёмки |
| [scripts/local-acceptance.selfcheck.ts](../scripts/local-acceptance.selfcheck.ts) | Изолированные синтетические сценарии приёмки |
| [scripts/local-acceptance.ts](../scripts/local-acceptance.ts) | Изолированные синтетические сценарии приёмки |
| [scripts/matching-request-race.selfcheck.ts](../scripts/matching-request-race.selfcheck.ts) | Регрессии интерфейса, гонок и доступности |
| [scripts/matching-ui.selfcheck.ts](../scripts/matching-ui.selfcheck.ts) | Регрессии интерфейса, гонок и доступности |
| [scripts/today-request-race.selfcheck.ts](../scripts/today-request-race.selfcheck.ts) | Регрессии интерфейса, гонок и доступности |
| [scripts/today-ui.selfcheck.ts](../scripts/today-ui.selfcheck.ts) | Регрессии интерфейса, гонок и доступности |
| [scripts/ui-contrast.selfcheck.ts](../scripts/ui-contrast.selfcheck.ts) | Регрессии интерфейса, гонок и доступности |
| [scripts/unsaved-changes.selfcheck.ts](../scripts/unsaved-changes.selfcheck.ts) | Регрессии интерфейса, гонок и доступности |
| [scripts/workspace-ui.selfcheck.ts](../scripts/workspace-ui.selfcheck.ts) | Регрессии интерфейса, гонок и доступности |
| [src/app/globals.css](../src/app/globals.css) | Контраст, общие состояния и доступный диалог |
| [src/app/invite/page.tsx](../src/app/invite/page.tsx) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/app/join/page.tsx](../src/app/join/page.tsx) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/app/main-menu/page.tsx](../src/app/main-menu/page.tsx) | Следующий шаг, продолжения и сохранённое меню |
| [src/app/mvp-onboarding/page.tsx](../src/app/mvp-onboarding/page.tsx) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/client/api/match.api.ts](../src/client/api/match.api.ts) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/client/api/matchingConversation.api.ts](../src/client/api/matchingConversation.api.ts) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/client/hooks/useMatchFeed.ts](../src/client/hooks/useMatchFeed.ts) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/client/hooks/useMatchingConnection.ts](../src/client/hooks/useMatchingConnection.ts) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/client/hooks/useMatchLike.ts](../src/client/hooks/useMatchLike.ts) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/client/hooks/useSharedLife.ts](../src/client/hooks/useSharedLife.ts) | Библиотека, общая жизнь и сравнение конфликтов |
| [src/client/hooks/useTodayDashboard.ts](../src/client/hooks/useTodayDashboard.ts) | Следующий шаг, продолжения и сохранённое меню |
| [src/client/hooks/useUnsavedChanges.ts](../src/client/hooks/useUnsavedChanges.ts) | Защита несохранённых черновиков |
| [src/client/viewmodels/development.viewmodels.ts](../src/client/viewmodels/development.viewmodels.ts) | Библиотека, общая жизнь и сравнение конфликтов |
| [src/client/viewmodels/matchingComposer.ts](../src/client/viewmodels/matchingComposer.ts) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/client/viewmodels/sharedLife.viewmodels.ts](../src/client/viewmodels/sharedLife.viewmodels.ts) | Библиотека, общая жизнь и сравнение конфликтов |
| [src/client/viewmodels/today.viewmodels.ts](../src/client/viewmodels/today.viewmodels.ts) | Следующий шаг, продолжения и сохранённое меню |
| [src/components/activities/CheckInModal.tsx](../src/components/activities/CheckInModal.tsx) | Миграция формы на общий Dialog |
| [src/components/matching/LikeComposer.tsx](../src/components/matching/LikeComposer.tsx) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/components/profile/today/ContinuationPanel.tsx](../src/components/profile/today/ContinuationPanel.tsx) | Следующий шаг, продолжения и сохранённое меню |
| [src/components/ui/BackBar.tsx](../src/components/ui/BackBar.tsx) | Контраст, общие состояния и доступный диалог |
| [src/components/ui/Dialog.tsx](../src/components/ui/Dialog.tsx) | Контраст, общие состояния и доступный диалог |
| [src/components/ui/EmptyStateView.tsx](../src/components/ui/EmptyStateView.tsx) | Контраст, общие состояния и доступный диалог |
| [src/components/ui/LoadingView.tsx](../src/components/ui/LoadingView.tsx) | Контраст, общие состояния и доступный диалог |
| [src/components/ui/Spinner.tsx](../src/components/ui/Spinner.tsx) | Контраст, общие состояния и доступный диалог |
| [src/features/development/DevelopmentCatalog.tsx](../src/features/development/DevelopmentCatalog.tsx) | Библиотека, общая жизнь и сравнение конфликтов |
| [src/features/development/DevelopmentPage.tsx](../src/features/development/DevelopmentPage.tsx) | Библиотека, общая жизнь и сравнение конфликтов |
| [src/features/matching/MatchingConnectionPage.tsx](../src/features/matching/MatchingConnectionPage.tsx) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/features/matching/MatchingFeedPage.tsx](../src/features/matching/MatchingFeedPage.tsx) | Пошаговые формы и надёжность приглашений/знакомств |
| [src/features/pair/PairProfilePageClient.tsx](../src/features/pair/PairProfilePageClient.tsx) | Следующий шаг, продолжения и сохранённое меню |
| [src/features/sharedLife/SharedLifeEntryForm.tsx](../src/features/sharedLife/SharedLifeEntryForm.tsx) | Библиотека, общая жизнь и сравнение конфликтов |
| [src/features/sharedLife/SharedLifeEntrySnapshot.tsx](../src/features/sharedLife/SharedLifeEntrySnapshot.tsx) | Библиотека, общая жизнь и сравнение конфликтов |
| [src/features/sharedLife/SharedLifePage.tsx](../src/features/sharedLife/SharedLifePage.tsx) | Библиотека, общая жизнь и сравнение конфликтов |
| [src/features/sharedLife/SharedLifeSettingsForm.tsx](../src/features/sharedLife/SharedLifeSettingsForm.tsx) | Библиотека, общая жизнь и сравнение конфликтов |

Снимки и измерения находятся в [отчёте приёмки](UX_UI_ACCEPTANCE.md) и каталоге `docs/evidence/ux-ui-2026-09-07/`.
