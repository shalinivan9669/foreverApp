import { MeasurementCatalog } from '@/features/measurements/MeasurementPages';
import BackBar from '@/components/ui/BackBar';
export default function Page() { return <main className="app-shell-dashboard space-y-4 py-4"><BackBar title="Личные анкеты" fallbackHref="/profile" /><MeasurementCatalog /></main>; }
