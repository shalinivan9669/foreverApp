# Закрытая бета: проверка, идентичность и пределы выводов

Все 126 требований из переданного v2 сохранены без изменения формулировок в `assessment/BETA_ACCEPTANCE.requirements.json`. Требования gates сохранены отдельно в `assessment/BETA_RELEASE_GATES.requirements.json`. Старый `assessment/ACCEPTANCE.json` — reported результат прошлого запуска, а не новый PASS. `beta-check` помещает оригинал и новый execution в разные поля отчёта.

## Одна воспроизводимая команда

```text
npm ci
npm run beta:check -- --mongod=<ABSOLUTE_MONGOD_BINARY> --browser-module=<ABSOLUTE_PLAYWRIGHT_MODULE> --output=<EXTERNAL_EVIDENCE_DIRECTORY>
```

Node/Next/React/Mongoose и инструменты приложения устанавливаются по lockfile. Playwright 1.61.0 с Chromium и MongoDB Community replica-set binary — отдельные инструменты тестовой среды, не production dependencies. Пути передаются аргументами или `LOCAL_ACCEPTANCE_MONGOD` / `BETA_PLAYWRIGHT_MODULE`; путь конкретного компьютера в исходниках отсутствует. Установка браузера описана в [официальной документации Playwright](https://playwright.dev/docs/browsers), MongoDB для Ubuntu — в [официальном руководстве](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/).

CI workflow устанавливает приложение через `npm ci`, запускает те же проверки и сохраняет артефакт даже при ошибке. Локальная команда проверяет lint, types, agent boundaries, сохранённые 86+97 reference checks и профильные pure/component selfchecks, production build, HTTP/Mongo, ops/restore, 120-секундную нагрузку и настоящий Chromium. Запуск workflow на удалённом сервере не заявляется выполненным без его настоящего run URL.

`--scope=code` явно пропускает DB/ops/load/browser и не подтверждает implementation readiness. Пропуск записывается как NOT_RUN; он не превращается в зелёный полный прогон.

## Собственная тестовая среда

Harness создаёт новый временный dbpath и уникальную MongoDB replica set, проверяет фактический `getCmdLineOpts` перед инициированием и убирает только созданные им процессы и данные. Наличие рабочих `.env` приводит к отказу без чтения/переименования. Нельзя подставить рабочий URI вместо `mongod`. HTTP-тесты используют настоящие route exports с guards, сервисами и MongoDB; это отдельно обозначенный route adapter. Browser-тест использует production Next server и реальные cookie/CSRF/HTTP маршруты.

Bootstrap-порт тестового harness выпускает cookie только двум заранее созданным synthetic subjects и работает исключительно на loopback. `/same-origin/a` и `/same-origin/b` используют один cookie host для воспроизведения смены аккаунта. Эти маршруты находятся в `scripts/local-acceptance.ts`, отсутствуют в App Router и не попадают в production deployment. Проверка реального Discord/OAuth не подменяется bootstrap.

Операционный тест действительно запускает два отдельных worker процесса, webhook listener и восстановление в отдельную базу с независимым ledger. Нагрузочный тест предлагает 10 HTTP запросов в секунду 25 виртуальным пользователям в течение 120 секунд. Он считает p50/p95/p99 и ошибки отдельных путей, подтверждает целостность записей и опустошение очереди. Это локальное измерение, не SLA. Raw answers, cookie, bearer и backup contents не должны попадать в публичный evidence.

## Что означает результат

`report.json` содержит runId, runtime и hash бинарника MongoDB, результаты команд, layer и именованные assertions. Manifest до и после охватывает tracked и new source files; совпадение SHA-256 обязательно. `private-beta.patch` включает новые файлы, фактически применяется к HEAD во втором временном Git index и сверяется со всеми ожидаемыми путями и нормализованными blobs, не меняя рабочий index. Изменённое после теста дерево не получает прежнюю identity. Canonical path/junction-проверка запрещает evidence внутри исходников; каталог с прежними receipts не переиспользуется.

Coverage maps привязывают требования к точным assertions, отдельно перечисляя непроверенные части. Наличие тестового файла не является результатом его запуска. Counts генерируются из cases; readiness не вычисляется из процента успешных проверок. Implementation, environment и фактическое открытие — три разных поля. Недописанная функция или неисполненный автоматический тест не называются внешним gate.

Receipt учитывается только после успешного завершения исходного script/suite. Имена совпадающего теста из другого процесса, running/failed строки и неподписанное происхождение не засчитываются. Результаты двух браузерных сценариев дополнительно связаны с runId и sourceIdentity. Исторические evidence64 INT сохраняются отдельно от свежих результатов. Набор `beta-check.integrity.selfcheck.mjs` воспроизводит поддельные/colliding receipts, symlink escape, неполный patch, изменённый source и teardown timeout.

Нативный screen reader требует реального прохождения задания, ошибки, review и управления. DOM и SSR этого не доказывают. `prefers-reduced-motion` проверяется в браузерном media engine отдельно от assistive method и не включает подсказку. History trial хранит фактический `pageshow.persisted`: обычный back/forward не называется bfcache. Реальные OAuth/Discord, content/privacy/platform review, target restore/alerts и явное разрешение оператора остаются внешними до получения подлинных доказательств.

Проверка масштаба использует настоящий `chrome.tabs.setZoom` в отдельном временном профиле Chromium: 1280px становятся 640px при200% и320px при400%. Это не CSS transform и не pinch zoom. Временное расширение с разрешением tabs создаётся только тестом, после закрытия браузера его профиль удаляется. Оно не входит в приложение. Сетевой конфликт создаётся реальным параллельным изменением ревизии;429 явно внедряется на HTTP-границе браузера для проверки сохранения ввода. Потерянный ответ от уже сохранённой записи и offline проверяются отдельно.

## Исправленные регрессии и воспроизводимость

Поле `report.releaseGates` содержит свежую оценку всех12 неизменённых требований gates: общий статус, `codeStatus`, `externalStatus`, ссылки на текущие cases/команды и причины ограничения. G01–G04 требуют исполненных кодовых доказательств; смешанные gates сохраняют отдельные непроведённые native и внешние части. Даже подмена входного флага готовности не даёт evaluator объявить готовую среду или фактическое открытие.

- `assessment-ui.selfcheck.ts` воспроизводит очистку данных перед pagehide; private hooks очищают DOM синхронно и перепроверяют пользователя при возврате.
- Смена сессии передаёт между вкладками только случайный invalidation marker; встроенный bearer привязан к локальной версии и не используется после смены.
- Несохранённое обращение и выбранные результаты принадлежат компоненту текущего owner; поздний ответ не восстанавливает личные поля другого пользователя.
- Сохранённые INT-019/026/027 и INT-021 нашли несовместимость композиции: draft без completed source снова имеет null snapshot, а single-source revision сохраняет старый смысл отдельно от source-set revision. Исходные assertions сохранены.
- Подтверждённая запись с потерянным HTTP ответом и настоящий offline проверяются отдельно от обычной успешной загрузки. Повтор использует тот же operation intent.
