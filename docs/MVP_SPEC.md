# ForeverApp / «Вместе»: границы MVP

Статус: канонический scope MVP и gates первой коммерческой версии. Дата решения: 2026-08-07.

Этот документ отвечает на вопросы **что входит** и **в каком порядке проверяется**. Подробные функциональные acceptance criteria находятся в `docs/MVP_FLOWS.md`, целевая техническая модель — в `docs/TARGET_DOMAIN_MODEL.md` и `docs/TARGET_DOMAIN_OPERATIONS.md`.

Перечисленная функция не считается реализованной без targeted проверки текущего кода. Существующие сервисы, модели и UI переиспользуются, а не переписываются автоматически.

## 1. Проверяемая гипотеза

Возвращается ли пара к короткому циклу, который превращает раздельные check-in двух участников в privacy-safe общее резюме и одно полезное действие?

```text
два добровольно связанных аккаунта
→ отдельный check-in каждого
→ осторожное Pair Summary
→ одна рекомендация
→ activity + раздельный feedback
→ следующий cycle
```

Единица activation и retention — Pair. Недостаток данных, отсутствие ответа второго участника, пропуск и частичное завершение являются штатными состояниями, а не ошибками.

## 2. Gates

### `P0 — MVP_CORE`

Закрытый или бесплатный пилот полного цикла:

- существующий Discord auth и session boundary;
- одноразовое приглашение и связывание двух аккаунтов;
- короткий onboarding, consent и privacy basics;
- weekly cycle с независимым completion каждого участника;
- Pair Summary с `INSUFFICIENT_DATA` как нормальным результатом;
- одна детерминированная рекомендация;
- activity lifecycle, раздельный feedback и история light;
- обязательные session/resource guards, item-level authorization, idempotency и privacy-safe DTO;
- system-only safety veto, не раскрываемый партнёру.

### `P1 — MVP_RELEASE`

Готовность к публичной эксплуатации:

- полный lifecycle приглашения, Pair, unlink и повторного подключения;
- утверждённые export/delete/retention правила;
- проверенные sensitive content и локализованный help flow;
- безопасные уведомления и продуктовая аналитика без payload;
- versioned publish process для вопросов и активностей;
- entitlement, trial и billing только для платного запуска.

### `P2 — NEXT`

Не задерживает `P0/P1`:

- отдельные partner signals и return-to-conversation;
- тренды и подтверждаемые patterns;
- adaptive questions и персонализация;
- agreements, programs, household и future modules.

AI, dating/matching, медицина, pregnancy/children, Family OS и marketplace остаются за границами MVP согласно `docs/PRODUCT_SPEC.md`.

## 3. End-to-end flow

```text
Discord auth
→ onboarding первого участника
→ создать одноразовое приглашение
→ партнёр принимает приглашение и проходит onboarding
→ подтвердить контекст Pair
→ первый check-in каждого
→ privacy-safe Pair Summary
→ [неблокирующее предложение subscription, если запуск платный]
→ принять / заменить / пропустить рекомендацию
→ activity и feedback, если activity принята
→ история первого cycle
→ [hard paywall перед cycle 2, если запуск платный]
→ следующий cycle
```

Первый cycle всегда доступен целиком. Неблокирующее предложение можно показать после первого summary, но hard paywall разрешён только перед открытием cycle 2.

## 4. Scope по пользовательским возможностям

| Область | `P0` результат | Детали |
| --- | --- | --- |
| Auth | Повторяемый Discord вход без нового generic auth | `docs/MVP_FLOWS.md` §1.1 |
| Onboarding | Минимум данных и явные capture/disclosure choices | §1.2 |
| Pair linking | Безопасное одноразовое приглашение, waiting/expired/cancelled | §1.3 |
| Cycle | Два независимых check-in, concurrent/idempotent submit | §1.4 |
| Summary | До четырёх нейтральных display-сигналов без чтения мотивов | §1.5 |
| Recommendation | Одна activity, replace/skip и explainable reason | §1.6 |
| Activity | Отдельные recommendation/activity states и late-peer feedback | §1.7 |
| History | Циклы, раскрытые summaries и выполненные/пропущенные actions | §1.8 |
| Privacy | Raw и derived disclosure разделены; safety veto system-only | §1.9–1.10 |
| Operations | Notifications, billing и analytics по применимому gate | §1.11–1.13 |

## 5. Компактная экранная карта

1. Auth/entry.
2. Personal onboarding.
3. Create/accept invite и waiting state.
4. `/main-menu` как «Сегодня» и главный cycle hub.
5. Weekly check-in runner.
6. `/pair` с Pair Summary и history light.
7. Activity + feedback flow.
8. `/profile` с личным статусом и privacy.
9. Settings, Pair lifecycle и subscription при платном запуске.

Отдельный Product Entry с единственным выбором «я уже в отношениях» не нужен. Legacy matching может оставаться изолированным, но не является путём входа MVP.

## 6. Готовность пилота

Новая пара без разработчика должна суметь:

1. войти и связать два аккаунта;
2. понять правила использования/раскрытия данных;
3. пройти первый cycle в любом порядке submit;
4. получить понятный summary без утечки скрытого ответа;
5. принять, заменить или пропустить activity;
6. раздельно дать feedback, включая late-peer path;
7. увидеть историю и начать следующий cycle;
8. восстановить flow после повторного входа и повторного запроса.

Privacy/security, content/safety и paid-launch gates перечислены в `docs/MVP_FLOWS.md` §4. Ни один из них не заменяется ручной операцией или «временно доверенным» client input.

## 7. Порядок работ

1. Baseline matrix: `verified / partial / missing / legacy-out-of-scope`.
2. Entry/linking и Pair invariants.
3. Consent, versioned input и disclosure.
4. Cycle projection и insufficient-data behavior.
5. Recommendation, activity, feedback и history.
6. Главный UI-flow.
7. Release safety, lifecycle и operations.
8. Commercialization для платного запуска.

Полный delivery checklist и критерии перехода к `NEXT` находятся в `docs/MVP_FLOWS.md` §5–6. Любое изменение public API, auth/security model или схемы БД выполняется отдельной задачей в соответствующем operating mode.
