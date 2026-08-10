import { z } from 'zod';

const runtimeEnvSchema = z
  .object({
    MONGODB_URI: z.string().trim().min(1),
    JWT_SECRET: z.string().min(32),
    NEXT_PUBLIC_DISCORD_CLIENT_ID: z.string().trim().min(1),
    DISCORD_CLIENT_SECRET: z.string().trim().min(1),
    DISCORD_REDIRECT_URI: z.string().url().optional(),
    NEXT_PUBLIC_DISCORD_REDIRECT_URI: z.string().url().optional(),
    ENTITLEMENTS_ADMIN_KEY: z.string().min(32).optional(),
    BILLING_MODE: z.enum(['disabled', 'sandbox']).default('disabled'),
    BILLING_WEBHOOK_SECRET: z.string().min(32).optional(),
    TRUSTED_PROXY_MODE: z
      .enum(['disabled', 'x-forwarded-for'])
      .default('disabled'),
  })
  .superRefine((value, context) => {
    if (!value.DISCORD_REDIRECT_URI && !value.NEXT_PUBLIC_DISCORD_REDIRECT_URI) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DISCORD_REDIRECT_URI'],
        message: 'A Discord redirect URI is required',
      });
    }

    if (value.BILLING_MODE !== 'disabled' && !value.BILLING_WEBHOOK_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BILLING_WEBHOOK_SECRET'],
        message: 'Billing webhook secret is required when billing is enabled',
      });
    }
  });

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export type RuntimeEnvValidation =
  | { ok: true; data: RuntimeEnv }
  | { ok: false; fields: string[] };

export const validateRuntimeEnv = (
  environment: Record<string, string | undefined> = process.env
): RuntimeEnvValidation => {
  const parsed = runtimeEnvSchema.safeParse(environment);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  return {
    ok: false,
    fields: Array.from(
      new Set(
        parsed.error.issues.map((issue) => String(issue.path[0] ?? 'environment'))
      )
    ).sort(),
  };
};

export const assertRuntimeEnv = (
  environment: Record<string, string | undefined> = process.env
): RuntimeEnv => {
  const result = validateRuntimeEnv(environment);
  if (!result.ok) {
    throw new Error(
      `Invalid runtime environment fields: ${result.fields.join(', ')}`
    );
  }
  return result.data;
};
