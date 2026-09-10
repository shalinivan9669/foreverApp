# DOM.S07 — состояние реализации

Исходная проверенная база: `main`, HEAD `3b8c71e901846af7f61ad5c8f7a7a8bfc2434bc7`, чистое рабочее дерево. Работа выполняется в `codex/dom-s07-assessment-vertical`. Исторический SHA подтверждён независимо.

`HANDOFF_DIR = C:\Users\Admin\Downloads\vmeste-handoff-work-20260909\VMESTE_CODEX_HANDOFF_v1`.

## Область результата

Классификация: `FEATURE_CHANGE`. Реализована ограниченная вертикаль DOM.S07 внутри существующего приложения: реальные API, сессии, MongoDB, профиль и UI. Добавлены новые API/DTO и отдельные synthetic модели. Общая модель аутентификации не изменена; работа чувствительна к разрешениям и приватности. Зависимости и lockfile не изменены, новые allowlist-исключения не добавлены.

| Этап | Реализация | Подтверждение |
| --- | --- | --- |
| I01 | Одно ядро v0.2/v0.3, каталоги, публикация, typed ответы, отдельные положительные/отрицательные показатели | Reference 183, content 40, boundaries 65 |
| I02 | Предъявления и ответы на сервере, пауза/продолжение, ревизии, восстановление snapshot, штатный профиль, экспорт/удаление | 17 HTTP/Mongo IDs; браузер UNKNOWN/пауза/профиль/выход/ошибка связи |
| I03 | Канонические разрешённые источники, собственные предложения и ресурс, текущий расчёт, отдельный конечный поиск сценариев | 16 HTTP/Mongo IDs, pure boundaries; браузер одного барьера и условного плана |
| I04 | Две подписи конкретной версии, отзыв, независимые отчёты, новые наблюдения с сохранением прежнего текущего источника | 12 HTTP/Mongo IDs; браузер двух сессий и противоположных оценок |

Полный реестр 64 требований с неизменёнными исходными условиями, ожиданиями, путями тестов и фактическими статусами: [assessment/ACCEPTANCE.json](assessment/ACCEPTANCE.json). Итог: **63 PASSED, INT-024 PARTIALLY_VERIFIED**. Reference-проверки, React/SSR-проверки, HTTP/Mongo и браузер учитываются отдельно. Все 64 полностью пройденными не объявляются: INT-024 имеет явно указанную границу проверки средств доступности. Полный перечень изменённых файлов: [CHANGED_FILES.json](assessment/CHANGED_FILES.json).

## Выполненные команды

| Команда | Результат |
| --- | --- |
| Исходный `scripts/verify_handoff.py` через внешний Node TAP-wrapper | PASS: пересборка, 86 + 97, равенство demo, 75 исходных файлов без изменения hash |
| `node scripts/assessment-reference/run.mjs` | PASS: 86 + 97 и сохранность каталогов |
| `node --import tsx scripts/assessment-content.selfcheck.ts` | PASS: 40 |
| `node --import tsx --test scripts/assessment-reference/boundaries.test.mjs` | PASS: 65 |
| `node --import tsx scripts/assessment-ui.selfcheck.ts` | PASS: 33, настоящий React hook с тестовым транспортом |
| `node --import tsx scripts/assessment-profile-ui.selfcheck.ts` | PASS: 18, настоящий normalizer и SSR компонентов |
| `node --import tsx scripts/assessment-privacy-ui.selfcheck.ts` | PASS: 26, настоящий React hook с тестовым транспортом |
| `node --import tsx scripts/local-acceptance.selfcheck.ts` | PASS: аргументы, изоляция окружения и очистки |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS: весь проект |
| `node node_modules/eslint/bin/eslint.js .` | PASS: весь проект |
| `node --import tsx scripts/agent-checks.ts --changed-only --compact` | PASS: 0 ошибок, 0 предупреждений, 1 информационное напоминание о context budget |
| `git diff --check` | PASS; только уведомления Git о LF/CRLF |

На Node 24 исходному verifier нужен явный TAP reporter: внешний wrapper меняет только способ запуска Node. Оригиналы reference не правились. Отчёт исходной проверки: `HANDOFF_DIR/verification/current-tap/summary.json`.

Команда реальной приёмки (последний прогон после исправления source-delete → own Direct controls):

```powershell
node --import tsx scripts/local-acceptance.ts --mongod 'C:\Users\Admin\AppData\Local\Temp\vmeste-mongo-20260905\mongod.exe' --suite=assessment --mongo-port=27039
```

Результат: exit 0, 45 IDs. I02 — INT-013…023, 026…030, 032; I03 — 033, 035…042, 044…050; I04 — 051…054, 056…062, 064. Настоящие route handlers, два SessionSubject/User, Pair через invite/confirm, MongoDB replica set и транзакции. Включены конкурентные удаления/отзывы/блокировки, чужой intent, бюджет поиска, некорректный cache, сохранение источника до snapshot, chronology и FOLLOWUP. Тестовый инструмент завершил собственные процессы и очистил базу.

Сборка выполнялась с очищенным окружением локального инструмента, без чтения рабочих секретов:

