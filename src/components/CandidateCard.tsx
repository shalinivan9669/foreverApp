/* eslint-disable @next/next/no-img-element */
type Props = {
  c: { id: string; username: string; avatar: string; score: number };
  onLike?: (c: { id: string; username: string; avatar: string }) => void;
};

export default function CandidateCard({ c, onLike }: Props) {
  return (
    <div className="app-panel app-lift flex flex-col gap-3 p-3 text-slate-900 sm:flex-row sm:items-center">
      <img
        src={`https://cdn.discordapp.com/avatars/${c.id}/${c.avatar}.png`}
        width={40}
        height={40}
        className="h-10 w-10 rounded-full ring-1 ring-slate-200"
        alt={c.username}
      />
      <div className="flex w-full items-center gap-3 sm:w-auto sm:flex-1">
        <span className="flex-1 truncate font-medium">{c.username}</span>
        <span className="app-muted text-sm">{c.score.toFixed(0)}%</span>
      </div>
      {onLike && (
        <button
          onClick={() => onLike({ id: c.id, username: c.username, avatar: c.avatar })}
          className="app-btn-primary w-full px-3 py-1.5 text-sm sm:w-auto"
        >
          Лайк
        </button>
      )}
    </div>
  );
}
