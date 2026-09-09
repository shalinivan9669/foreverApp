# Приёмка механики характеристик — 2026-09-09

Классификация: FEATURE_CHANGE, высокий риск из-за сохранения личных ответов, повторов и нескольких потребителей. Изменения additive; реальная база и деплой не затрагивались. Авторские анкеты самоотчёта, без утверждений о клинической валидности. [Формулы и матрица](FACTOR_MEASUREMENT_CONTRACT.md), [API](API_CONTRACTS.md).

## Автоматическая приёмка

Изолированный MongoDB replica set создаётся harness в собственном временном каталоге; каждый suite получает новую синтетическую базу. Использован локальный mongod, приложение не читает .env. После остановки harness удаляет только собственный каталог.

| Проверка | Наблюдаемый результат |
| --- | --- |
| Пустые A/B | Шесть разных областей, все тесты NEW, собственные карточки MISSING |
| Общение | Два разных эпизода: A mastery 0.25, B 0.85; содержательные разные подписи |
| Планирование, расходы, границы | A −0.7, B +0.7; пропуск не превращается в ноль |
| Приоритеты и перегрузка | A 0.2, B 0.8; STATE отображается как временное состояние |
| Черновик | Не создаёт evidence; сохраняется и продолжается |
| Финал и повторы | Тот же источник/дата финала; новые start/week/publication не дают пересдачу; изменённый ответ 409 |
| Конкурентный финал | Две противоположные отправки: ровно одна успешна, одна стабильная запись |
| Одновременное чтение A/B | Одинаковый DTO и версии общего результата; количество личных и парных snapshots не увеличивается |
| Сбой после фиксации | FINALIZED + materializedRevision −1; следующий GET восстанавливает READY без новой сдачи |
| Matching | Реальные значения −0.7/+0.7 дают gap 1.4 и mutual fit 0; желаемый диапазон 0.6…1 остаётся отдельным, направленные результаты различаются |
| Устаревший подбор | Actual revision растёт, старые presentation grants отозваны, feed удалён; поиск не включается автоматически |
| Пара | Все шесть разрешённых результатов рассчитываются; различие планирования даёт TENSION; нет raw values/answers в выдаче |
| Отзыв и завершение пары | WAITING после отзыва, собственное значение сохраняется, paused читается, ended/foreign запрещены; новая пара не получает интимные данные прежнего партнёра |
| Weekly/activity | Основной продукт проходит три последовательных цикла, практики и feedback; weekly первого участника остаётся partial, второго — общий результат; свои STATE обновляются |
| Публикации | Сохранённая planning v1 открывается при текущей v2; неизвестная редакция явно недоступна и остаётся закрытой; восстановление публикации возвращает результат |
| Совместимость | Источник реестра 7 даёт то же −0.7 в реестре 8; sourceHash и observedAt сохранены, повтор не создаёт третий event, grant не возникает |
| Экспорт | Содержит только шесть своих прохождений и собственные ответы; данные B в экспорт A не попадают |
| Старые рефлексии | UNMAPPED не превращается в measurement; библиотека возвращает исходный run и редакцию, новый человек получает новую публикацию |

Выполнены `npm run acceptance:local -- --mongod <local> --suite factors` (3 suites) и `--suite product` (6 suites). Проверки типов, lint и production build прошли. Финальный npm run check:self прошёл целиком, включая batching, entry-pairing и release/product/UI/local-acceptance проверки. Agent checks: 0 errors, 0 warnings, новых allowlist entries нет.

## Браузер

Production build, два независимых hostname/session A/B; первый сценарий first-entry без исходных измерений. Проверено:

- Каталог содержит шесть NEW тестов. A выбирает заранее фиксировать время, сохраняет черновик, перезагружает страницу: выбранный ответ сохранён.
- После явного подтверждения A отправляет окончательно: результат «больше структуры», тест закрыт, собственные ответы доступны только для чтения. Профиль A показывает соответствующее значение.
- B независимо открывает тот же тест как новый и выбирает решение в тот же день: результат «больше спонтанности». Ответ A не отображается.
- На узком экране 390×844 фактическая ширина документа 375 и scrollWidth 375: горизонтального переполнения нет. Радиогруппы, checkbox и отправка работают с клавиатуры; просмотрен полный экран результата.
- Найденные неверные ссылки следующих действий исправлены на /profile/matching и /pair; устранён слабый контраст статуса карточки.

