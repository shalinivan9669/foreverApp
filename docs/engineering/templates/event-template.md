# Audit Event Spec: `<event_name>`

## Purpose
- <Why this event exists>

## Trigger
- Endpoint/service:
- Trigger condition:

## Envelope
- `eventName`:
- `actorUserId`:
- `targetType`:
- `targetId`:
- `metadata`:

## Privacy rules
- Forbidden metadata keys: `access_token`, `code`, `redirect_uri`, secrets, raw body payloads.
- Allowed metadata keys:

## Retention
- Tier: short | abuse | long
- TTL days:
- `expiresAt` derivation:

## Failure policy
- Event emit failure behavior: best effort | fail closed
- Observability/logging:

## Evidence
- Runtime file(s):
- Docs updated:
