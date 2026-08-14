import assert from 'node:assert/strict';
import {
  DiscordBootstrapError,
  discordBootstrapMessage,
  runDiscordBootstrapStage,
} from '../src/client/discord/bootstrap';

const main = async (): Promise<void> => {
  await assert.rejects(
    runDiscordBootstrapStage(
      'SDK',
      () => new Promise<never>(() => undefined),
      5
    ),
    (error: unknown) =>
      error instanceof DiscordBootstrapError &&
      error.stage === 'SDK' &&
      error.failure === 'TIMEOUT'
  );

  await assert.rejects(
    runDiscordBootstrapStage('AUTHORIZE', async () => {
      throw new Error('authorization rejected');
    }),
    (error: unknown) =>
      error instanceof DiscordBootstrapError &&
      error.stage === 'AUTHORIZE' &&
      error.failure === 'FAILED'
  );

  assert.match(
    discordBootstrapMessage(new DiscordBootstrapError('DATABASE', 'FAILED')),
    /данных временно недоступен/
  );
  assert.doesNotMatch(
    discordBootstrapMessage(new DiscordBootstrapError('EXCHANGE', 'FAILED')),
    /code|token|access_token/i
  );

  console.log(JSON.stringify({ ok: true, stages: 5 }));
};

void main();
