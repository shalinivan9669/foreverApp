import { after } from 'next/server';
import {
  ACCOUNT_WRITE_LEASE_HEARTBEAT_MS,
  accountWriteBarrierService,
  type AccountWriteLease,
} from '@/domain/services/accountWriteBarrier.service';

export const holdAccountWriteLeaseForRequest = (
  lease: AccountWriteLease
): boolean => {
  let heartbeat: NodeJS.Timeout | undefined;
  try {
    after(async () => {
      if (heartbeat) clearInterval(heartbeat);
      await accountWriteBarrierService.release(lease);
    });
    heartbeat = setInterval(() => {
      void accountWriteBarrierService.heartbeat(lease).catch(() => undefined);
    }, ACCOUNT_WRITE_LEASE_HEARTBEAT_MS);
    heartbeat.unref();
    return true;
  } catch {
    if (heartbeat) clearInterval(heartbeat);
    return false;
  }
};
