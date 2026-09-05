import MatchingConnectionPage from "@/features/matching/MatchingConnectionPage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchingConnectionPage connectionId={id} />;
}
