# Engineering Playbook

## Start here
1. Identify scope first: API/backend changes use `backend-playbook.md`, UI/client changes use `frontend-playbook.md`.
2. Before coding a new endpoint, complete `checklists/api-endpoint-checklist.md`.
3. Keep `route.ts` thin: auth, validation, rate limit, entitlements, idempotency, service call, envelope response.
4. Keep business logic in domain services and transition rules in state machines.
5. Never return raw DB models from API; map to explicit DTOs and then to UI view-models.
6. Map standardized API error codes to deterministic UX states.
7. Update relevant `PROB`, `ADR`, and `docs/CHANGELOG.md` after meaningful architecture or contract changes.

## Playbooks
- `docs/engineering/backend-playbook.md`
- `docs/engineering/frontend-playbook.md`

## Checklists
- `docs/engineering/checklists/api-endpoint-checklist.md`
- `docs/engineering/checklists/domain-service-checklist.md`
- `docs/engineering/checklists/state-machine-checklist.md`
- `docs/engineering/checklists/idempotency-checklist.md`
- `docs/engineering/checklists/audit-rate-limit-entitlements-checklist.md`
- `docs/engineering/checklists/ui-container-view-checklist.md`
- `docs/engineering/checklists/dto-contract-checklist.md`

## Templates
- `docs/engineering/templates/PROB-template.md`
- `docs/engineering/templates/ADR-template.md`
- `docs/engineering/templates/endpoint-template.md`
- `docs/engineering/templates/event-template.md`
