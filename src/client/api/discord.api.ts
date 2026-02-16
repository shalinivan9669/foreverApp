import { ApiClientError } from './errors';
import type { ApiJsonObject, ApiJsonValue } from './types';
import { normalizeDiscordAvatar } from '@/lib/discord/avatar';

type DiscordProfileResponse = {
  id: string;
  username: string;
  avatar: string;
};

const isObject = (value: ApiJsonValue | null): value is ApiJsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: ApiJsonValue | undefined): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const parseJson = async (response: Response): Promise<ApiJsonValue | null> => {
  try {
    return (await response.json()) as ApiJsonValue;
  } catch {
    return null;
  }
};

const toDiscordProfile = (payload: ApiJsonValue | null): DiscordProfileResponse | null => {
  if (!isObject(payload)) return null;

  const id = readString(payload.id);
  const username = readString(payload.username);
  const avatar = readString(payload.avatar) ?? '';

  if (!id || !username) return null;
  return {
    id,
    username,
    avatar: normalizeDiscordAvatar(avatar),
  };
};

export const discordApi = {
  getCurrentUser: async (accessToken: string): Promise<DiscordProfileResponse> => {
    let response: Response;
    try {
      response = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      throw new ApiClientError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network request failed',
      });
    }

    const payload = await parseJson(response);

    if (!response.ok) {
      throw new ApiClientError({
        status: response.status,
        code: 'INTERNAL',
        message: `Failed to fetch Discord profile (${response.status})`,
        details: payload ?? undefined,
      });
    }

    const profile = toDiscordProfile(payload);
    if (!profile) {
      throw new ApiClientError({
        status: response.status,
        code: 'INVALID_ENVELOPE',
        message: 'Invalid Discord profile payload',
      });
    }

    return profile;
  },
};
