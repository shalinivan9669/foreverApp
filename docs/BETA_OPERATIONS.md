# Закрытая бета: операторский запуск, остановка и восстановление

Это инструкции к исполняемому коду. В данном задании никакая реальная среда не открывается, реальные приглашения не создаются, рабочие миграции не применяются. Режим по умолчанию OFF. Предыдущие I01–I04 synthetic guards сохранены.

## Конфигурация и границы

Существующие `MONGODB_URI` и `JWT_SECRET` остаются явными переменными процесса; инструменты ниже не загружают `.env`. MongoDB требует replica set для коротких транзакций. `ASSESSMENT_MODE=OFF|SYNTHETIC|PRIVATE_BETA`; исторический `ASSESSMENT_SYNTHETIC_ENABLED=true` без mode остаётся alias синтетического пути. SYNTHETIC разрешён только для `mongodb://127.0.0.1/...vmeste_*_test?replicaSet=...` без URI credentials.

PRIVATE_BETA требует:

- `ASSESSMENT_BETA_APPROVALS_PATH`: защищённый оператором JSON с актуальными решениями для точного target;
- `ASSESSMENT_RECOVERY_MONGODB_URI`: отдельную recovery-базу, которая переживает потерю основной; размещение на том же диске/хосте не считается доказанным disaster recovery;
- `ASSESSMENT_RECOVERY_IDENTITY_KEY`: стабильный секрет не короче 32 символов; хранится и восстанавливается отдельно, не ротируется вместе с JWT;
- `ASSESSMENT_ALERT_WEBHOOK_URL`: проверенный HTTPS-канал оператора; штатные запросы передают только агрегатные коды, время и версию политики;
- действующий нормальный вход, текущую migration version и подтверждённый `recoveryReconciled`; отсутствие synthetic/test-login настроек.

Approval-файл проверяет `schemaVersion: private-beta-approval-v1`, `targetId`, `expiresAt`, `surface: DISCORD_ACTIVITY|WEB`, `cohortId`, `maxAdmitted` от 1 до 100, `adultPolicy: SELF_DECLARED_18_PLUS`, `operator: {name,evidenceRef,approvedAt}`, поля evidence `content`, `privacy`, `platform`, `retentionPolicy`, `realAuthSmokeEvidence`, `alertChannelVerifiedAt`. Ссылки на реальные решения заполняются оператором. Наличие JSON не заменяет подлинность решения; gate report отдельно проверяет внешние evidence. В репозитории не создаётся разрешительный файл с выдуманными approvals.

Синтетические credentials и строки `LOCAL_ACCEPTANCE_RUN_ID`, `ALLOW_TEST_LOGIN=true`, `AUTH_IMPERSONATION_ENABLED=true` блокируют real gate. Синтетический target и реальные participant records не преобразуются друг в друга. Операторское приглашение связано с конкретной серверной identity; оно не служит bearer token и не заменяет login или выбор пользователя.

## Явные команды

Используются установленный по lockfile Node и `tsx`. В примерах `<TARGET_ID>`, `<SUBJECT>`, `<COHORT>` и пути заменяются оператором. Не вставляйте URI, секреты и содержимое ответов в отчёты.

```text
node --import tsx scripts/beta-ops.ts identity
node --import tsx scripts/beta-ops.ts preflight
node --import tsx scripts/beta-ops.ts migrate
node --import tsx scripts/beta-ops.ts migrate --apply --target-id=<TARGET_ID>
node --import tsx scripts/beta-ops.ts initialize-empty --apply --target-id=<TARGET_ID>
node --import tsx scripts/beta-worker.ts
node --import tsx scripts/beta-ops.ts health
node --import tsx scripts/beta-ops.ts test-alert --apply --target-id=<TARGET_ID>
node --import tsx scripts/beta-ops.ts invite --subject=<SUBJECT> --cohort=<COHORT> --apply --target-id=<TARGET_ID>
node --import tsx scripts/beta-ops.ts revoke --subject=<SUBJECT> --apply --target-id=<TARGET_ID>
```

Сначала проверить identity/preflight и dry run, затем получить отдельное разрешение на реальный apply. `migrate` создаёт только additive indexes, оставляет checkpoints и безопасно повторяется после прерывания. `initialize-empty` разрешён только до появления participants и только после миграции; он не обходит восстановление существующей копии. App запускается существующей `npm run start`; worker — отдельным контролируемым процессом. Для сервера процесс следует включить в существующий supervisor с restart on failure. CLI уже исполняет цикл; установка supervisor и включение целевой инфраструктуры — отдельная внешняя операция.

