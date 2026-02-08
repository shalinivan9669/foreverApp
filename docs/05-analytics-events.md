**Current State (Overview)**
1. Analytics/audit events are persisted in `event_logs` via `EventLog`. Evidence: `src/models/EventLog.ts`.
2. `/api/logs` records visits through `logsService.recordVisit(...)`, which emits `LOG_VISIT_RECORDED` using the unified audit runtime. Evidence: `src/app/api/logs/route.ts`, `src/domain/services/logs.service.ts`, `src/lib/audit/emitEvent.ts`.
3. Client still sends fire-and-forget visit call on entry to main menu flow. Evidence: `src/app/page.tsx`.
**Evidence**
| Р¤Р°РєС‚ | РўРёРї | РСЃС‚РѕС‡РЅРёРє (path:line) | Р¦РёС‚Р°С‚Р° (?2 СЃС‚СЂРѕРєРё) |
|---|---|---|---|
| Р’С‹Р·РѕРІ /api/logs РЅР° РєР»РёРµРЅС‚Рµ | ui | `src/app/page.tsx:63` | `usersApi.writeActivityLog().catch(() => {});` |

**РљСѓРґР° РРґС‘Рј (Р¦РµР»РµРІС‹Рµ MVP РЎРѕР±С‹С‚РёСЏ)**
- `user_auth_completed` (РїРѕСЃР»Рµ РѕР±РјРµРЅР° code -> access_token).
- `user_profile_upserted` (POST `/api/users`).
- `onboarding_completed` (PATCH `/api/users/[id]/onboarding`).
- `match_card_updated` (POST `/api/match/card`).
- `match_like_sent`, `match_like_responded`, `match_like_accepted`, `match_like_rejected`, `match_pair_confirmed`.
- `pair_created`, `pair_paused`, `pair_resumed`.
- `pair_activity_offered`, `pair_activity_accepted`, `pair_activity_checkin`, `pair_activity_completed`, `pair_activity_cancelled`.
- `questionnaire_started`, `questionnaire_answered`, `questionnaire_completed`.

**РћР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РЎРІРѕР№СЃС‚РІР° РЎРѕР±С‹С‚РёР№ (Р¦РµР»РµРІРѕР№ Р¤РѕСЂРјР°С‚)**
- `eventId` (UUID), `eventName`, `timestamp`.
- `userId` (РµСЃР»Рё СЂРµР»РµРІР°РЅС‚РЅРѕ), `pairId` (РµСЃР»Рё СЂРµР»РµРІР°РЅС‚РЅРѕ).
- `requestId` (РєРѕСЂСЂРµР»СЏС†РёСЏ), `source` (web/discord/tg).
- `entityId` (activityId, likeId, sessionId) Рё `entityType`.

**Р§С‚Рѕ РСЃРїРѕР»СЊР·СѓРµРј Р”Р»СЏ РџСЂРѕРґСѓРєС‚-РђРЅР°Р»РёС‚РёРєРё**
- Р’РѕСЂРѕРЅРєРё: `user_auth_completed -> user_profile_upserted -> onboarding_completed`.
- Р РµС‚РµРЅС€РЅ: РєРѕР»РёС‡РµСЃС‚РІРѕ `pair_activity_completed` Рё РїРѕРІС‚РѕСЂРЅС‹Рµ `questionnaire_started`.
- РЎРёРіРЅР°Р»С‹ РєР°С‡РµСЃС‚РІР°: СЂР°СЃРїСЂРµРґРµР»РµРЅРёРµ `pair_activity_completed` РїРѕ СЃС‚Р°С‚СѓСЃР°Рј (success/partial/failed).

**Р§С‚Рѕ РСЃРїРѕР»СЊР·СѓРµРј Р”Р»СЏ Audit/Security**
- `user_profile_upserted`, `match_like_*`, `pair_*`, `questionnaire_*`.
- РЎРІСЏР·РєР° `requestId` + `entityId` РґР»СЏ СЂР°Р·Р±РѕСЂР° РёРЅС†РёРґРµРЅС‚РѕРІ.

