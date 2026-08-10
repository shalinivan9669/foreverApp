import { assertRuntimeEnv } from '@/lib/config/runtimeEnv';

export async function register(): Promise<void> {
  const isProductionBuild = process.env.NEXT_PHASE === 'phase-production-build';
  if (process.env.NEXT_RUNTIME === 'nodejs' && !isProductionBuild) {
    assertRuntimeEnv();
  }
}

