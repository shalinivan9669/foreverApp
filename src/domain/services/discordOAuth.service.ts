import {
  accountWriteBarrierService,
  type AccountWriteLease,
} from '@/domain/services/accountWriteBarrier.service';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import { usersService } from '@/domain/services/users.service';
import type { JsonValue } from '@/lib/api/response';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { normalizeDiscordAvatar } from '@/lib/discord/avatar';
import { signJwt } from '@/lib/jwt';

type DiscordOAuthFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: JsonValue;
};

type DiscordOAuthSuccess = {
  ok: true;
  data: {
    accessToken: string;
    cookieToken: string;
    embeddedSessionToken: string;
    user: {
      id: string;
      username: string;
      avatar: string;
    };
  };
};

export type DiscordOAuthResult = DiscordOAuthFailure | DiscordOAuthSuccess;

const isJsonObject = (
  value: JsonValue,
): value is { [key: string]: JsonValue } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const responseJson = async (response: Response): Promise<JsonValue> =>
  response.json().catch(() => null) as Promise<JsonValue>;

export const getExpectedDiscordRedirectUri = (): string | null => {
  const value =
    process.env.DISCORD_REDIRECT_URI ??
    process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI ??
    null;
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
};

export const isAllowedDiscordRedirectUri = (
  redirectUri: string,
  expectedRedirectUri = getExpectedDiscordRedirectUri(),
): boolean =>
  expectedRedirectUri !== null && redirectUri === expectedRedirectUri;

const authFailureRecorder =
  (auditRequest: AuditRequestContext) =>
  async (reason: string, status?: number): Promise<void> => {
    await emitEvent({
      event: 'SECURITY_AUTH_FAILED',
      actor: { userId: 'anonymous' },
      request: auditRequest,
      target: {
        type: 'system',
        id: 'discord-oauth',
      },
      metadata: {
        reason,
        status,
      },
    });
  };

const failure = (
  status: number,
  code: string,
  message: string,
  details?: JsonValue,
): DiscordOAuthFailure => ({
  ok: false,
  status,
  code,
  message,
  ...(details === undefined ? {} : { details }),
});

export const discordOAuthService = {
  async recordFailure(input: {
    reason: string;
    status?: number;
    auditRequest: AuditRequestContext;
  }): Promise<void> {
    await authFailureRecorder(input.auditRequest)(input.reason, input.status);
  },

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
    auditRequest: AuditRequestContext;
  }): Promise<DiscordOAuthResult> {
    const recordAuthFailure = authFailureRecorder(input.auditRequest);
    const expectedRedirectUri = getExpectedDiscordRedirectUri();
    if (!expectedRedirectUri) {
      await recordAuthFailure('redirect_uri_not_configured', 500);
      return failure(
        500,
        'DISCORD_REDIRECT_URI_NOT_SET',
        'Discord redirect_uri not configured',
      );
    }
    if (!isAllowedDiscordRedirectUri(input.redirectUri, expectedRedirectUri)) {
      await recordAuthFailure('invalid_redirect_uri', 400);
      return failure(400, 'INVALID_REDIRECT_URI', 'invalid redirect_uri');
    }

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '',
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: expectedRedirectUri,
      }),
    });
    const tokenPayload = await responseJson(tokenResponse);
    if (!tokenResponse.ok) {
      await recordAuthFailure('oauth_exchange_failed', tokenResponse.status);
      return failure(
        tokenResponse.status,
        'OAUTH_EXCHANGE_FAILED',
        'Discord OAuth token exchange failed',
      );
    }

    const accessToken =
      isJsonObject(tokenPayload) &&
      typeof tokenPayload.access_token === 'string'
        ? tokenPayload.access_token
        : undefined;
    if (!accessToken) {
      await recordAuthFailure('access_token_missing', 500);
      return failure(500, 'ACCESS_TOKEN_MISSING', 'missing access_token');
    }

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userPayload = await responseJson(userResponse);
    if (!userResponse.ok) {
      await recordAuthFailure(
        'discord_user_lookup_failed',
        userResponse.status,
      );
      return failure(
        502,
        'DISCORD_USER_LOOKUP_FAILED',
        'discord user lookup failed',
      );
    }

    const userId =
      isJsonObject(userPayload) && typeof userPayload.id === 'string'
        ? userPayload.id
        : undefined;
    if (!userId) {
      await recordAuthFailure('discord_user_id_missing', 502);
      return failure(502, 'DISCORD_USER_ID_MISSING', 'missing discord user id');
    }

    const username =
      isJsonObject(userPayload) && typeof userPayload.username === 'string'
        ? userPayload.username
        : undefined;
    if (!username) {
      await recordAuthFailure('discord_username_missing', 502);
      return failure(
        502,
        'DISCORD_USERNAME_MISSING',
        'missing discord username',
      );
    }

    const avatarHash =
      isJsonObject(userPayload) && typeof userPayload.avatar === 'string'
        ? userPayload.avatar
        : '';
    const avatar = normalizeDiscordAvatar(avatarHash);
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      await recordAuthFailure('jwt_secret_missing', 500);
      return failure(500, 'JWT_SECRET_NOT_SET', 'JWT_SECRET not set');
    }

    let lease: AccountWriteLease | null = null;
    try {
      lease = await accountWriteBarrierService.acquireExternal({
        userId,
        kind: 'OAUTH_EXCHANGE',
      });
      await usersService.upsertCurrentUserProfile({
        currentUserId: userId,
        payload: { username, avatar },
        auditRequest: input.auditRequest,
      });
      const sessionVersion =
        await sessionRevocationService.getOrCreateVersion(userId);
      return {
        ok: true,
        data: {
          accessToken,
          cookieToken: signJwt(
            userId,
            secret,
            60 * 60 * 24 * 7,
            sessionVersion,
          ),
          embeddedSessionToken: signJwt(
            userId,
            secret,
            60 * 60 * 12,
            sessionVersion,
          ),
          user: {
            id: userId,
            username,
            avatar,
          },
        },
      };
    } catch {
      await recordAuthFailure('session_creation_failed', 500);
      return failure(
        500,
        'USER_PROFILE_UPSERT_FAILED',
        'Failed to create user profile',
      );
    } finally {
      if (lease) await accountWriteBarrierService.release(lease);
    }
  },
};
