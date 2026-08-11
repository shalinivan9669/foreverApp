import assert from 'node:assert/strict';
import { ApiClientError, toUiErrorState } from '../src/client/api/errors';

const run = () => {
  const auth = toUiErrorState(
    new ApiClientError({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'auth',
    })
  );
  assert.equal(auth.kind, 'auth_required', '401 should map to auth_required');

  const forbidden = toUiErrorState(
    new ApiClientError({
      status: 403,
      code: 'ACCESS_DENIED',
      message: 'denied',
    })
  );
  assert.equal(forbidden.kind, 'access_denied', '403 should map to access_denied');

  const notFound = toUiErrorState(
    new ApiClientError({
      status: 404,
      code: 'NOT_FOUND',
      message: 'not found',
    })
  );
  assert.equal(notFound.kind, 'not_found', '404 should map to not_found');

  const conflict = toUiErrorState(
    new ApiClientError({
      status: 409,
      code: 'STATE_CONFLICT',
      message: 'conflict',
    })
  );
  assert.equal(conflict.kind, 'state_conflict', '409 should map to state_conflict');

  const idempotencyValidation = toUiErrorState(
    new ApiClientError({
      status: 422,
      code: 'IDEMPOTENCY_KEY_INVALID',
      message: 'invalid key',
    })
  );
  assert.equal(
    idempotencyValidation.kind,
    'validation',
    '422 IDEMPOTENCY_KEY_INVALID should map to validation'
  );

  const server = toUiErrorState(
    new ApiClientError({
      status: 503,
      code: 'INTERNAL',
      message: 'upstream down',
    })
  );
  assert.equal(server.kind, 'generic', '5xx should map to generic');

  const legacyEntitlement = toUiErrorState(
    new ApiClientError({
      status: 402,
      code: 'ENTITLEMENT_REQUIRED',
      message: 'legacy entitlement boundary',
    })
  );
  assert.equal(
    legacyEntitlement.kind,
    'generic',
    'legacy entitlement errors must never render a purchase/paywall state'
  );

  const legacyQuota = toUiErrorState(
    new ApiClientError({
      status: 403,
      code: 'QUOTA_EXCEEDED',
      message: 'legacy quota boundary',
    })
  );
  assert.equal(
    legacyQuota.kind,
    'generic',
    'legacy quota errors must never render a purchase/paywall state'
  );

  console.log('Client error mapping self-check passed.');
};

run();
