type Props = { c: { id: string; username: string; avatar: string; score: number } };
export default function CandidateCard({ c }: Props) {
  return (
    <div className="border p-2 flex gap-2 items-center">
      <img
        src={`https://cdn.discordapp.com/avatars/${c.id}/${c.avatar}.png`}
        width={40}
        height={40}
        className="rounded-full"
        alt={c.username}
      />
      <span className="flex-1">{c.username}</span>
      <span>{c.score.toFixed(0)}%</span>
    </div>
  );
}
