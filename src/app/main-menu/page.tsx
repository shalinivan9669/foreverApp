'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTodayDashboard } from '@/client/hooks/useTodayDashboard';
import { WEEKLY_COMPLETION_LABELS, WEEKLY_DATA_LABELS, WEEKLY_SIGNAL_LABELS, WEEKLY_SIGNAL_STATUS } from '@/client/viewmodels/today.viewmodels';
import NotificationPanel from '@/components/notifications/NotificationPanel';
import ContinuationPanel from '@/components/profile/today/ContinuationPanel';
import ErrorView from '@/components/ui/ErrorView';
import styles from './menu.module.css';

type MenuSymbol = 'heart' | 'profile' | 'forms' | 'book' | 'home' | 'spark';

function MenuIcon({ symbol }: { symbol: MenuSymbol }) {
  const paths: Record<MenuSymbol, string> = {
    heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
    profile: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    forms: 'M8 3H5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3M8 1h8v5H8ZM7 12l2 2 4-4M7 18h10',
    book: 'M12 5C9 2 5 2 2 3v16c4-1 7 0 10 2 3-2 6-3 10-2V3c-3-1-7-1-10 2Zm0 0v16',
    home: 'm2 11 10-9 10 9M5 9v12h14V9M9 21v-8h6v8',
    spark: 'm12 2 2.8 6.8L22 12l-7.2 3.2L12 22l-2.8-6.8L2 12l7.2-3.2Z',
  };
  return <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[symbol]} /></svg>;
}

function MenuTile({ href, title, description, tone, symbol }: {
  href: string; title: string; description: string;
  tone: 'plum' | 'mint' | 'honey' | 'spark' | 'rose' | 'aura'; symbol: MenuSymbol;
}) {
  return <Link href={href} className={`app-tile app-tile-${tone} ${styles.tile}`}>
    <span className={styles.tileIcon}><MenuIcon symbol={symbol} /></span>
    <div className={styles.tileCopy}><h2>{title}</h2><p>{description}</p></div>
    <span className={styles.openTile} aria-hidden="true">↗</span>
  </Link>;
}

export default function MainMenuPage() {
  const router = useRouter();
  const today = useTodayDashboard();
  const { pairId, pairStatus, cycle, action } = today;
  const hasCurrentPair = Boolean(pairId && pairStatus !== 'ended');

  return <main className={`app-shell-menu ${styles.page}`}>
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.brandMark}><MenuIcon symbol="heart" /></span><div><h1>Вместе</h1><p className="app-muted">Место для себя и друг для друга</p></div></div>
      <button type="button" onClick={() => void today.refresh()} disabled={today.loading} className="app-btn-secondary px-3 py-2 text-sm">{today.loading ? 'Обновляем…' : 'Обновить состояние'}</button>
    </header>
    <div className={styles.menu}>
    <section className={`app-tile app-tile-rose ${styles.hero}`} aria-label="Ваш следующий шаг" aria-busy={today.loading}>
      <div className={styles.heroTop}><p className={styles.todayLabel}>Сегодня</p><span className={styles.heroArt} aria-hidden="true"><MenuIcon symbol="heart" /></span></div>
      {today.loading ? <div role="status" className="py-5"><h2 className="app-heading text-xl font-semibold">Готовим ваш следующий шаг…</h2><p className="app-muted mt-2">Проверяем профиль и текущее состояние.</p></div>
        : today.error ? <ErrorView error={today.error} onRetry={() => void today.refresh()} onAuthRequired={() => router.push('/')} />
          : action && <div className={styles.heroContent}>
            <span className={styles.pairStatus}>{pairStatus === 'active' ? 'Ваша пара · вместе' : pairStatus === 'paused' ? 'Ваша пара · на паузе' : pairStatus === 'ended' ? 'Сохранённое' : 'В вашем темпе'}</span>
            <Link href={action.href} className={styles.heroLink} data-today-primary>
              <h2>{action.title}</h2>
              <p>{action.description}</p>
              <span className={`app-btn-primary ${styles.heroAction}`}>{action.label}</span>
            </Link>
            {cycle && <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2" aria-label="Готовность еженедельной отметки">
              <p className="font-semibold sm:col-span-2">Еженедельная отметка</p>
              <p className="rounded-xl bg-white/65 p-3"><strong>Вы:</strong> {WEEKLY_COMPLETION_LABELS[cycle.currentUser.completionStatus]}</p>
              <p className="rounded-xl bg-white/65 p-3"><strong>Партнёр:</strong> {WEEKLY_COMPLETION_LABELS[cycle.peer.completionStatus]}</p>
            </div>}
            {cycle && <details className="mt-3 text-sm">
              <summary className="cursor-pointer py-2">{WEEKLY_DATA_LABELS[cycle.pair.dataStatus]} · подробнее</summary>
              {cycle.pair.signals.length ? <ul className="mt-2 space-y-1">{cycle.pair.signals.map(signal => <li key={signal.key}>{WEEKLY_SIGNAL_LABELS[signal.key]}: {WEEKLY_SIGNAL_STATUS[signal.status]}</li>)}</ul> : <p className="mt-2">Здесь появится доступная вам общая сводка. Личные ответы остаются приватными.</p>}
            </details>}
          </div>}
    </section>
      <nav className={styles.sections} aria-label="Основные разделы">
        <MenuTile href="/profile" title="Мой профиль" description="Ваше состояние, личные ориентиры и настройки." tone="plum" symbol="profile" />
        <MenuTile href="/questionnaires" title="Анкеты и тесты" description="Узнать себя, продолжить ответы, увидеть результаты." tone="mint" symbol="forms" />
        {hasCurrentPair && pairId
          ? <MenuTile href={`/pair/${encodeURIComponent(pairId)}`} title="Мы" description="Состояние пары, события и ваши совместные шаги." tone="rose" symbol="heart" />
          : <MenuTile href="/development" title="Библиотека" description="Занятия, небольшие практики и время для себя." tone="honey" symbol="book" />}
        {hasCurrentPair
          ? <MenuTile href="/shared-life" title="Наша общая жизнь" description="Дела, покупки, планы и то, о чём вы мечтаете." tone="aura" symbol="home" />
          : today.matchingAllowed
            ? <MenuTile href="/search" title="Знакомства" description="Находить общие темы и узнавать друг друга." tone="spark" symbol="spark" />
            : <MenuTile href="/invite" title="Уже есть партнёр" description="Пригласите близкого человека в ваше пространство." tone="rose" symbol="heart" />}
      </nav>
    </div>
    {hasCurrentPair && <nav className={styles.moreTiles} aria-label="Занятия и активности">
      <MenuTile href="/development" title="Библиотека" description="Личные занятия, совместные практики, программы и отдых." tone="honey" symbol="book" />
      <MenuTile href="/couple-activity" title="Активности пары" description="Продолжить начатое или выбрать время друг для друга." tone="mint" symbol="spark" />
    </nav>}
    <nav className={styles.utilities} aria-label="Дополнительные разделы">
      <Link href="/store" className="app-btn-secondary px-3 py-2">Монеты и магазин</Link>
      {!hasCurrentPair && today.matchingAllowed && <Link href="/invite" className="app-btn-secondary px-3 py-2">Уже есть партнёр</Link>}
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
