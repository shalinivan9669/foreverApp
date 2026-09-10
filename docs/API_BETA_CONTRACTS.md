# API закрытой беты B01–B12

Общие session/CSRF/resource guards, envelope `{ok,data}` / `{ok:false,error}` и обработка no-store сохраняются. Session subject задаётся только auth; клиент не выбирает владельца через query/body. Strict Zod schemas отвергают лишние поля. Идентификаторы ниже — имена contracts, не разрешение на использование чужого ресурса.

| Маршрут | Операции и собственный DTO |
| --- | --- |
| `/api/assessments/settings` | GET: допуск, mode, версии terms/information, сохранённые назначения и scope, конкретный data flow. POST: `viewerToken, expectedRevision, ownerAssessment, discovery, pairSharing, publicationIds`. |
| `/api/assessments/register` | POST: viewer intent, UUID idempotency key, отдельные `termsAccepted`, `adultConfirmed`, точные версии terms/information и необязательные назначения. Только действующее приглашение либо явно изолированный synthetic actor. |
| `/api/assessments/withdraw` | POST: viewer intent + expectedRevision. Отзывает beta membership и зависимые capabilities. |
| `/api/assessments/runs` | GET: точный `publicationId`, необязательный `view=controls`. POST: существующий discriminated AssessmentMutation с publicationId; новая волна имеет завершённый period. |
| `/api/assessments/portfolio` | GET: собственный профиль, публикации, текущая цель/planner, practice catalog и собственные попытки. POST: `goal`, `decline`, `explanation`, `practice-start`, `practice-report` с revision/idempotency/viewer intent. |
| `/api/assessments/direct` | GET: только собственный план; `view=controls` для управления без обычной выдачи. POST `save`, `revoke`, `delete`, expectedRevision/idempotency/viewer intent. |
| `/api/assessments/compare` | POST: необязательный актуальный `candidateGrant`, список опубликованных `actionIds`. Без grant проверяется текущая Pair. Не принимает peerId/actor/effect или произвольные solver assumptions. |
| `/api/assessments/discovery` | GET: bounded limit1–10 и opaque cursor. Карточки берутся из существующей разрешённой matching выдачи и содержат scoped comparison; чужие личные источники не возвращаются. |
| `/api/assessments/pair` | Существующие GET/POST; новые явно authored betaAgreement, own-note, reminders. Два подтверждения одной contentRevision; личный report отдельно от shared status. |
| `/api/assessments/support` | GET: собственные ticket receipts. POST: category CLARITY/INAPPROPRIATE/BUG/PRIVACY, message≤2000, viewer intent и UUID. Необязательный `attachResult:{runId,revision,consent:true}` проверяет собственный finalized/materialized источник. |

## Формы и профиль

Исходная `dom-s07-household-pilot` сохранена. Девять основных beta publication IDs — `dom-s07`, `com-s02`, `com-s04` с суффиксами `-knowledge-beta`, `-task-beta`, `-application-beta`. Отдельная необязательная `dom-s07-application-clarification-beta` содержит две страницы дополнения по бытовым эпизодам и совместима с основной DOM A только в совпадающем разрешённом контексте/периоде/фазе. Всего десять beta-форм и исходный pilot. Новая форма не добавляется в ранее сохранённые `publicationIds` автоматически: требуется явное расширение настроек. Версии immutable; неизвестные rubric/schema/policy/compatibility не получают fallback-разрешения. Metadata и bounds описаны в [BETA_SOURCES.md](BETA_SOURCES.md).

Новый TASK ответ — `STRUCTURED` с полным набором допустимых slots/option IDs, без произвольных оценок. FACTS для новых SELF_REPORT содержит `episode.observedAt` внутри завершённого period и необязательный `sameEpisodeRootId`, выбранный из собственных допустимых `knownEpisodes`. Missing reasons сохраняются раздельно; null не заменяется false/zero.

Owner run может содержать `runId` для явного приложения собственной ревизии в support. `OwnerAssessmentProfileDTO` сохраняет status/snapshot и дополняется `unavailableSkills` с исходными неопубликованными определениями, UNKNOWN/UNAVAILABLE_RUBRIC. Snapshot сохраняет K/D/A отдельно, component provenance, конкретные периоды/контексты, source identities/revisions, freshness, history и отрицательные компоненты с bounds. У единственного источника прежний sourceId/revision сохранён; sourceSetRevision отдельный.

Owner `AssessmentRunDTO.retainedCompletedSource?: 'CORRECTION' | 'FOLLOWUP'` обозначает черновик, при котором продолжает использоваться прежнее завершённое основание. Для beta-коррекции оно атомарно заменяется только при finalize; текущие отзыв и удаление действуют сразу. Исходный household pilot сохраняет прежнюю семантику revise. Поле предназначено для собственного интерфейса, не для раскрытия другому.

Практика и её свободная заметка не являются evidence применения. Сценарий имеет kind HYPOTHETICAL, explicit assumptions и `changesCurrent:false`; current и hypothetical результаты не сливаются. TARGET_SUPPORTED ограничен проверенным каталогом и известными условиями, не является вероятностью отношений. INCOMPLETE/BUDGET_EXCEEDED не означает несовместимость.

## Условия, пара и приватность

Прямой план указывает DOM.S07 или COM.S04, конечный period, IANA timezone, интервалы `[start,end)`, own offer/acceptable/ideal/excluded, независимую willingness, типизированный resource lineage/basis и отдельные бюджеты попыток. COM.S04 имеет канал, privacy, паузу/возврат и личное время. Неуказанный ресурс остаётся unknown. Один bounded документ плана принадлежит человеку; новые условия заменяют предыдущую активную версию и инвалидируют зависимые расчёты.

BetaAgreement имеет две роли, задачи/критерии/ресурс, распределение замечания/планирования/напоминания/проверки, IANA recurrence, completionCriterion и правила пересмотра/выхода. Occurrences сохраняют contentRevision и timezone. Прошедшее время без наблюдения даёт ELAPSED_UNKNOWN, не «выполнено». Own note и reminder settings недоступны партнёру. Отчёт появляется в shared представлении только по собственному отдельному выбору; закрытый отчёт и отсутствие отчёта дают одинаковый чужой DTO.

Центральные настройки, экспорт и удаление доступны в существующем privacy разделе. Старые run/comparison/pair contracts остаются доступными по своим маршрутам и правилам; новые возможности не обходят legacy permission guards. Worker/операторские операции не выставлены в публичные HTTP routes; команды и target fencing в [BETA_OPERATIONS.md](BETA_OPERATIONS.md).
