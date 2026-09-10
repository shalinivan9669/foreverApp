import AssessmentPage from '@/features/assessments/AssessmentFormPage';

export default async function Page({ params }: { params: Promise<{ publicationId: string }> }) {
  const { publicationId } = await params;
  return <AssessmentPage publicationId={publicationId} />;
}