```powershell
node --input-type=module --import tsx -e 'import {spawnSync} from "node:child_process"; import {localAcceptanceEnvironment} from "./scripts/lib/local-acceptance-options.ts"; const result = spawnSync(process.execPath,["node_modules/next/dist/bin/next","build"],{stdio:"inherit",windowsHide:true,env:{...localAcceptanceEnvironment(process.env),NEXT_TELEMETRY_DISABLED:"1"}}); process.exit(result.status ?? 1);'
```

Next.js 16.3: компиляция, TypeScript и генерация 84 страниц прошли. Это локальная проверка сборки, не deployment.

Промежуточные ошибки устранены: strict TypeScript выявил ошибочное сужение тестового состояния до null после добавления регрессии; тест теперь заново читает и проверяет типы полей, без ослабляющих casts. Сборка повторена до exit 0. После неуспешной сборки local harness штатно отказал в запуске браузера (`LOCAL_ACCEPTANCE_PRODUCTION_BUILD_REQUIRED`); после успешной сборки финальный браузерный запуск прошёл. Это сработавшая проверка подготовленности локального запуска.

## Фактическая браузерная проверка

```powershell
node --import tsx scripts/local-acceptance.ts --mongod 'C:\Users\Admin\AppData\Local\Temp\vmeste-mongo-20260905\mongod.exe' --mode=browser --scenario=assessment --mongo-port=27049 --app-port=3166 --partner-app-port=3168 --login-port=3167
node --import tsx scripts/local-acceptance.ts --mongod 'C:\Users\Admin\AppData\Local\Temp\vmeste-mongo-20260905\mongod.exe' --mode=browser --scenario=assessment-ready --mongo-port=27049 --app-port=3166 --partner-app-port=3168 --login-port=3167
```

`assessment` начинался без ответов. Клавиатурой выбраны отсутствие опыта и пропуски, проверен обзор реально сохранённого ответа, пауза через настоящий профиль, продолжение и завершение. Профиль показал неизвестные K/D/A и отрицательные показатели без подстановки нулей. Выход A через настройки очистил представление; вход B в том же браузере показал пустой собственный источник. Фикстуры используют разные origins; смена cookie между GET и POST отдельно проверена реальными HTTP-тестами.

Потеря связи проверена настоящей остановкой локального сервера после выбора несохранённого ответа B. UI сохранил выбор, оставил 0 сохранённых ответов и сообщил «Сохранение не подтверждено». Ложного saved не появилось. Подтверждённая ранее запись A была отдельно восстановлена через паузу/возврат.

`assessment-ready` подготовил A=3/B=0 через реальные опубликованные вопросы и сервисы. Сравнений, сценариев, соглашений и отчётов в фикстуре не было. В браузере созданы текущий результат с разными направлениями, отдельный поддержанный сценарий, предложение и два независимых подтверждения одной версии. Закрытый отчёт B сначала не раскрывался A. После отдельных разрешений общий вид сохранил A «Нагрузка подходит хорошо» и B «Нужно изменить нагрузку», без усреднения; текущая неполная неделя не создала тренд. Конкурирующая запись получила конфликт без ложного сохранения. Новая серия B оставила прежний уровень 0 в штатном профиле.

INT-024: проверены доступные имена в accessibility tree, Enter/Space, отсутствие drag/таймера, видимый фокус 2px и переносы при ширине 320px (scrollWidth 305px). Проверено существующее CSS-правило `prefers-reduced-motion`. Реальный запуск NVDA/Narrator и переключение системного reduced-motion не выполнены: native computer API отсутствует. Эта часть остаётся частично проверенной, а не объявляется полноценным accessibility audit.

После обнаруженного browser-регрессией конфликта `beforeUnload` переход `observe` заменён на событие обновления источника с повторной проверкой сессии. В заключительной сборке повторены current → scenario → предложение → отдельные подтверждения A/B → новый черновик B: 0 из 6 доступных ответов показаны без перезагрузки и диалога ухода. Дополнительно через UI выполнены удаление Run B → явное чтение controls → удаление оставшихся Direct B → отзыв своего участия. Все операции получили подтверждение сервера. Настройки экспорта ведут в существующий `/profile/settings`.

Все созданные MongoDB/Next/browser harness процессы остановлены штатным `/stop`; получены `202` и `cleaned-up`, exit 0. Системные настройки браузера не оставлены изменёнными; временный viewport сброшен.

## Границы и следующая задача

- Рабочая Matching-лента, production processing, deployment, реальные миграции и AI не включались. Серверный флаг по умолчанию выключен; дополнительно нужны loopback test DB и synthetic cohort.
- Реальный Discord OAuth/iframe, мобильные устройства и native screen reader не проверялись локальным инструментом. Синтетические сессии не доказывают Discord-приёмку.
- Методика и пороги остаются авторскими и некалиброванными. Для COM.S02/COM.S04 сохранены рубрики, но формы не опубликованы; они явно неизвестны.
- DOM.S07 использует самостоятельные канонические источники без fallback к legacy factor/measurement и без конвертации в старый scalar. Полное удаление других действующих продуктовых потоков не выполнялось и не заявляется: их функции не входят в эту ограниченную вертикаль.
- Следующая конкретная задача: завершить оставшуюся ручную часть INT-024 на native screen reader с системным reduced-motion; затем добавить вторую независимую публикацию DOM.S07 для новых K/D наблюдений на тот же серверный контур, сохранив раздельные фазы и synthetic gate.
