import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';

export type LogVisitResult = {
  id?: string;
  at: string;
};

export const logsService = {
  async recordVisit(input: {
    currentUserId: string;
    auditRequest: AuditRequestContext;
  }): Promise<LogVisitResult> {
    const emitted = await emitEvent({
      event: 'LOG_VISIT_RECORDED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest,
      target: {
        type: 'user',
        id: input.currentUserId,
      },
      metadata: {
        source: 'discord_activity',
      },
    });

    const ts = emitted?.ts ?? Date.now();

    return {
      id: emitted?.id,
      at: new Date(ts).toISOString(),
    };
  },
};
