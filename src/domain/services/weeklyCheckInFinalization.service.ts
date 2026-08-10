export type WeeklyCheckInFinalizationPhase =
  | 'processing'
  | 'effects_applied'
  | 'completed';

type FinalizationFailure = {
  effectsApplied: boolean;
  failureCode: string;
};

const failureCodeFor = (error: unknown): string => {
  if (error instanceof Error && error.name) return error.name.slice(0, 100);
  return 'WEEKLY_CHECKIN_FINALIZATION_FAILED';
};

/**
 * Runs the repairable portion of weekly check-in submission. The caller's
 * applyEffects operation must atomically persist both effects and the
 * effects_applied marker.
 */
export const runWeeklyCheckInFinalization = async (input: {
  phase: WeeklyCheckInFinalizationPhase;
  applyEffects: () => Promise<void>;
  syncMaterializedCycle: () => Promise<void>;
  beforeComplete?: () => Promise<void>;
  complete: () => Promise<void>;
  releaseAfterFailure: (failure: FinalizationFailure) => Promise<void>;
}): Promise<void> => {
  if (input.phase === 'completed') return;

  let effectsApplied = input.phase === 'effects_applied';
  try {
    if (!effectsApplied) {
      await input.applyEffects();
      effectsApplied = true;
    }
    await input.syncMaterializedCycle();
    await input.beforeComplete?.();
    await input.complete();
  } catch (error) {
    await input
      .releaseAfterFailure({
        effectsApplied,
        failureCode: failureCodeFor(error),
      })
      .catch(() => undefined);
    throw error;
  }
};