**PII/РРЅС‚РёРјРЅС‹Рµ Р”Р°РЅРЅС‹Рµ (Р—Р°РїСЂРµС‚С‹)**
- РќРµ Р»РѕРіРёСЂРѕРІР°С‚СЊ С‚РµРєСЃС‚РѕРІС‹Рµ РѕС‚РІРµС‚С‹, `answers[]`, `checkIns` Рё Р»СЋР±С‹Рµ С‡СѓРІСЃС‚РІРёС‚РµР»СЊРЅС‹Рµ free-text РїРѕР»СЏ.
- РќРµ Р»РѕРіРёСЂРѕРІР°С‚СЊ access_token РёР»Рё OAuth РєРѕРґС‹.

## Update 2026-02-08 (Audit Event Canonical Runtime)

Canonical persisted event schema (`event_logs`):
- `event`: `AuditEventName`
- `ts`: unix ms timestamp (`Date.now()`)
- `actor`: `{ userId: string }`
- `context`: `{ pairId?, activityId?, likeId?, questionnaireId? }`
- `target`: `{ type, id }` (optional)
- `request`: `{ route, method, ip?, ua? }`
- `metadata`: privacy-sanitized safe snapshot (no raw sensitive payloads)
- `retentionTier`: `short | long | abuse`
- `expiresAt`: computed by retention policy

Canonical runtime emitter:
- `src/lib/audit/emitEvent.ts` (`emitEvent`, `auditContextFromRequest`)

Canonical event names:
- `MATCH_LIKE_CREATED`
- `MATCH_RESPONDED`
- `MATCH_ACCEPTED`
- `MATCH_REJECTED`
- `MATCH_CONFIRMED`
- `ACTIVITY_ACCEPTED`
- `ACTIVITY_CANCELED`
- `ACTIVITY_CHECKED_IN`
- `ACTIVITY_COMPLETED`
- `QUESTIONNAIRE_STARTED`
- `QUESTIONNAIRE_ANSWERED`
- `ANSWERS_BULK_SUBMITTED`
- `USER_ONBOARDING_UPDATED`
- `USER_PROFILE_UPSERTED`
- `MATCH_CARD_UPDATED`
- `PAIR_CREATED`
- `PAIR_PAUSED`
- `PAIR_RESUMED`
- `SECURITY_AUTH_FAILED`
- `ABUSE_RATE_LIMIT_HIT`
- `LOG_VISIT_RECORDED`

## Update 2026-02-08 (Entitlements / Legacy / Suggestions Events)

Added canonical audit events:
- `ENTITLEMENT_DENIED` (retention: `long`)
  - emitted when feature/quota gate blocks request
  - metadata: `{ reason, feature?, requiredPlan?, quota?, plan, limit?, used?, resetAt?, route }`
- `ENTITLEMENT_GRANTED` (retention: `long`)
  - emitted by `POST /api/entitlements/grant`
  - metadata: `{ userId, plan, status, periodEnd?, source: 'dev_endpoint' }`
- `LEGACY_RELATIONSHIP_ACTIVITY_VIEWED` (retention: `short`)
  - emitted when legacy `RelationshipActivity` records are returned through compat mapping
  - metadata: `{ pairId, count }`
- `SUGGESTIONS_GENERATED` (retention: `short`)
  - emitted from canonical suggestion pipeline
  - metadata: `{ pairId, count, source }`

PII policy reminder for these events:
- keep metadata strictly non-sensitive
- do not include raw answers/check-ins/messages/tokens

## Update 2026-02-08 (Personal Questionnaire Audit Details)

- `ANSWERS_BULK_SUBMITTED` metadata now includes:
  - `answersCount`
  - `matchedCount`
  - `audience` (`personal` or `couple`)
  - `questionnaireId?`
- Personal questionnaire submit (`POST /api/questionnaires/[id]`) emits `ANSWERS_BULK_SUBMITTED` with `audience: 'personal'`.
- No PII payload is written: event metadata stores counters/IDs only.

