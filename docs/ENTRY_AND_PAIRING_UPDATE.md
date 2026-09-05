# Вход, личная настройка и связывание партнёров

Дата: 2026-09-05. Основание: принятые ответы в [PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md).
Классификация: FEATURE_CHANGE; изменение API и добавление совместимых полей моделей.
Авторизация остаётся Discord session-cookie через существующие централизованные guards.

## Первый вход

`/` после успешного Discord bootstrap проверяет `entryCompletedAt` и `entryCohort`.
При отсутствии этих данных открывается `/entry`; прямой переход на `/mvp-onboarding`
также возвращает к этому шагу с сохранением fragment приглашения.

- `SOLO`: личная подготовка и поиск по желанию; после вопросов основной переход ведёт к личному развитию, отдельно доступны настройка поиска и собственный профиль.
- `EXISTING_PARTNER`: личная настройка, затем `/invite` для реального партнёра.
- Намерение не создаёт Pair. `personal.relationshipStatus` вычисляется из наличия
  активной/приостановленной Pair внутри транзакции записи User.
- Возраст 18–120, пол и город вводятся отдельно от 12 вопросов Factor onboarding.
  При этом существующий прогресс и capture policies вопросов сохраняются.
- Изменение данных поиска/намерения использует User membership fence, отключает
  discovery projection и отзывает candidate grants. Опубликовать поиск снова нужно явно.

Основные файлы: `src/app/entry/page.tsx`, `src/domain/services/entryProfile.service.ts`,
`src/domain/services/users.service.ts`, `src/client/api/entry.api.ts`.

## Место поиска

Город профиля — свободный текст; неподдерживаемый город не блокирует личные функции.
Поиск можно настроить отдельно через небольшой каталог `ru-cities-v1` в
`src/domain/model/entry/cityCatalog.ts` либо добровольно разрешить местоположение устройства.
Внешнего геокодера и нового env-контракта нет.

Координаты нового entry flow округляются до двух знаков до отправки с устройства и на сервере.
Каталог содержит примерные центры городов; расстояние от них не является точной дистанцией
между людьми. Координаты пользователя доступны только в приватном owner DTO.
`NONE` удаляет используемое место поиска, `KEEP` сохраняет предыдущее.

`next.config.ts` разрешает geolocation для `self` и конкретного
`https://<NEXT_PUBLIC_DISCORD_CLIENT_ID>.discordsays.com` при корректном ID, без wildcard.
Политика родительского iframe Discord всё равно может запретить геолокацию;
поэтому разрешение устройства не обязательно для входа или заполнения профиля.

## Постоянный код и два подтверждения

`User.publicId` — случайный 96-битный код вида `VM-XXXXXXXX-XXXXXXXX-XXXXXXXX`,
генерируемый сервером и присваиваемый один раз. Он не используется для входа,
не равен Discord ID и не принимается как Telegram nickname.
Разрешение кода ищет только активное приглашение владельца; общего поиска аккаунтов по коду нет.
Имя и код другой стороны раскрываются в контексте доступного приглашения.
Общий публичный User DTO остаётся без этого поля; owner получает его в приватном DTO.

1. Владелец с завершённым onboarding и путём `EXISTING_PARTNER` создаёт приглашение.
2. Получатель вводит код или открывает ссылку `/join#token=...`, входит своим аккаунтом,
   завершает настройку, сверяет имя/код владельца и подтверждает «Это мой партнёр».
3. `accept` сохраняет `acceptedByUserId` и `recipientConfirmedAt`; статус пока `ACTIVE`.
   Pair и `PairMembershipClaim` на этом шаге не создаются.
4. Владелец на `/invite` сверяет имя/код откликнувшегося и отдельно подтверждает его.
   `confirm` проверяет владельца из session, зафиксированного получателя и его публичный код.
5. Только затем существующий `formPairInSession` в одной транзакции создаёт Pair,
   два membership claims, закрывает конфликтующие связи и записывает `creatorConfirmedAt`/`ACCEPTED`.

Проверки cohort выполняются в транзакциях вместе с User fences.
Повторы подтверждений сходятся к прежней Pair; отмена, срок 72 часа и перевыпуск сохраняются.
До входа и при чужом/недоступном приглашении не раскрываются сведения аккаунта.
Invite token хранится только хешем, передаётся в fragment, а в idempotency хранится hash lookup.

