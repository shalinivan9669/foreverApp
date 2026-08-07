'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import BackBar from '@/components/ui/BackBar';

export default function PairDiagnosticsPage() {
  const params = useParams<{ id: string }>();
  const pairId = params?.id;
  const pairHref = pairId ? `/pair/${encodeURIComponent(pairId)}` : '/pair';

  return (
    <main className="app-shell-compact app-page-stack py-3 sm:py-5">
      <BackBar title="Сводка пары" fallbackHref={pairHref} />
      <section className="app-panel app-panel-solid p-5 sm:p-6">
        <div className="app-muted text-xs">Приватность P0</div>
        <h1 className="mt-1 text-2xl font-semibold">Диагностика заменена безопасной сводкой</h1>
        <p className="app-muted mt-3 text-sm leading-relaxed">
          Точные сравнения, глобальный процент совместимости, паспорт и значения каждого
          участника больше не показываются. В профиле пары доступна только качественная сводка
          текущего weekly cycle после ответов обоих участников.
        </p>
        <Link href={pairHref} className="app-btn-primary mt-5 inline-flex px-4 py-2.5 text-sm">
          Открыть Pair Summary
        </Link>
      </section>
    </main>
  );
}
