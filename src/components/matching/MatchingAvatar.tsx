import Image from "next/image";

type MatchingAvatarProps = {
  username: string;
  avatar: string;
  size?: number;
};

export default function MatchingAvatar({
  username,
  avatar,
  size = 64,
}: MatchingAvatarProps) {
  if (
    /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//.test(avatar)
  ) {
    return (
      <Image
        src={avatar}
        alt={`Аватар ${username}`}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full bg-rose-100 font-semibold text-rose-800"
      style={{ width: size, height: size }}
      aria-label={`Аватар ${username}`}
    >
      {username.slice(0, 1).toUpperCase()}
    </div>
  );
}
