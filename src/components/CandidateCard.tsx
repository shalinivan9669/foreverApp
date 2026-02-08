/* eslint-disable @next/next/no-img-element */
type Props = {
  c: { id: string; username: string; avatar: string; score: number };
  onLike?: (c: { id: string; username: string; avatar: string }) => void;
};

export default function CandidateCard({ c, onLike }: Props) {
  return (
    <div className="app-panel flex items-center gap-3 p-3 text-slate-900">
      <img
        src={`https://cdn.discordapp.com/avatars/${c.id}/${c.avatar}.png`}
        width={40}
        height={40}
        className="rounded-full ring-1 ring-slate-200"
        alt={c.username}
      />
      <span className="flex-1 truncate font-medium">{c.username}</span>
      <span className="text-sm app-muted">{c.score.toFixed(0)}%</span>
      {onLike && (
        <button
          onClick={() => onLike({ id: c.id, username: c.username, avatar: c.avatar })}
          className="app-btn-primary px-3 py-1 text-sm"
        >
          Р вЂєР В°Р в„–Р С”
        </button>
      )}
    </div>
  );
}
