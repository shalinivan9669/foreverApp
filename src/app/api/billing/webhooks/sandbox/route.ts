import { asError, toDomainError } from '@/domain/errors';
import { billingWebhookService } from '@/domain/services/billingWebhook.service';
import { jsonError, jsonOk } from '@/lib/api/response';
import {
  hashSandboxWebhookPayload,
  parseSandboxWebhook,
  readSandboxWebhookBody,
  verifySandboxWebhook,
} from '@/lib/billing/sandboxWebhook';
import { enforceRateLimit, RATE_LIMIT_POLICIES } from '@/lib/abuse/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (process.env.BILLING_MODE !== 'sandbox') {
    return jsonError(503, 'BILLING_DISABLED', 'Billing is disabled');
  }

  const secret = process.env.BILLING_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return jsonError(503, 'BILLING_DISABLED', 'Billing is disabled');
  }

  const rate = await enforceRateLimit({
    req: request,
    policy: RATE_LIMIT_POLICIES.billingWebhook,
  });
  if (!rate.ok) return rate.response;

  try {
    const rawBody = await readSandboxWebhookBody(request);
    const eventId = request.headers.get('x-billing-event-id')?.trim() ?? '';
    const timestamp = request.headers.get('x-billing-timestamp')?.trim() ?? '';
    const signature = request.headers.get('x-billing-signature')?.trim() ?? '';
    if (
      !eventId ||
      eventId.length > 160 ||
      !verifySandboxWebhook({
        secret,
        timestamp,
        eventId,
        rawBody,
        signature,
      })
    ) {
      return jsonError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Unauthorized');
    }

    const payload = parseSandboxWebhook(rawBody);
    return jsonOk(
      await billingWebhookService.processSandbox({
        eventId,
        payloadHash: hashSandboxWebhookPayload(rawBody),
        payload,
      })
    );
  } catch (error) {
    const domainError = toDomainError(asError(error));
    return jsonError(
      domainError.status,
      domainError.code,
      domainError.message,
      domainError.details
    );
  }
}
