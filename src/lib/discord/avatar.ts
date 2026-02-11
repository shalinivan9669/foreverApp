const DISCORD_CDN_AVATAR_BASE = 'https://cdn.discordapp.com/avatars';
export const DISCORD_DEFAULT_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';

const isAbsoluteUrl = (value: string): boolean =>
  value.startsWith('http://') || value.startsWith('https://');

export const normalizeDiscordAvatar = (avatar: string | null | undefined): string => {
  const value = typeof avatar === 'string' ? avatar.trim() : '';
  return value.length > 0 ? value : DISCORD_DEFAULT_AVATAR_URL;
};

export const toDiscordAvatarUrl = (userId: string, avatar: string | null | undefined): string => {
  const value = normalizeDiscordAvatar(avatar);
  if (isAbsoluteUrl(value)) return value;
  return `${DISCORD_CDN_AVATAR_BASE}/${userId}/${value}.png`;
};
