# foreverApp / «Вместе»

Состояние на 2026-09-05: реализовано согласованное расширение для одиночки, знакомства и пары. [Обзор результата и сценарии проверки](docs/PRODUCT_IMPLEMENTATION.md), [решения владельца](docs/PRODUCT_DECISIONS.md). Добавлены первый вход и взаимное связывание по собственному коду, шесть областей личного развития, библиотека практик, структурированное знакомство, общая жизнь и внутренняя экономика. Основной цикл и подбор бесплатны; дополнительные материалы открываются заработанными монетами. Старые разделы ниже описывают техническую основу августовского MVP.

## Что это

ForeverApp — Discord Embedded App для совершеннолетних людей, которые ищут отношения или уже состоят в них. Публичное ядро бесплатно: Factor Matching помогает безопасно найти и взаимно подтвердить связь, а сформированная Pair проходит отдельные weekly check-in, получает privacy-safe Pair Summary, выбирает одно совместное действие, отправляет раздельный feedback и начинает следующий цикл без entitlement или оплаты.

Вычислительное ядро работает в режиме `NEW_ONLY` на versioned semantic Factor Engine:

```text
definitions → evidence → immutable snapshots → pair evaluations → recommendation
```

Шесть legacy-осей, numeric compatibility, Pair Passport и paywall не участвуют в основном runtime. Сохранённая billing-инфраструктура изолирована как необязательный будущий контур и не определяет доступ к core flow.

## Factor Matching

Matching использует отдельный от Pair и owner profile агрегат `MatchingProfile`. Только явно разрешённые `MatchingUseGrant` текущие Factor snapshots и отдельный `PartnerPreferenceProfile` участвуют в подборе:

```text
Factor snapshots + use grants + partner preferences
→ coarse candidate discovery → bounded feed session
→ expiring candidate presentation grant → qualitative fit
→ Like → MatchingConnection → two-party confirmation → Pair
```

Пользовательский DTO показывает только `PROMISING`, `WORKABLE` или `LOW_INFORMATION`, качественную confidence-band и короткие объяснения. Numeric rank/fit, raw Factor values, чужие preferences, evidence и внутренние hard-constraint reasons не раскрываются. Feed/card/Like всегда привязаны к session actor и короткоживущему candidate grant; Pair создаётся только после подтверждения обоими участниками. Matching относится к бесплатному core и не проверяет entitlement.

## Стек

- Next.js App Router, React, TypeScript;
- MongoDB/Mongoose с transaction-capable replica set;
- Discord Embedded App SDK;
- Zod;
- signed session cookie и in-memory bearer fallback для embedded-клиента.

## Быстрый старт

Требуется Node.js 20.9+ и MongoDB с поддержкой транзакций.

```bash
npm install
npm run dev
```

Откройте `http://localhost:3000`. Для database integrations используйте только отдельную локальную БД с суффиксом `_test`; точные команды находятся в [release runbook](./docs/RELEASE_RUNBOOK.md).

Для приёмки без Discord и реальных секретов доступны `npm run acceptance:local -- --mongod <абсолютный-путь>` и, после сборки, `npm run acceptance:browser -- --mongod <абсолютный-путь>`. Инструмент сам запускает новый тестовый replica set; browser-режим создаёт две фиксированные синтетические сессии. Вместо аргумента можно задать `LOCAL_ACCEPTANCE_MONGOD` — это только путь к установленному `mongod` для локального инструмента, production-приложение его не использует. Рабочая копия для этих команд должна быть без runtime `.env`-файлов. Подробности и границы проверки — в [LOCAL_ACCEPTANCE.md](./docs/LOCAL_ACCEPTANCE.md).

## Переменные окружения

| Переменная | Обязательность | Назначение |
| --- | --- | --- |
| `MONGODB_URI` | да | MongoDB connection string |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | да | Discord application id |
| `DISCORD_CLIENT_SECRET` | да | Discord OAuth secret |
| `DISCORD_REDIRECT_URI` | условно | Предпочтительный server-side redirect allowlist; нужен один redirect URI |
| `NEXT_PUBLIC_DISCORD_REDIRECT_URI` | условно | Discord SDK redirect и server fallback |
| `JWT_SECRET` | да | Подпись сессии, минимум 32 символа |
| `TRUSTED_PROXY_MODE` | нет | `disabled` или `x-forwarded-for` за доверенным ingress |
| `BILLING_MODE` | нет | `disabled` по умолчанию; `sandbox` относится только к изолированному будущему billing-контуру |
| `BILLING_WEBHOOK_SECRET` | с `sandbox` | HMAC secret sandbox webhook, минимум 32 символа |
| `ENTITLEMENTS_ADMIN_KEY` | нет | Защита legacy/admin grant endpoint, минимум 32 символа |

Startup валидирует контракт. Не включайте `x-forwarded-for` без ingress, который перезаписывает и проверяет этот header. Значения secrets нельзя печатать в логах или release evidence.

## Основные команды

| Команда | Назначение |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm run start` | Production build и server |
| `npm run lint` | ESLint |
| `npm run check:types` | TypeScript no-emit check |
| `npm run check:self` | Быстрые database-free selfchecks, включая Factor/legacy-cutover/privacy contracts |
| `npm run check:agents` | Архитектурные и repository diagnostics |
| `npm run selfcheck:matching-social` | Database-free lifecycle/authorization checks для Like, connection, block и Pair confirmation |
| `npm run verify:matching:code` | Matching types, boundaries, Factor policy, social/API/UI/disclosure/migration/bootstrap checks |
| `npm run integration:factor-engine-runtime` | Persistence/replay/concurrency Factor Engine на `_test` DB |
| `npm run integration:factor-engine-cutover` | NEW_ONLY migration/cutover scenarios |
| `npm run integration:onboarding-factor-engine` | Onboarding → Factor evidence/snapshots |
| `npm run integration:questionnaire-new-only` | Semantic questionnaire owner-private flow |
| `npm run integration:pair-context-lifecycle` | End/reconnect и изоляция Pair context |
| `npm run integration:partner-signal` | Explicit PartnerSignal, idempotency и expiry |
| `npm run integration:privacy-deletion-execution` | Подтверждённое удаление и session revocation |
| `npm run integration:privacy-factor-export` | Owner export и Factor disclosure boundary |
| `npm run integration:two-user-mvp` | Три полных бесплатных цикла двух пользователей |
| `npm run integration:matching-atlas` | Aggregated matching social/race/security/Pair-transition suite на guarded `_test` DB |
| `npm run verify:matching:release` | Matching preflight, migration verify, Atlas integrations и load smoke на guarded `_test` DB |
| `npm run release:load-smoke` | Guarded synthetic load/query-plan smoke на `_test` DB |
| `npm run release:preflight` | Read-only release/index/data invariants |
| `npm run release:migrate-factor-engine` | Dry-run Factor NEW_ONLY migration |
| `npm run release:migrate-pair-events-new-only` | Dry-run PairEvent semantic cutover |

Полный список команд и порядок применения миграций: [TESTING.md](./docs/TESTING.md) и [RELEASE_RUNBOOK.md](./docs/RELEASE_RUNBOOK.md).

## Карта проекта

- [Документация](./docs/INDEX.md)
- [Архитектура](./docs/ARCHITECTURE.md)
- [Factor domain model](./docs/TARGET_DOMAIN_MODEL.md)
- [API contracts](./docs/API_CONTRACTS.md)
- [Project map](./docs/PROJECT_MAP.md)

Для работы Codex начните с `AGENTS.md` и [docs/INDEX.md](./docs/INDEX.md).
