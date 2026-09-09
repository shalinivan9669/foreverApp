import { MeasurementPage } from '@/features/measurements/MeasurementPages';
export default async function Page({ params }: { params: Promise<{ key: string }> }) { const { key } = await params; return <MeasurementPage testKey={key} />; }