При `--once` worker выполняет один проход, что также позволяет подключить существующий scheduler. Обычный процесс делает bounded проход раз в 5 секунд, реагирует на SIGINT/SIGTERM, исполняет cleanup и добровольные inbox-reminders. После настройки стартуют app+worker в OFF, синтетическая приёмка проходит отдельно от реальной БД, после подлинных gates оператор устанавливает PRIVATE_BETA и только затем приглашает ограниченную cohort.

## Остановка и публикации

```text
node --import tsx scripts/beta-ops.ts stop --effects=SUBMISSIONS,DISCLOSURE,MATCHING,PAIR,NOTIFICATIONS --apply --target-id=<TARGET_ID>
node --import tsx scripts/beta-ops.ts stop-publication --publication=<PUBLICATION_ID> --apply --target-id=<TARGET_ID>
node --import tsx scripts/beta-ops.ts resume-publication --publication=<PUBLICATION_ID> --apply --target-id=<TARGET_ID>
node --import tsx scripts/beta-ops.ts resume --effects=SUBMISSIONS,DISCLOSURE,MATCHING,PAIR,NOTIFICATIONS --apply --target-id=<TARGET_ID>
```

Отдельные stop switches сохраняются в MongoDB и проверяются до записи/выдачи. Остановка и отзыв доступны оператору с явным target/apply даже в OFF или после истечения rollout approval. Возобновление и новый допуск требуют текущего target gate. При откате binary не откатывают runtime controls, ledger, permission/deletion epochs или опубликованные версии. Для ошибочной рубрики остановить её ID, сохранить reproducer, выпустить новую immutable version и выполнить разрешённый replay; не изменять прошлые наблюдения на «рост».

## Очередь, здоровье и alert

`assessment_jobs` получает уникальный semantic key субъекта/версии набора/поколения. Source и job фиксируются в одной транзакции. Расчёт вне транзакции; commit проверяет актуальные inputs и lease fence. Политика: batch 10, lease 60 секунд, 5 попыток, backoff 1/5/30/120/600 секунд, queue cap 1000. Stale lease не подтверждает и не перезаписывает работу. OFF сохраняет pending для возобновления; удалённый/отозванный субъект отменяет эффекты. Dead-letter не требует нового прохождения:

```text
node --import tsx scripts/beta-ops.ts retry-job --job=<JOB_ID> --apply --target-id=<TARGET_ID>
```

Health возвращает queue depth/age, dead letters, worker heartbeat age, recent failures, migration/recovery state. Пороги `beta-alerts-v1`: pending старше 120 секунд, очередь от 100, любая dead-letter, 5 ошибок за 5 минут, heartbeat старше 30 секунд. Worker реально POST-ит агрегатный alert, повторяет изменившийся набор и неизменившийся тревожный набор раз в 5 минут. Отсутствующий/неработающий канал блокирует операторскую готовность. HTTP status/latency и SOURCE_COMMITTED/INVALIDATED/CAS_CONFLICT записываются в реальных обработчиках; сообщения/ответы/subjects туда не передаются.

Claim, срок lease, fencing, acknowledge и backoff используют MongoDB `$$NOW`, чтобы часы отдельных workers не давали истёкшей аренде права записи. Тестовый takeover моделирует истечение аренды; мониторинг часов базы и восстановления topology остаётся операционной обязанностью. Нет заявления глобального exactly-once: canonical DB effects идемпотентны, внешнему alert допускается повторная доставка.

## Поддержка и данные

Пользовательские экспорт, отзыв и удаление находятся в общем разделе настроек. Поддержка — owner-only ticket, текст максимум 2000 символов, до 10 открытых обращений. Приложение результата требует отдельного явного выбора конкретной своей ревизии. Никакого автоматического вложения ответов, просмотра через impersonation или уведомления партнёра.

```text
node --import tsx scripts/beta-ops.ts support-list --apply --target-id=<TARGET_ID>
node --import tsx scripts/beta-ops.ts support-read --ticket=<TICKET_ID> --output=<PRIVATE_NEW_FILE> --apply --target-id=<TARGET_ID>
node --import tsx scripts/beta-ops.ts support-resolve --ticket=<TICKET_ID> --apply --target-id=<TARGET_ID>
```

`support-read` пишет только явно запрошенное обращение в новый файл (не stdout), аудит содержит технический код чтения. Файл — личные данные для разрешённого оператора, его нельзя добавлять в git, общий лог или acceptance artifact. Поддержка не обещает экстренного или круглосуточного ответа.

Worker очищает неактивные drafts после 30 дней, завершённые источники после 180 дней, practices после 90 дней, закрытую поддержку после 30 дней, технические receipts/events после 7 дней. Окно актуальности источника отдельно от retention: очистка/просрочка не означает ухудшение способности. Политика пары/уведомлений реализована соответствующим контуром; один авторский отчёт не удаляется по отзыву второго.

