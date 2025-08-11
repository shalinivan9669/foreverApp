/* eslint-disable @next/next/no-img-element */
type Props = {
  c: { id: string; username: string; avatar: string; score: number };
  onLike?: (c: { id: string; username: string; avatar: string }) => void;
};

export default function CandidateCard({ c, onLike }: Props) {
  return (
    <div className="border p-2 flex gap-2 items-center rounded">
      <img
        src={`https://cdn.discordapp.com/avatars/${c.id}/${c.avatar}.png`}
        width={40}
        height={40}
        className="rounded-full"
        alt={c.username}
      />
      <span className="flex-1">{c.username}</span>
      <span className="mr-2">{c.score.toFixed(0)}%</span>
      {onLike && (
        <button
          onClick={() => onLike({ id: c.id, username: c.username, avatar: c.avatar })}
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
        >
          Лайк
        </button>
      )}
    </div>
  );
}
