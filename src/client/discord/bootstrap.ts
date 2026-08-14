import { DiscordSDK } from '@discord/embedded-app-sdk';
import { isApiClientError } from '@/client/api/errors';
import type { ExchangeCodeResponse } from '@/client/api/types';
import { usersApi } from '@/client/api/users.api';

export type DiscordBootstrapStage =
  | 'SDK'
  | 'AUTHORIZE'
  | 'EXCHANGE'
  | 'DATABASE'
  | 'SESSION';

export type DiscordBootstrapFailure = 'FAILED' | 'TIMEOUT' | 'NOT_CONFIGURED';

export class DiscordBootstrapError extends Error {
  readonly stage: DiscordBootstrapStage;

  readonly failure: DiscordBootstrapFailure;

  constructor(
    stage: DiscordBootstrapStage,
    failure: DiscordBootstrapFailure
  ) {
    super(`DISCORD_BOOTSTRAP_${stage}_${failure}`);
    this.name = 'DiscordBootstrapError';
    this.stage = stage;
    this.failure = failure;
  }
}

const DEFAULT_STAGE_TIMEOUT_MS = 10_000;

export const runDiscordBootstrapStage = async <Result>(
  stage: Exclude<DiscordBootstrapStage, 'DATABASE'>,
  operation: (signal: AbortSignal) => Promise<Result>,
  timeoutMs = DEFAULT_STAGE_TIMEOUT_MS
): Promise<Result> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DiscordBootstrapError(stage, 'TIMEOUT'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } catch (caught) {
    if (caught instanceof DiscordBootstrapError) throw caught;
    if (
      stage === 'EXCHANGE' &&
      caught instanceof Error &&
      isApiClientError(caught) &&
      caught.code === 'USER_PROFILE_UPSERT_FAILED'
    ) {
      throw new DiscordBootstrapError('DATABASE', 'FAILED');
    }
    throw new DiscordBootstrapError(stage, 'FAILED');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export const bootstrapDiscordSession = async (): Promise<ExchangeCodeResponse> => {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new DiscordBootstrapError('SDK', 'NOT_CONFIGURED');
  }

  const sdk = await runDiscordBootstrapStage('SDK', async () => {
    const candidate = new DiscordSDK(clientId);
    await candidate.ready();
    return candidate;
  });
  const { code } = await runDiscordBootstrapStage('AUTHORIZE', () =>
    sdk.commands.authorize({
      client_id: clientId,
      response_type: 'code',
      scope: ['identify'],
      prompt: 'none',
    })
  );
  const tokenData = await runDiscordBootstrapStage(
    'EXCHANGE',
    (signal) =>
      usersApi.exchangeDiscordCode(
        { code, redirect_uri: redirectUri },
        signal
      ),
    15_000
  );
  await runDiscordBootstrapStage('SESSION', () =>
    sdk.commands.authenticate({ access_token: tokenData.access_token })
  );
  return tokenData;
};

export const discordBootstrapMessage = (caught: unknown): string => {
  if (!(caught instanceof DiscordBootstrapError)) {
    return 'Не удалось подключить Discord. Проверьте соединение и повторите попытку.';
  }
  switch (caught.stage) {
    case 'SDK':
      return caught.failure === 'NOT_CONFIGURED'
        ? 'Подключение Discord не настроено. Обратитесь к администратору приложения.'
        : 'Discord SDK не ответил вовремя. Откройте приложение внутри Discord и повторите попытку.';
    case 'AUTHORIZE':
      return 'Discord не завершил авторизацию. Проверьте доступ к приложению и повторите попытку.';
    case 'EXCHANGE':
      return 'Не удалось завершить обмен с Discord. Проверьте соединение и повторите попытку.';
    case 'DATABASE':
      return 'Сервис данных временно недоступен. Ваш вход не завершён; повторите попытку позже.';
    case 'SESSION':
      return 'Не удалось создать защищённую сессию Discord. Повторите подключение.';
  }
};
