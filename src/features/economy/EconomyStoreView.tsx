'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useEconomy } from '@/client/hooks/useEconomy';
import { usePair } from '@/client/hooks/usePair';
import type { EconomyCatalogItemDTO } from '@/client/api/economy.api';
import BackBar from '@/components/ui/BackBar';
import LoadingView from '@/components/ui/LoadingView';
import ErrorView from '@/components/ui/ErrorView';

type StoreTab = 'store' | 'collection' | 'pair' | 'history';
const kindLabels = { COSMETIC: 'Оформление', COLLECTIBLE: 'Коллекция', CONTENT: 'Дополнительный контент', CAPSULE: 'Случайный предмет' };

export default function EconomyStoreView() {
  const router = useRouter();
  const pair = usePair();
  const { overview, history, loading, busy, error, receipt, refresh, purchase, equip, moreHistory, pairCollection, pairError, contribution, contribute, refreshPair } = useEconomy(pair.pairId);
  const [tab, setTab] = useState<StoreTab>('store');
  const [selected, setSelected] = useState<EconomyCatalogItemDTO | null>(null);
  const [sharedSelection, setSharedSelection] = useState<{ item: EconomyCatalogItemDTO; pairId: string } | null>(null);
  const sharedItem = sharedSelection?.pairId === pair.pairId ? sharedSelection?.item ?? null : null;
  const setSharedItem = (item: EconomyCatalogItemDTO | null) => setSharedSelection(item && pair.pairId ? { item, pairId: pair.pairId } : null);
  const appearance = overview?.catalog.find((item) => item.equipped)?.appearance;
  const walletColor = appearance === 'mint' ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50';
  const items = overview?.catalog.filter((item) => tab !== 'collection' || item.ownedQuantity > 0) ?? [];

  return (
    <main className="app-shell-compact app-page-stack py-3 sm:py-5">
      <BackBar title="Монеты и коллекция" />
      <section className={`rounded-2xl border p-5 sm:p-6 ${walletColor}`}>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">Ваш личный кошелёк</p>
        <div className="mt-3 flex items-baseline gap-3">
          <h1 className="font-display text-4xl font-semibold text-slate-900">{overview?.balance ?? '—'}</h1>
          <span className="text-slate-700">монет</span>
          <span className="ml-auto text-3xl" aria-hidden="true">{overview?.catalog.find((item) => item.equipped)?.icon ?? '✦'}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">Небольшая награда за полезные действия. Монеты не оценивают вас и ваши отношения.</p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600"><span>Заработано: {overview?.earnedTotal ?? 0}</span><span>Потрачено: {overview?.spentTotal ?? 0}</span></div>
      </section>

      {error && <ErrorView error={error} onRetry={() => void refresh()} onAuthRequired={() => router.push('/')} />}
      {receipt && <div className="app-alert app-alert-auth" role="status">{receipt.receivedIcon} В коллекции: «{receipt.receivedTitle}». Списано {receipt.cost} монет{receipt.replayed ? '; повторная покупка не списывала монеты снова' : ''}.</div>}
      {loading && <LoadingView label="Открываем ваш кошелёк…" />}

      {overview && <>
        <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Разделы кошелька">
          {([{ key: 'store', title: 'Магазин' }, { key: 'collection', title: 'Моё' }, { key: 'pair', title: 'Наше' }, { key: 'history', title: 'История' }] as const).map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} aria-pressed={tab === item.key} className={`${tab === item.key ? 'app-btn-primary' : 'app-btn-secondary'} px-3 py-3 text-sm`}>{item.title}</button>)}
        </nav>

        {(tab === 'store' || tab === 'collection') && <section className="grid gap-3 sm:grid-cols-2" aria-label={tab === 'collection' ? 'Ваши предметы' : 'Каталог'}>
          {items.length === 0 && <div className="app-panel p-5 sm:col-span-2"><h2 className="font-semibold">Коллекция начинается с первого шага</h2><p className="app-muted mt-2 text-sm">Монету за первую настройку можно потратить на маленький памятный знак.</p><button className="app-btn-secondary mt-3 px-3 py-2" onClick={() => setTab('store')} type="button">Открыть магазин</button></div>}
          {items.map((item) => <article key={item.id} className="app-panel flex flex-col p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><span className="text-3xl" aria-hidden="true">{item.icon}</span><span className="app-muted text-xs">{kindLabels[item.kind]}</span></div>
            <h2 className="mt-3 text-lg font-semibold">{item.title}</h2><p className="app-muted mt-2 flex-1 text-sm leading-relaxed">{item.description}</p>
            {item.odds.length > 0 && <p className="mt-3 text-xs leading-relaxed text-slate-700">Вероятности: {item.odds.map((outcome) => `${outcome.title} ${outcome.percent}%`).join(' · ')}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {item.ownedQuantity > 0 ? <><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">В коллекции: {item.ownedQuantity}</span>{item.kind === 'COSMETIC' && <button type="button" onClick={() => void equip(item.equipped ? null : item.id)} disabled={busy} className="app-btn-secondary px-3 py-2 text-sm">{item.equipped ? 'Снять оформление' : 'Применить'}</button>}{item.kind === 'CONTENT' && <Link href={`/development?content=${encodeURIComponent(item.contentKey ?? '')}`} className="app-btn-secondary px-3 py-2 text-sm">Открыть</Link>}</> : <button type="button" onClick={() => setSelected(item)} disabled={busy || overview.balance < item.price} className="app-btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">{item.kind === 'CAPSULE' ? 'Открыть за' : 'Получить за'} {item.price} {item.price === 1 ? 'монету' : 'монеты'}</button>}
              {!item.ownedQuantity && overview.balance < item.price && <span className="app-muted text-xs">Не хватает {item.price - overview.balance}</span>}
            </div>
          </article>)}
        </section>}

        {tab === 'pair' && <section className="app-panel p-5">
          <h2 className="text-lg font-semibold">Наша общая коллекция</h2>
          <p className="app-muted mt-2 text-sm">Можно перенести один свой коллекционный предмет. Он уйдёт из личной коллекции и останется в пространстве этой пары; возврат не предусмотрен. Кошельки остаются личными.</p>
          <p className="app-muted mt-2 text-xs">Предметы не оценивают вклад друг друга. Дополнительные вопросы и личные результаты не передаются. После завершения пары эта коллекция недоступна; новая пара начинает свою коллекцию.</p>
          {pair.loading && <p className="mt-3 text-sm" role="status">Загружаем вашу пару…</p>}
          {!pair.loading && !pair.pairId && <p className="mt-3 text-sm">Общая коллекция появится после взаимного подтверждения пары. <Link href="/invite" className="underline">Связать партнёра</Link></p>}
          {(pairError || pair.error) && <div className="mt-3"><ErrorView error={pairError ?? pair.error} onRetry={() => void Promise.all([pair.refetch(), refreshPair()])} onAuthRequired={() => router.push('/')} /></div>}
          {pair.pairId && <button type="button" disabled={busy} onClick={() => void refreshPair()} className="app-btn-secondary mt-3 px-3 py-2 text-sm">Обновить коллекцию пары</button>}
          {pairCollection && <>
            {pairCollection.readOnly && <p className="mt-3 text-sm">Пара на паузе. Коллекцию можно просматривать; переносы доступны после возобновления.</p>}
            {pairCollection.items.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-3">{pairCollection.items.map((item) => <li key={item.itemId} className="rounded-xl bg-rose-50 p-3"><span aria-hidden="true" className="text-2xl">{item.icon}</span><p className="mt-2 font-medium">{item.title}</p><p className="app-muted text-sm">Вместе: {item.quantity}</p></li>)}</ul> : <p className="app-muted mt-3 text-sm">Здесь пока нет предметов.</p>}
            <h3 className="mt-5 font-semibold">Перенести из моей коллекции</h3>
            {overview.catalog.filter((item) => item.kind === 'COLLECTIBLE' && item.ownedQuantity > 0).map((item) => <button key={item.id} type="button" disabled={busy || pairCollection.readOnly} onClick={() => setSharedItem(item)} className="app-btn-secondary mr-2 mt-3 px-3 py-2 text-sm">{item.icon} {item.title} · у меня {item.ownedQuantity}</button>)}
            {!overview.catalog.some((item) => item.kind === 'COLLECTIBLE' && item.ownedQuantity > 0) && <p className="app-muted mt-2 text-sm">Сначала получите коллекционный предмет в магазине.</p>}
            {sharedItem && <div className="mt-4 rounded-xl border border-rose-200 p-4"><p className="text-sm">Перенести 1 предмет «{sharedItem.title}» в общую коллекцию этой пары? Монеты не списываются.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy || pairCollection.readOnly} onClick={() => void contribute(sharedItem.id).then((ok) => { if (ok) setSharedItem(null); })} className="app-btn-primary px-3 py-2">Перенести предмет</button><button type="button" disabled={busy} onClick={() => setSharedItem(null)} className="app-btn-secondary px-3 py-2">Отмена</button></div></div>}
          </>}
          {contribution && <p className="app-alert app-alert-auth mt-3" role="status">{contribution.icon} «{contribution.title}» в общей коллекции.{contribution.replayed ? ' Повторный запрос не переносил второй предмет.' : ''}</p>}
        </section>}

        {selected && <section className="app-panel border border-rose-200 p-5" aria-label="Подтверждение покупки">
          <h2 className="text-lg font-semibold">{selected.icon} {selected.title}</h2><p className="app-muted mt-2 text-sm">Из личного кошелька будет списано {selected.price} монет. Останется {Math.max(0, overview.balance - selected.price)}.</p>
          {selected.odds.length > 0 && <p className="mt-3 text-sm">Вы получите один случайный предмет. {selected.odds.map((outcome) => `${outcome.title}: ${outcome.percent}%`).join('; ')}. Повторные предметы сохраняются в количестве.</p>}
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void purchase(selected.id).then((ok) => { if (ok) setSelected(null); })} className="app-btn-primary px-4 py-2">{busy ? 'Сохраняем покупку…' : 'Подтвердить'}</button><button type="button" disabled={busy} onClick={() => setSelected(null)} className="app-btn-secondary px-4 py-2">Отмена</button></div>
        </section>}

        {tab === 'history' && <section className="app-panel p-4 sm:p-5"><h2 className="text-lg font-semibold">Журнал монет</h2>{history.items.length === 0 ? <p className="app-muted mt-3 text-sm">Операций пока нет. Первая завершённая настройка приносит одну монету.</p> : <ol className="mt-3 divide-y divide-slate-100">{history.items.map((entry) => <li key={entry.id} className="flex items-start justify-between gap-3 py-3"><div><p className="text-sm font-medium">{entry.label}</p><p className="app-muted mt-1 text-xs">{new Date(entry.createdAt).toLocaleString('ru-RU')} · после операции {entry.balanceAfter}</p></div><strong className={entry.delta > 0 ? 'text-emerald-700' : 'text-slate-700'}>{entry.delta > 0 ? '+' : ''}{entry.delta}</strong></li>)}</ol>}{history.nextCursor && <button type="button" onClick={() => void moreHistory()} disabled={busy} className="app-btn-secondary mt-3 w-full px-4 py-2">Показать ещё</button>}</section>}

        <section className="app-panel-soft p-4 sm:p-5"><h2 className="font-semibold">Как заработать</h2><ul className="app-muted mt-3 space-y-2 text-sm">{overview.rewardRules.map((rule) => <li key={rule.kind}>{rule.title}: +{rule.amount} {rule.amount === 1 ? 'монета' : rule.amount < 5 ? 'монеты' : 'монет'}{rule.kind === 'ONBOARDING' ? ' один раз' : `, до ${rule.dailyLimit} наград в день`}. </li>)}</ul><p className="app-muted mt-3 text-xs leading-relaxed">Повтор запроса не даёт вторую награду. Содержание ответов не влияет на монеты. Дневные лимиты обновляются в 00:00 UTC; действие сверх лимита не награждается позже. Основные знакомства, аналитика и жизнь пары остаются бесплатными. Реальные деньги здесь не используются.</p><Link href="/development" className="app-btn-secondary mt-4 inline-flex px-4 py-2 text-sm">Выбрать полезный шаг</Link></section>
      </>}
    </main>
  );
}
