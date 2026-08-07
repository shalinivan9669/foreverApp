# P0 two-user manual E2E

Этот сценарий выполняется на отдельном pilot-окружении с MongoDB replica set и двумя новыми Discord-аккаунтами `A` и `B`. Не используйте реальные чувствительные ответы. Секреты, cookies и invite token не копируются в логи или баг-репорты.

## Подготовка

- Открыть приложение каждым аккаунтом в отдельной Discord-сессии/профиле браузера.
- Убедиться, что оба аккаунта не состоят в active/paused Pair и не имеют незавершённых тестовых данных.
- Открыть DevTools Network только для проверки формы DTO; не включать сохранение request body.

## Auth, onboarding и invite

1. `A` и `B` входят через Discord. После повторного входа приложение должно восстановить допустимый lifecycle step.
2. Оба подтверждают 18+, добровольность и privacy policy, отвечают на обязательные закрытые вопросы и завершают `/mvp-onboarding`.
3. Прервать onboarding `B` после нескольких ответов, войти повторно и проверить восстановление cursor и сохранённых answer revisions.
4. `A` создаёт приглашение. Проверить 72-часовой expiry, copy/share, отсутствие token в query string, localStorage, sessionStorage и server logs.
5. Попытка `A` принять собственную ссылку должна завершиться generic unavailable state без создания Pair.
6. `B` открывает `/join#token=…`, подтверждает присоединение; только после этого создаётся active Pair.
7. Повторный accept тем же `B` идемпотентно возвращает ту же Pair; попытка использовать ссылку третьим аккаунтом не раскрывает владельца, Pair id или причину отказа.
8. Параллельно принять два разных invite одним аккаунтом. Ровно одна транзакция должна создать membership claim/Pair, вторая — получить generic conflict.
9. Cancelled/expired/reissued link недоступны; после refresh raw link не восстанавливается, reissue создаёт новый.

## Weekly cycle и privacy

1. В cycle 1 сначала отвечает `A`: `A` видит свой exact owner result, `B` — только факт ожидания; Pair Summary не содержит чисел или сигналов.
2. Затем отвечает `B`: создаётся одна immutable snapshot revision; Pair Summary содержит максимум четыре qualitative signals и neutral reason/next-step keys.
3. В cycle 2 повторить порядок `B → A`. Результат не зависит от роли/порядка участников.
4. Отправить одинаковый submit повторно и два concurrent submit: не должно появиться второго check-in/effect/snapshot для одной revision.
5. Проверить `INSUFFICIENT_DATA`, partial/expired fallback и второй ответ, пришедший до server deadline: старая snapshot остаётся неизменной, новая revision становится текущей. Отдельно проверить, что после deadline незавершённый cycle становится `EXPIRED`/`INSUFFICIENT` и больше не принимает submit.
6. В Network убедиться, что pair DTO не содержит raw answers, private note, exact peer values, averages, divergence, global score, passport или legacy matching answers.
7. Прямой вызов `/api/pairs/{pairId}/diagnostics` возвращает только `410 PAIR_DIAGNOSTICS_RETIRED`; страница diagnostics не загружает старый passport/insights и ведёт к Pair Summary.

## Recommendation, activity и feedback

1. Получить primary recommendation и проверить neutral explanation/reason code без внутренних метрик и safety reason.
2. Выполнить `replace`: появляется не более одной replacement со ссылкой на предыдущее решение; повторный replace отклоняется.
3. Выполнить `skip`: решение становится skipped, Pair не получает штраф/скрытое ухудшение.
4. Принять recommendation повторно с тем же idempotency key: создаётся ровно одна PairActivity.
5. Завершить activity; сначала feedback даёт `A`. Статус становится partial, `B` не видит exact значения/текст `A`.
6. Поздний feedback `B` идемпотентно уточняет completion без повторного применения effect и без заявления causal effect.
7. History light показывает дату/status cycle, ранее раскрытый qualitative summary, activity status и факт feedback — без private payload и без пересчёта старой snapshot новой версией.

## Canonical compatibility verification

- Concurrently request `/api/pairs/{pairId}/recommendations`, `/suggest`, `/activities/suggest`, `/api/activities/next`, and the allowlisted `/activities/from-template` fallback. Every successful response must reference the same single decision-backed offered activity; no second visible or orphan offer may remain.
- Accept a Pair Event and verify that it changes only event state, returns `activities: []`, and does not create an activity outside the canonical recommendation flow.

## Safety veto

1. `A` включает `/profile/safety`; `B` не видит факт, причину или partner-visible notification.
2. Новая рекомендация использует только allowlisted neutral low-effort fallback. Попытка принять ранее offered sensitive activity возвращает generic unavailable.
3. Safety flag не меняет Pair Summary, compatibility/ranking и audit payload не содержит объяснение/ответы.
4. `A` отключает veto; owner control восстанавливается после повторного входа, изменение присутствует в operator audit только как boolean state.

## Финальная фиксация

- Записать environment/build SHA, время, аккаунты-псевдонимы и pass/fail каждого пункта.
- Приложить только sanitized response field lists и screenshots без token/answers.
- P0 не помечать завершённым, пока весь сценарий не пройден на двух новых аккаунтах.
