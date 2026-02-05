# Поток анкеты (DB → API → UI)

## Сущности и коллекции
- `Questionnaire` (`questionnaires`): анкеты с вопросами и метаданными.
- `Pair` (`pairs`): пара, `members` — Discord IDs.
- `PairQuestionnaireSession` (`pair_qn_sessions`): сессии парного прохождения анкеты.
- `PairQuestionnaireAnswer` (`pair_qn_answers`): ответы на вопросы (A/B).

## 1) Получение карточек
**UI → API**
- `GET /api/questionnaires/cards`
- Auth: httpOnly cookie `session` (JWT)

**API → DB**
- `Questionnaire.aggregate()` → `questionCount = $size(questions)`
- `Pair.findOne({ members: userId, status: 'active' })`
- `PairQuestionnaireSession.find({ pairId, status: in_progress|completed })`
- `PairQuestionnaireAnswer.aggregate()` по sessionId + by

**DTO → UI**
- UI получает `QuestionnaireCardDTO[]` и строит карточки анкеты.

## 2) Start/Resume анкеты
**UI → API**
- `POST /api/pairs/:id/questionnaires/:qid/start`

**API → DB**
- Проверка пары
- Поиск существующей `in_progress` сессии
- Иначе создание `PairQuestionnaireSession`

## 3) Отправка ответов
**UI → API**
- `POST /api/pairs/:id/questionnaires/:qid/answer`

**API → DB**
- Проверка активной сессии
- Запись `PairQuestionnaireAnswer` (sessionId, questionId, by, ui)

## 4) Прогресс и завершение
- Прогресс считается по уникальным `questionId` в рамках `sessionId` и `by`.
- Статус `completed` фиксируется в `PairQuestionnaireSession.status`.

## Evidence (path:line)
- `Questionnaire`: `src/models/Questionnaire.ts:23,33,51-62`
- `Pair.members`: `src/models/Pair.ts:16,51`
- `PairQuestionnaireSession`: `src/models/PairQuestionnaireSession.ts:4-22`
- `PairQuestionnaireAnswer`: `src/models/PairQuestionnaireAnswer.ts:4-21`
- Start session: `src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts:30-47`
- Answer write: `src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts:33-43`
- Cards endpoint: `src/app/api/questionnaires/cards/route.ts:109-190`

## Примечания
- Auth основан на JWT в httpOnly cookie `session`.
- `sub` в JWT = Discord userId.
- `meta.isStarter` используется для пометки стартовых анкет.
- Приоритет статусов: in_progress > completed > required > new; locked для парных анкет без пары.
