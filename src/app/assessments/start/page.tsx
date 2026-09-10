import BackBar from '@/components/ui/BackBar';
import AssessmentSettingsPanel from '@/features/assessments/AssessmentSettingsPanel';

export default function Page() {
  return <main className="app-shell-narrow py-5 space-y-5"><BackBar title="Навыки и анкеты" fallbackHref="/profile" /><h1 className="text-2xl font-semibold">Начало участия</h1><AssessmentSettingsPanel registration /></main>;
}
