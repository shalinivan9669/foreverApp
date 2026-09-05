# Личная экономика и общая коллекция — 2026-09-05

Статус: реализованный earned-only контур по [PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md), без реальных платежей. Wallet пользователя и бюджет пары — отдельные функции. Монеты не поступают в Factor Engine, matching, skill или readiness.

## Пользовательский путь

- `/store`: баланс, суммы заработанного/потраченного, магазин, инвентарь и журнал с постраничной загрузкой.
- Первое полное onboarding даёт **1** монету один раз на владельца, независимо от ревизии/сессии анкеты. Личный тест — **2**, solo practice — **3**, pair activity — **5 каждому** после обоих feedback. Ответы и оценка полезности не меняют сумму.
- `ECONOMY_REWARD_RULES` в `src/domain/model/economy/catalog.ts` — единая версионированная конфигурация сумм и лимитов. Рабочий anti-farm лимит: до трёх награждённых завершений в сутки UTC на категорию, кроме однократного onboarding. Для completion сверх лимита сохраняется нулевая запись, чтобы повтор на следующий день не выдал отложенную награду. Начисляется не более одного раза на стабильный серверный source id.
- Каталог: две темы личного кошелька, три коллекционных предмета, два дополнительных контентных набора, капсула за заработанные монеты. Темы можно применить/снять; приобретённый контент открывается из коллекции. Базовые сценарии не требуют кошелька или покупки.
- Капсула стоит 2 монеты, до подтверждения видны шансы 60/30/10%. Выдаётся один предмет; дубликат увеличивает количество. Выпавший предмет записывается вместе со списанием; retry не делает новый розыгрыш. Реальные деньги, пополнение, cash-out и платные случайные награды отсутствуют.
- Вкладка «Наше» показывает отдельную коллекцию текущей пары: участник подтверждает перенос **одного принадлежащего ему COLLECTIBLE** из своего инвентаря. Монеты при переносе не списываются, общего кошелька нет. Предмет остаётся в контексте этой пары без возврата; перед подтверждением это объясняется. CONTENT, COSMETIC и CAPSULE переносить нельзя. В общем DTO только сумма предметов, без таблицы вкладчиков и личных результатов. На паузе доступен просмотр, после завершения пары доступ закрыт; новый Pair начинает пустую коллекцию.
- Приобретённый контент ведёт на `/development?content=key`: выбор карточки, без автоматического POST/start от GET-навигации. Ошибка входа использует общий ErrorView и явное возвращение на страницу авторизации.

## Контракты

| Операция | Вход/результат |
| --- | --- |
| `GET /api/economy` | Owner overview: balance/earnedTotal/spentTotal, equippedItemId, каталог с ownedQuantity и odds, правила наград |
| `GET /api/economy/history?cursor=...` | Не более 25 owner entries; nextCursor, безопасные label/delta/balanceAfter/time, без исходных ответов или peer данных |
| `POST /api/economy/purchases` | Строго `{itemId, operationId: UUID}`; серверная цена; receipt и сохранённый outcome. Новый body с прежним operationId — conflict |
| `POST /api/economy/appearance` | Строго `{itemId: string|null}`; только принадлежащий владельцу cosmetic |
| `GET /api/economy/pair-collection?pairId=...` | Общая коллекция указанного текущего Pair; resource guard, readOnly на паузе, ended/foreign 404 |
| `POST /api/economy/contributions` | Строго `{pairId,itemId,operationId:UUID}`; перенос 1 коллекционного предмета из personal inventory; receipt привязана к actor/pair/item |
| `economyService.rewardCompletion` | Только внутренний вызов `{userId, sourceKind, sourceId, session?}`; нет публичного endpoint начисления. В supplied session необходима активная транзакция |
| `economyService.assertContentAccess` | `{userId, contentKey, session?}`; paid content без inventory возвращает `403 ECONOMY_CONTENT_LOCKED`. Free keys не ограничиваются |

Paid keys: `reflection.deep-values-v1`, `scenario.weekend-dialogue-v1`. Development library использует эти же ключи. Existing questionnaire route выдаёт награду на questionnaire id, не на hash ответов; параллельные/повторные ответы не дают новых монет. Existing PairActivity выдаёт награды в транзакции completion; поздний второй feedback после preliminary result также закрывает награду. Development и onboarding подключаются к тому же внутреннему сервису своими server-derived стабильными идентификаторами.

