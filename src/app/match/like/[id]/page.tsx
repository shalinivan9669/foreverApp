import MatchingLikePage from "@/features/matching/MatchingLikePage";

export default async function MatchLikeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MatchingLikePage likeId={id} />;
}