Основные файлы: `userPublicIdentity.service.ts`, `pairInvite.service.ts`,
`src/app/invite/page.tsx`, `src/app/join/page.tsx`, `src/client/api/pairInvites.api.ts`.
Telegram, mobile login и связывание нескольких auth providers не реализованы.
`User.id` и существующие session subjects сохранены; код отделяет публичное связывание
партнёров от текущего идентификатора провайдера.

## API и модели

| Контракт | Поведение |
|---|---|
| `GET /api/users/me/entry` | Private user DTO, фактическая Pair, статус onboarding, каталог; ленивое присвоение кода |
| `PUT /api/users/me/entry` | Strict `{cohort,age,gender,city,locationMode,searchCityId?,coordinates?}`, actor только session |
| `POST /api/pair-invites/resolve` | Ровно `{token}` или `{partnerCode}`; состояния AVAILABLE/WAITING_CONFIRMATION/ACCEPTED/UNAVAILABLE |
| `POST /api/pair-invites/accept` | Lookup + `confirmation: THIS_IS_MY_PARTNER`; pending response не содержит pairId |
| `POST /api/pair-invites/[id]/confirm` | `{partnerPublicId,confirmation: THIS_IS_MY_PARTNER}`; завершение только владельцем |

User: optional `publicId`, `entryCohort`, `entryCompletedAt`, `locationSource`.
PairInvite: optional `recipientConfirmedAt`, `creatorConfirmedAt`; enum статусов не изменён.
User matchCard mirror допускает legacy 2 и новые 3 вопроса; canonical Matching DTO принадлежит Matching flow.
Существующим пользователям не нужен массовый backfill: entry заполняется при посещении,
завершённые Factor ответы не сбрасываются. Старые принятые приглашения продолжают возвращать прежнюю Pair.

Новый индекс User `{publicId:1}` unique+sparse, имя `user_public_pairing_id`,
должен быть создан release preflight до использования кода: runtime `autoIndex:false`.
Нативный CAS update только этой immutable server-generated колонки предотвращает замену кода
конкурентными первыми запросами. Производственная миграция/индексирование здесь не запускались.

## Награда и проверки

После `completed + MATERIALIZED` onboarding вызывает `economyService.rewardCompletion`
с `sourceKind: ONBOARDING`; серверный ключ экономики один на владельца для первого onboarding.
Повторное завершение и owner GET восстанавливают недошедшую награду без повторной выплаты.
Незавершённая materialization не награждается. UI показывает реальное число вопросов из definition
и не обещает отсутствующее редактирование завершённых ответов.

Проверены targeted ESLint; `security-critical`, `mvp-onboarding`, `pair-invite`, новый
`entry-pairing.selfcheck.ts`. Последний использует только in-memory models/transaction stubs,
проверяет отказы, схемы, coarse location, повторяемость кода/подтверждений и retry награды.

На отдельном локальном Mongo replica set `vmesteTest`, БД `vmeste_entry_product_test`, прошли:

- `entry-onboarding.integration.ts`: настоящий минимальный OAuth upsert без legacy profile,
  entry GET/save для NONE/catalog/device, оба намерения без выдуманной Pair, все 12 вопросов,
  Factor materialization и конкурентные повторы завершения/GET → 1 coin/1 ledger row.
- `pair-lifecycle-remaining.integration.ts`: подтверждения, cleanup конфликтующих invites,
  create/formation race, сохранённые проверки Pair lifecycle.
- `two-user-mvp.integration.ts`: 4 конкурентных финальных подтверждения → 1 Pair/2 claims,
  три последовательных недельных цикла с activities/history и privacy assertions.

В two-user fixture исправлены две устаревшие предпосылки: после первого ответа новой недели
сохраняется допустимая промежуточная INSUFFICIENT ревизия; пригодность проверяется у последних
ревизий всех четырёх факторов и их canonical provenance. Notification retry использует тот же
`pair_invite:` sourceKey, что PairFormation. Добавлен run-scoped cleanup новых wallet/ledger записей.
Проверки завершили соединения; реальный Discord iframe и действия двух пользователей в браузере
этими интеграциями не проверяются.