## Backup, restore и rollback

Поддерживаемый откат на предыдущую версию выполняется с остановленной beta-функциональностью. Базовый pilot `e61642a3b78b9c088dfb0496677c00cf2217ab3f` ещё не понимает `ASSESSMENT_MODE` и новые durable stop controls: одного `ASSESSMENT_MODE=OFF` недостаточно. Защищённый launcher сохраняет все пять stop effects в текущей БД и принудительно запускает доверенный прежний release с **обоими** `ASSESSMENT_MODE=OFF` и `ASSESSMENT_SYNTHETIC_ENABLED=false`, независимо от положительных значений в родительском окружении. Он не откатывает БД, не переоформляет участие и не восстанавливает разрешения.

```text
node --import tsx scripts/beta-rollback.ts --release-dir=<EXTERNAL_PRIOR_RELEASE_DIRECTORY> --entry=<RELATIVE_NODE_SERVER_ENTRY> --apply --target-id=<TARGET_ID>
```

Это запуск известного доверенного Node entrypoint отдельного release; каталог и entrypoint проверяются через realpath, файл должен находиться в release вне текущего checkout. Для исполняемого TypeScript entrypoint добавляется `--typescript`, и loader получает tsconfig именно старого release. Launcher не собирает и не развёртывает release, не переключает внешний ingress и не завершает чужие процессы. Развёрнутые workers останавливаются оператором до переключения трафика; инструменты актуальной версии для beta-экспорта, удаления и восстановления сохраняются, поскольку старый pilot не знает новых форм/таблиц. Возврат к beta-функциям выполняется через актуальную версию и отдельное явное снятие остановок; положительные права сами не появляются.

```text
node --import tsx scripts/beta-restore.ts backup --path=<PRIVATE_NEW_BACKUP_FILE> --apply --target-id=<SOURCE_TARGET_ID>
node --import tsx scripts/beta-restore.ts restore --path=<PRIVATE_BACKUP_FILE> --apply --target-id=<DISTINCT_EMPTY_TARGET_ID>
node --import tsx scripts/beta-ops.ts health
```

Backup делает транзакционную копию перечисленных beta collections, сохраняет BSON-типы через EJSON и identity отдельного журнала; сессии и токены discovery в копию не входят. Bundle содержит личные данные, не шифруется данным скриптом и требует утверждённого шифрованного хранилища/ACL оператора. Не использовать git/artifact hosting. Срок поддерживаемого восстановления — 7 дней. Журнал с отдельным стабильным ключом и metadata identity должен восстанавливаться независимо и покрывать все эти копии; TTL минимальных tombstones 37 дней.

Restore отказывается работать в исходный или непустой target. До первой вставки сохраняется закрытый recovery gate. Затем восстанавливаются записи, проверяется identity журнала, применяются более поздние удаления и отзываются все старые положительные настройки. Missing journal, сменившаяся identity/ключ или backup вне горизонта не дают открыть reads/exports. После успешной сверки stop switches остаются закрытыми. Оператор проверяет application-level controls в настоящей сессии и только затем явно снимает остановку и переоформляет разрешённое участие. Если restore прервался до reconciliation, target остаётся закрытым; для повторного упражнения используется новая пустая копия. Никогда не переносить synthetic записи в PRIVATE_BETA.

Локальный скрипт `beta-ops.integration.ts` действительно восстановил копию в отдельную БД и проверил удалённого участника/его источники, отозванные права, application owner-controls и отказ без журнала. В ходе разработки измерено 313 мс на restore, возраст копии 125 мс для маленького synthetic набора. Эти числа — один локальный замер, не RPO/RTO целевой системы. Целевой backup cadence/RPO и RTO должны быть выбраны оператором и измерены на его защищённой topology; отсутствие такой проверки остаётся внешним gate.

## Воспроизводимая локальная проверка

```text
node --import tsx scripts/beta-ops.integration.ts --mongod=<ABSOLUTE_MONGOD_BINARY>
```

Альтернатива — переменная `BETA_MONGOD_PATH`. Runner выбирает свободный loopback-порт, создаёт собственный временный каталог и replica set, проверяет фактический dbPath/replica identity до инициализации, создаёт отдельные primary/recovery/restore БД и завершает только собственный процесс с проверенной очисткой каталога. Не читает `.env`, не выбирает production target. Логи тестов содержат только synthetic assertions и операционные измерения. Финальное подтверждение и tested-tree identity берутся из общего beta execution record текущего запуска, а не из этого описания.

