# Закрытая бета — состояние выполнения

Режим задачи: `FEATURE_CHANGE`. Реализация B01–B12 находится в исходном дереве I01–I04. Этот документ описывает состав изменения; проверенную identity, свежие статусы каждого требования и readiness создаёт [единый runner](BETA_VERIFICATION.md) во внешнем `report.json`.

## Исходная идентичность

- Ветка: `codex/dom-s07-assessment-vertical`.
- HEAD: `e61642a3b78b9c088dfb0496677c00cf2217ab3f`.
- Git tree: `ed48b664a60e7a81ef1ad25fc090a66d59e15a8f`.
- Рабочее дерево до правок: чистое; 830 файлов в baseline manifest.
- SHA-256 manifest: `9c5b34c52cce8b71394c247c8dbde2d4284aed8cc6ac1012c14e7d6c184f9413`.
- Baseline и исходный пустой patch сохранены вне приложения в соседнем каталоге `foreverApp-private-beta-evidence-20260910`.
- Пакет распакован вне приложения; `verify_packet.py`: 20/20. Это только проверка пакета.

## Рабочие блоки

| Блок | Реализованный контур | Основное доказательство |
| --- | --- | --- |
| B01 | Baseline, отдельная история64 INT, same-origin invalidation и owner preflight | Immutable delivery, actual-hook и browser assertions |
| B02 | 9 основных +1 дополнительная beta-форма трёх тем; прежняя форма сохранена | Registry/content, реальные HTTP формы, browser |
| B03 | Раздельные K/D/A/negative, совместимые источники, один root, CAS и история | Source composition HTTP/Mongo и preserved reference183 |
| B04 | Цель, один следующий модуль, сохранённые формы, отказ, практики, профиль | Planner, HTTP, actual component и browser |
| B05 | Прямые условия, unknown/0, конечные окна, ресурс и IANA/DST | Domain/schema, HTTP и browser round-trip/focus |
| B06 | Два шаблона, совместный текущий план и отдельные условные действия | Domain/reference и фактические Pair HTTP/browser |
| B07 | Bounded feed существующих карточек, свежие grants, добровольный контакт | Реальные Mongo/HTTP лента и LikeComposer browser |
| B08 | Авторская редакция, две подписи, повторения, отдельные отчёты, личные заметки и inbox reminders | Pair HTTP, concurrent workers и два browser-контекста |
| B09 | OFF/SYNTHETIC/PRIVATE_BETA, приглашения, один экран выбора, support, отзыв/экспорт/удаление | Actual admission HTTP, protected CLI и privacy/session tests |
| B10 | Durable queue, leases/fencing/retry, worker, additive migrate, separate-ledger restore и alerts | Два процесса, fault injection, физическое восстановление и load |
| B11 | Навигация, клавиатура, фокус, 320px, настоящий Chrome zoom200/400, reduced motion, сеть и смена аккаунта | Production Next + Chromium + owned MongoDB; native AT отдельно |
| B12 | Одна команда и CI workflow, строгая привязка receipts, два manifests и воспроизводимый patch | Adversarial runner tests, actual alternate-index replay и final report |

Наличие реализации или имени теста не является PASS. Старые INT и reported результаты сохраняются отдельно от новой матрицы. `implementationStatus`, общий статус требования и внешние prerequisites различаются. Все свежие результаты относятся к одному runId и SHA-256 source manifest. Patch фактически применяется к отдельному index и сравнивается с каждым ожидаемым нормализованным Git blob; рабочий index пользователя не изменяется.

Дополнительная форма уточнения DOM.S07 проверяет повторное описание уже известного эпизода через другой источник. Она не создаёт лишнего подтверждения и не включается в прежние сохранённые разрешения автоматически. Все54 определения сохранены; 51 тема без готовой рубрики остаётся неизвестной.

## Ограничения исполнения

Push/merge/deploy, рабочие migration apply и приглашение реальных людей не разрешены. OFF/SYNTHETIC сохраняются. Внешние проверки native AT, разрешённой OAuth/Discord поверхности, data-flow review и операторского открытия учитываются отдельно; кодовые недоделки не помечаются внешними блокерами.

Действия оператора start/stop/publication stop/invite/revoke/backup/restore/rollback описаны в [BETA_OPERATIONS.md](BETA_OPERATIONS.md). Проверка формулировок и её границы — в [BETA_COPY_REVIEW.md](BETA_COPY_REVIEW.md). Исходные условия gate-файла не являются полученным разрешением.