Все HTTP routes используют централизованную session/origin/account write-lease защиту и user rate limit. Нельзя передать actor, цену, сумму или результат капсулы. Private responses используют `jsonOk`/`jsonError` и no-store. Browser sessionStorage содержит случайный незавершённый operationId под ключом предмета/контекста для повтора после потери ответа; не session token, не user id и не данные кошелька. При недоступном storage остаётся retry в памяти текущей страницы. `/contributions` всегда вызывает сервис, не использует внешний HTTP receipt cache: Pair resource guard и active transaction fence исполняются **до** поиска сохранённой receipt, включая повтор запроса после pause/end.

## Хранение и транзакционная целостность

- `economy_wallets`: `_id=userId`, integer nonnegative balance/totals, revision, daily counters, выбранное оформление.
- `economy_ledger`: immutable append-only запись EARN/SPEND/CONTRIBUTE с delta, balanceAfter, версиями правил/каталога и source/outcome. Нулевые cap-решения и переносы без изменения баланса тоже сохраняются. В runtime нет update/delete ledger.
- `economy_inventory`: `_id=hash(owner,item)`, owner/item/quantity/acquiredAt. Количество дубликатов сохраняется.
- `economy_pair_collection`: `_id=hash(owner,pair,item)` защищает единственную строку вклада владельца по предмету/контексту. Перенос удаляет последнюю единицу личного инвентаря или уменьшает количество, увеличивает общую коллекцию и добавляет zero-delta receipt в одной transaction. Pair lifecycleRevision fence сериализует перенос против pause/end, wallet fence — против других операций владельца.
- Ledger `_id=hash(owner,kind,canonicalSource)` и wallet `_id` используют встроенный уникальный MongoDB индекс; correctness не зависит от `autoIndex`. Onboarding canonicalSource всегда `first-completion`. Один wallet write fence сериализует начисления/расходы/инвентарь владельца в каждой Mongo transaction. Списание, ledger и grant предмета коммитятся вместе; при ошибке всё откатывается.
- Transaction retries сохраняют command identity и заранее выбранный capsule outcome; committed receipt имеет приоритет. Собственная транзакция отдельно повторяет initial-wallet duplicate-key race; supplied transaction оставляет rollback/retry вызывающему workflow. Внутри Mongo session операции выполняются последовательно.
- Модели объявляют вспомогательные owner/history индексы ledger и inventory. Они нужны для скорости при росте истории; их фактическое создание в целевой БД не утверждается. Старые коллекции/документы не мигрируются и не удаляются.
- Owner export включает balance, inventory, до 250 последних ledger entries и до 250 строк собственных вкладов с флагами усечения; чужие вклады не экспортируются. Account deletion удаляет записи владельца из всех четырёх economy collections внутри существующей cleanup transaction. Строки второго участника не удаляются, но завершённый Pair не даёт доступ к общей коллекции. Это privacy-исключение к append-only политике, без изменения отложенного FAILED recovery.

## Проверка

`npx tsx scripts/economy.selfcheck.ts` — PASS: реальные команды сервиса с изолированным transactional adapter в памяти; разные owners/source ids, однократное onboarding, суммы 1/2/3/5, дневной cap, повтор покупки, reuse conflict, insufficient balance, rollback при сбое inventory/общей коллекции, capsule replay, content gate и appearance ownership, перенос только COLLECTIBLE и end deny, balance=earned−spent=sum(ledger). Дополнительно проверена структура route: нет receipt-cache wrapper, Pair fence выполняется до replay. Adapter сериализует операции и откатывает snapshot; это не доказательство Mongo driver retries/индексов или browser E2E.

`npx tsx scripts/economy.integration.ts` — PASS с явно заданным `MONGODB_URI=mongodb://127.0.0.1:27029/vmeste_economy_product_test?replicaSet=vmesteTest`. Скрипт отклоняет другие URI и удаляет только UUID-fixtures своего запуска, без drop/database-wide cleanup. Проверены реальные Mongo transactions: 16 конкурентных onboarding → 1 награда; 10 повторов покупки/капсулы/переноса → 1 эффект; два различных переноса одной единицы → 1 success; rollback при ошибке записи общей коллекции; баланс, paid owner gate, outsider deny, pause/end replay deny, пустая коллекция нового Pair, экспорт только своих вкладов. Вспомогательные indexes не применялись, correctness использует встроенные `_id`.

Targeted ESLint новых economy файлов, hooks и изменённых completion/export/deletion сервисов — PASS. `npm run check:types -- --incremental false` — PASS после добавления общей коллекции и интеграционного сценария. Финальные build, navigation и проверки других потоков фиксирует координатор. Целевая/production БД, seed/index apply, реальные платежи и browser E2E этим потоком не выполнялись. Интеграционная проверка сервиса не заменяет HTTP/browser E2E.