В этом же запуске `scripts/lib/beta-admission-http.ts` поднимает настоящий TCP HTTP-listener и вызывает действующие Next exports регистрации, настроек, отзыва и поддержки. Проверяются session/origin guards, строгая схема, приглашённый совершеннолетний synthetic участник, отказ несовершеннолетнему и не включённому в список, повтор регистрации после потери ответа, раздельные настройки, чужой/stale viewer intent, изоляция поддержки и управление после отзыва/OFF. Это проверка route/service/Mongo wiring; она не подменяет настоящий OAuth или разрешение real target.

Операционные проверки также запускают настоящий `beta-ops.ts` отдельным процессом: без `--apply` или с другим target приглашение/чтение обращения отклоняются; корректное приглашение, регистрация и отзыв меняют устойчивые записи. Две одновременные попытки при 99 занятых местах допускают ровно одного участника до лимита 100. `support-read` создаёт только выбранный приватный файл и событие аудита, не выводит текст/вложения в stdout. Publication stop, feature stop, OFF и последующие новые worker-процессы не восстанавливают отозванные права.

Для BETA-123 этот же suite извлекает закреплённый Git archive базового `e61642a3b78b9c088dfb0496677c00cf2217ab3f` во внешний собственный temp-каталог и сверяет байты старых access/run/comparison-модулей с Git. Только проверочный entrypoint копируется из текущего дерева; его импорты разрешаются в старые `src/` и tsconfig. Установленные зависимости подключаются ссылкой, которая удаляется до очистки каталога. Настоящий прежний код дважды выполняется отдельным Node/tsx процессом через rollback launcher: при отозванном участнике старые read/start/положительные разрешения/comparison/materialize отклоняются, owner-controls не выдают ответы, документы прав/источников/очереди остаются неизменны. Отдельно проверяются отказ без `--apply` и при чужом target, сохранение stop effects и неизменность пользовательского Git index. Отсутствующий pinned Git object — ошибка теста; CI получает полную историю. Это исполнение прежних исходных модулей, а не mock их guards; переключение реального production ingress этим локальным тестом не заявляется.

`node --import tsx scripts/beta-session.selfcheck.ts` выполняет реальные клиентские `sessionEvents`, `http`, `authApi` и `useAssessmentResource` с контролируемым fetch и React/EventTarget adapter. Девять именованных проверок воспроизводят очистку remembered bearer при cross-tab revision, отказ позднему response/exchange, смену сессии при чтении body, консервативную очистку после неудачного logout, hide/resume/смену аккаунта, stale submit, конкурирующее сохранение, отмену identity preflight до write callback и unmount. Adapter не считается browser history, native accessibility или Discord smoke evidence.

Отдельная нагрузка с неизменённым proposed profile:

```text
node --import tsx scripts/local-acceptance.ts --mode=integration --suite=beta-load --mongod=<ABSOLUTE_MONGOD_BINARY>
```

Это 25 виртуальных пользователей, 10 предложенных HTTP-запросов в секунду в течение 120 секунд и два отдельных worker-процесса. Сохраняются 300 изменений формы, выполняются по 300 profile/current/scenario запросов. TCP-listener передаёт настоящие запросы действующим Next route exports и MongoDB, сохраняя session/origin guards. Этот слой назван HTTP adapter, а production Next hosting/browser проверяются отдельно. Сценарий здесь действительно рассчитывается синхронно в установленном bounded budget; измерение не называется временем выдуманной async-очереди.

`BETA_EVIDENCE_DIR` задаёт абсолютный внешний каталог артефактов; иначе создаётся собственный каталог в OS temp. Выход внутри source tree отвергается. `BETA_LOAD_RESULT.json` содержит p50/p95/p99, все категории ответа, предложенную и фактическую частоту, scheduler delay, queue age/depth/recovery и проверки потерянных подтверждённых записей, дубликатов, stale fence и запрещённого payload. Во время разработки 1200/1200 запросов прошли, p95 save/profile/current/scenario составили 160.94/112.27/120.66/133.23 мс, ошибок и обнаруженных нарушений этих четырёх инвариантов было 0, очередь после нагрузки очистилась за 4.404 секунды. Это exploratory synthetic run; финальные значения и identity назначает только общий финальный runner.

См. [ADR-009](ADR/ADR-009-private-beta-settings-and-recovery.md), [SECURITY](SECURITY.md), [API_CONTRACTS](API_CONTRACTS.md) и общий release-readiness report. Платформенное разрешение, настоящий OAuth/iframe smoke, native accessibility, содержательное/правовое решение, защищённые backup/alert инфраструктуры и фактическое операторское включение не симулируются тестовым флагом.
