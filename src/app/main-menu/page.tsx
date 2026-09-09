'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTodayDashboard } from '@/client/hooks/useTodayDashboard';
import { WEEKLY_COMPLETION_LABELS, WEEKLY_DATA_LABELS, WEEKLY_SIGNAL_LABELS, WEEKLY_SIGNAL_STATUS } from '@/client/viewmodels/today.viewmodels';
import NotificationPanel from '@/components/notifications/NotificationPanel';
import ContinuationPanel from '@/components/profile/today/ContinuationPanel';
import ErrorView from '@/components/ui/ErrorView';

export default function MainMenuPage() {
  const router = useRouter();
  const today = useTodayDashboard();
  const { pairId, pairStatus, cycle, action } = today;
  const hasCurrentPair = Boolean(pairId && pairStatus !== 'ended');

  return <main className="app-shell-menu py-4 sm:py-6">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><p className="app-muted text-sm">Вместе · ваше пространство</p><h1 className="text-3xl font-semibold">Сегодня</h1></div>
      <button type="button" onClick={() => void today.refresh()} disabled={today.loading} className="app-btn-secondary px-3 py-2 text-sm">{today.loading ? 'Обновляем…' : 'Обновить состояние'}</button>
    </header>
    <section className="app-tile app-tile-rose app-reveal p-5 sm:p-7" aria-label="Ваш следующий шаг" aria-busy={today.loading}>
      <p className="relative z-10 mb-3 text-sm font-semibold">Ваш следующий шаг</p>
      {today.loading ? <div role="status" className="py-5"><h2 className="app-heading text-xl font-semibold">Готовим ваш следующий шаг…</h2><p className="app-muted mt-2">Проверяем профиль и текущее состояние.</p></div>
        : today.error ? <ErrorView error={today.error} onRetry={() => void today.refresh()} onAuthRequired={() => router.push('/')} />
          : action && <div className="relative z-10 flex flex-col">
            <span className="w-fit rounded-full bg-white/70 px-3 py-1 text-sm">{pairStatus === 'active' ? 'Ваша пара · вместе' : pairStatus === 'paused' ? 'Ваша пара · на паузе' : pairStatus === 'ended' ? 'Сохранённое' : 'В вашем темпе'}</span>
            <h2 className="app-heading mt-4 max-w-3xl text-2xl font-semibold sm:text-3xl">{action.title}</h2>
            <p className="mt-2 max-w-2xl text-base leading-relaxed">{action.description}</p>
            {cycle && <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2" aria-label="Готовность еженедельной отметки">
              <p className="font-semibold sm:col-span-2">Еженедельная отметка</p>
              <p className="rounded-xl bg-white/65 p-3"><strong>Вы:</strong> {WEEKLY_COMPLETION_LABELS[cycle.currentUser.completionStatus]}</p>
              <p className="rounded-xl bg-white/65 p-3"><strong>Партнёр:</strong> {WEEKLY_COMPLETION_LABELS[cycle.peer.completionStatus]}</p>
            </div>}
            {cycle && <details className="mt-3 text-sm">
              <summary className="cursor-pointer py-2">{WEEKLY_DATA_LABELS[cycle.pair.dataStatus]} · подробнее</summary>
              {cycle.pair.signals.length ? <ul className="mt-2 space-y-1">{cycle.pair.signals.map(signal => <li key={signal.key}>{WEEKLY_SIGNAL_LABELS[signal.key]}: {WEEKLY_SIGNAL_STATUS[signal.status]}</li>)}</ul> : <p className="mt-2">Здесь появится доступная вам общая сводка. Личные ответы остаются приватными.</p>}
            </details>}
            <Link href={action.href} className="app-btn-primary mt-5 w-fit px-5 py-3" data-today-primary>{action.label}</Link>
          </div>}
    </section>
    <section className="mt-6" aria-labelledby="menu-sections">
      <h2 id="menu-sections" className="app-heading mb-3 text-xl font-semibold">Ваше меню</h2>
      <nav className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3" aria-label="Основные разделы">
        <Link href="/development" className="app-tile app-tile-mint p-4 sm:p-5"><span className="text-xl font-semibold">Библиотека</span><p className="mt-2 text-sm leading-relaxed">Личные занятия, совместные практики, программы и отдых.</p></Link>
        {hasCurrentPair && pairId && <Link href={`/pair/${encodeURIComponent(pairId)}`} className="app-tile app-tile-rose p-4 sm:p-5"><span className="text-xl font-semibold">Мы</span><p className="mt-2 text-sm leading-relaxed">Ваше совместное пространство: состояние пары, события и сохранённые результаты.</p></Link>}
        {hasCurrentPair && <Link href="/shared-life" className="app-tile app-tile-aura p-4 sm:p-5"><span className="text-xl font-semibold">Наша общая жизнь</span><p className="mt-2 text-sm leading-relaxed">Дела, покупки, планы, бюджет и общие цели.</p></Link>}
        <Link href="/questionnaires" className="app-tile app-tile-mint p-4 sm:p-5"><span className="text-xl font-semibold">Анкеты</span><p className="mt-2 text-sm leading-relaxed">Узнать себя через вопросы и выбрать приватность каждого ответа.</p></Link>
        <Link href="/profile" className="app-tile app-tile-plum p-4 sm:p-5"><span className="text-xl font-semibold">Мой профиль</span><p className="mt-2 text-sm leading-relaxed">Личные ориентиры, состояние и настройки.</p></Link>
        {today.matchingAllowed && <Link href="/search" className="app-tile app-tile-spark p-4 sm:p-5"><span className="text-xl font-semibold">Знакомства</span><p className="mt-2 text-sm leading-relaxed">Посмотреть людей, проявить интерес и познакомиться через общие темы.</p></Link>}
        {hasCurrentPair && <Link href="/couple-activity" className="app-tile app-tile-aura p-4 sm:p-5"><span className="text-xl font-semibold">Активности пары</span><p className="mt-2 text-sm leading-relaxed">Текущая активность, рекомендации и история совместных шагов.</p></Link>}
      </nav>
    </section>
    <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Дополнительные разделы">
      <Link href="/store" className="app-btn-secondary px-3 py-2">Монеты и магазин</Link>
      {!hasCurrentPair && <Link href="/invite" className="app-btn-secondary px-3 py-2">Уже есть партнёр</Link>}
      {today.matchingAllowed && <Link href="/match/inbox" className="app-btn-secondary px-3 py-2">Входящие знакомств</Link>}
      {today.ready && !today.matchingAllowed && (today.existingPartnerIntent || hasCurrentPair) && <Link href="/match/inbox" className="app-btn-secondary px-3 py-2">Прежние знакомства</Link>}
      {today.matchingAllowed && <Link href="/match-card/create" className="app-btn-secondary px-3 py-2">Настройки знакомств</Link>}
      <Link href="/profile/history" className="app-btn-secondary px-3 py-2">История</Link>
      <Link href="/profile/safety" className="app-btn-secondary px-3 py-2">Приватная безопасность</Link>
    </nav>
    <NotificationPanel enabled={today.ready} />
    {today.ready && <ContinuationPanel pairId={pairId} pairStatus={pairStatus} existingPartnerIntent={today.existingPartnerIntent} compact />}
  </main>;
}
