# PROB-006 Manual API Checklist (2026-02-07)

Use this checklist when validating DTO rollout in an environment with valid session + DB.

## Steps

1. `POST /api/users`  
   Expect: `ok=true`, `data.id`, `data.username`, `data.avatar`; no `__v`, no raw model internals.
2. `GET /api/users/me`  
   Expect: private self DTO (`personal`, `vectors`, `preferences`, optional `profile.onboarding`); no `embeddings`.
3. `GET /api/users/{id}`  
   Expect: public DTO only (`id`, `username`, `avatar`).
4. `GET /api/questionnaires/{id}`  
   Expect: questionnaire DTO (`id`, `title`, `questions[]` mapped), not raw DB shape.
5. `GET /api/questionnaires`  
   Expect: array of questionnaire DTOs; no direct model return.
6. `GET /api/questions?limit=12`  
   Expect: array of question DTOs with canonical `id` (legacy `_id` may exist for compatibility).
7. `GET /api/activity-templates`  
   Expect: array of template DTOs with canonical `id`; no Mongoose metadata.
8. `GET /api/pairs/me`  
   Expect: `pair` as PairDTO (`id`, optional compatibility `_id`), not raw pair document.
9. `GET /api/pairs/{id}/activities?s=current`  
   Expect: array of PairActivityDTO; no raw `_id`-only document shape; check-ins present, answers omitted by default.
10. `GET /api/match/like/{id}`  
    Expect: LikeDTO (`from`, `to`, `decisions`, snapshots), mapped via centralized `toLikeDTO`.