- Во втором сценарии existing-partner A и B через UI создали приглашение и взаимно подтвердили пару. Модель на странице пары сразу использовала доступные onboarding-данные.
- A/B завершили анкету расходов с противоположными ответами и отдельным разрешением. B увидел общий вывод о различиях и действие согласовать общие расходы. После отзыва A и возврата B вывод стал WAITING без раскрытия ответа A.
- После повторного синтетического входа A тест расходов остался закрытым, личное значение и отозванное разрешение сохранились.
- На странице пары B при viewport 320×780 фактическая ширина и scrollWidth совпали (305). Ошибочный ключ анкеты показал «Анкета не найдена» и кнопку восстановления. Размер окна восстановлен; тестовые серверы остановлены.

## Границы проверки и выпуск

Реальный OAuth, Discord iframe, production-трафик и нагрузочное масштабирование не проверялись. Браузер использовал синтетические подписанные сессии собственного harness. Деплой не выполнен. Перед выпуском отдельно выполнить существующий release preflight/dry-run индексов на целевой среде; модель MeasurementTestSession включена в список. Встроенный уникальный _id уже защищает финальную идентичность при autoIndex=false. Массовой миграции, удаления старых источников, lockfile/env/auth изменений и новых зависимостей нет.

## Изменённые файлы

Пути для проверки diff; каждый файл относится к этому функциональному потоку.

- `docs/API_CONTRACTS.md`
- `docs/CHANGELOG.md`
- `docs/FACTOR_MEASUREMENT_ACCEPTANCE.md`
- `docs/FACTOR_MEASUREMENT_CONTRACT.md`
- `docs/INDEX.md`
- `docs/SECURITY.md`
- `docs/TESTING.md`
- `scripts/activity-factor-read-batching.selfcheck.ts`
- `scripts/entry-pairing.selfcheck.ts`
- `scripts/factor-engine.selfcheck.ts`
- `scripts/factor-profile-flow.integration.ts`
- `scripts/local-acceptance.ts`
- `scripts/matching-factor-policy.selfcheck.ts`
- `scripts/onboarding-factor-engine.integration.ts`
- `scripts/product-workspace.integration.ts`
- `scripts/release-preflight.ts`
- `src/app/(auth)/profile/page.tsx`
- `src/app/api/measurements/[key]/route.ts`
- `src/app/api/measurements/route.ts`
- `src/app/api/pairs/[id]/factor-profile/route.ts`
- `src/app/api/questionnaires/[id]/route.ts`
- `src/app/measurements/[key]/page.tsx`
- `src/app/measurements/page.tsx`
- `src/app/pair/[id]/questionnaire/[qid]/page.tsx`
- `src/app/questionnaire/[id]/page.tsx`
- `src/client/api/measurements.api.ts`
- `src/client/api/questionnaires.api.ts`
- `src/client/api/types.ts`
- `src/client/hooks/useMeasurements.ts`
- `src/components/profile/ModeAwareProfileOverview.tsx`
- `src/domain/model/definitions/mvpDefinitions.ts`
- `src/domain/model/definitions/profileMeasurements.ts`
- `src/domain/model/evidence/projectionPolicy.ts`
- `src/domain/model/measurements/catalog.ts`
- `src/domain/model/snapshots/snapshots.ts`
- `src/domain/services/accountDeletion.service.ts`
- `src/domain/services/activityFactorRuntime.service.ts`
- `src/domain/services/development.service.ts`
- `src/domain/services/factorProfileSummary.service.ts`
- `src/domain/services/matching/matchingProfileRuntime.service.ts`
- `src/domain/services/measuredPairProfile.service.ts`
- `src/domain/services/measurementTests.service.ts`
- `src/domain/services/onboardingFactorEngine.service.ts`
- `src/domain/services/pairFormation.service.ts`
- `src/domain/services/productWorkspacePrivacy.service.ts`
- `src/domain/services/profileEvidenceCompatibility.service.ts`
- `src/domain/services/questionnaireCatalog.service.ts`
- `src/domain/services/questionnaires.service.ts`
- `src/features/development/DevelopmentCatalog.tsx`
- `src/features/measurements/MeasurementPages.tsx`
- `src/features/pair/PairProfilePageClient.tsx`
- `src/features/questionnaires/QuestionnairesPageView.tsx`
- `src/lib/dto/factorProfile.dto.ts`
- `src/lib/dto/measuredPairProfile.dto.ts`
- `src/lib/dto/measurementTests.dto.ts`
- `src/lib/dto/questionnaire.dto.ts`
- `src/models/MeasurementTestSession.ts`
- `src/models/PairQuestionnaireSession.ts`
