"use client";
import Link from "next/link";
import { DEVELOPMENT_FORMAT_LABELS, filterDevelopmentCatalog, isTogetherDevelopment, nextDevelopmentProgramStep, type DevelopmentAudience } from "@/client/viewmodels/development.viewmodels";
import type { DevelopmentOverviewDTO } from "@/lib/dto/development.dto";

export default function DevelopmentCatalog({ overview, audience, domain, kind, highlightedKey, highlightedProgram, pairId, pairActive, pairLoading, busy, onFilter, onStart }: {
  overview: DevelopmentOverviewDTO; audience: DevelopmentAudience; domain: string; kind: string;
  highlightedKey: string | null; highlightedProgram: string | null; pairId: string | null; pairActive: boolean; pairLoading: boolean; busy: boolean;
  onFilter: (changes: Record<string, string | null>) => void; onStart: (key: string, pairId?: string) => Promise<void>;
}) {
  const cards = filterDevelopmentCatalog(overview, { audience, domain, kind });
  const formats = Object.entries(DEVELOPMENT_FORMAT_LABELS).filter(([key]) => isTogetherDevelopment(key) === (audience === "together"));
  return <>
    <section id="catalog" className="app-panel app-panel-solid mt-5 scroll-mt-4 p-5" aria-labelledby="library-catalog-title">
      <h2 id="library-catalog-title" className="text-xl font-semibold">Выберите занятие</h2>
      <p className="mt-3"><Link className="underline" href="/measurements">Измерительные анкеты по шести областям и личные результаты</Link>. Свободная рефлексия ниже помогает размышлять, но сама по себе не рассчитывает характеристики.</p>
      <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Для кого занятие">
        <button className="app-btn-secondary px-3 py-3" aria-pressed={audience === "personal"} onClick={() => onFilter({ scope: "personal", format: null })}>Для себя</button>
        <button className="app-btn-secondary px-3 py-3" aria-pressed={audience === "together"} onClick={() => onFilter({ scope: "together", format: null })}>Вместе</button>
      </div>
      <p className="app-muted mt-3 text-sm">{audience === "personal" ? "Личные занятия доступны и вне пары, и в отношениях. Ваши ответы и заметки остаются личными." : "Совместные занятия, темы для разговора и идеи отдыха. Ответы каждый сохраняет только для себя."}</p>
      {audience === "together" && !pairActive && <div className="app-panel-soft mt-3 p-3 text-sm"><p>{pairLoading ? "Проверяем состояние пары…" : pairId ? "Совместные занятия можно продолжать после возобновления пары. Каталог доступен для просмотра." : "Для совместного прохождения нужна подтверждённая пара. Пока можно посмотреть каталог или выбрать личное занятие."}</p>
        {!pairLoading && <Link href={pairId ? `/pair/${encodeURIComponent(pairId)}` : "/invite"} className="mt-2 inline-block py-2 underline">{pairId ? "Перейти к состоянию пары" : "Связать партнёра"}</Link>}
      </div>}
      <fieldset className="mt-4"><legend className="text-sm font-medium">Формат</legend><div className="mt-2 flex flex-wrap gap-2">
        <button className="app-btn-secondary px-3 py-2 text-sm" aria-pressed={kind === "all"} onClick={() => onFilter({ format: null })}>Все форматы</button>
        {formats.map(([key, label]) => <button key={key} className="app-btn-secondary px-3 py-2 text-sm" aria-pressed={kind === key} onClick={() => onFilter({ format: key })}>{label}</button>)}
      </div></fieldset>
      <label className="mt-4 block text-sm font-medium">Область интереса
        <select className="app-input mt-2 w-full" value={domain} onChange={(event) => onFilter({ area: event.target.value === "all" ? null : event.target.value })}>
          <option value="all">Все шесть областей</option>{overview.domains.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
        </select>
      </label>
      <p className="app-muted mt-3 text-sm" role="status">Подходящих занятий: {cards.length}</p>
    </section>
    {audience === "personal" && domain === "all" && kind === "all" && <section className="app-panel mt-4 p-4">
      <p className="app-muted text-sm">Можно начать с этого</p><h2 className="mt-1 font-semibold">{overview.suggestion.title}</h2>
      <p className="app-muted mt-2 text-sm">{overview.suggestion.reason}</p>
      <button className="app-btn-primary mt-3 px-4 py-3" disabled={busy} onClick={() => void onStart(overview.suggestion.contentKey)}>Попробовать</button>
    </section>}
    <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Каталог занятий">
      {cards.map((card) => {
        const together = isTogetherDevelopment(card.kind);
        return <article key={card.key} className={`app-panel app-panel-solid flex min-w-0 flex-col p-4 ${card.key === highlightedKey ? "ring-2 ring-rose-600" : ""}`}>
          <p className="app-muted text-sm">{DEVELOPMENT_FORMAT_LABELS[card.kind]} · {card.durationMinutes} мин</p>
          <h3 className="mt-2 break-words font-semibold">{card.title}</h3><p className="app-muted mt-2 text-sm">{card.purpose}</p>
          <p className="app-muted mb-4 mt-2 text-sm">{card.completedCount ? `Пройдено раз: ${card.completedCount}` : "Ещё не пробовали"}</p>
          {card.locked ? <Link href="/store" className="app-btn-secondary mt-auto px-3 py-3">Дополнительный материал в магазине</Link> : <button disabled={busy || (together && !pairActive)} className="app-btn-secondary mt-auto px-3 py-3" onClick={() => void onStart(card.key, together ? pairId ?? undefined : undefined)}>{together && !pairActive ? "Доступно действующей паре" : "Открыть занятие"}</button>}
        </article>;
      })}
    </section>
    {!cards.length && <div className="app-panel mt-4 p-5"><p>В этой области пока нет выбранного формата.</p><button className="app-btn-secondary mt-3 px-3 py-3" onClick={() => onFilter({ area: null, format: null })}>Показать все занятия этого раздела</button></div>}
    <section id="programs" className="mt-6 scroll-mt-4" aria-labelledby="library-programs-title">
      <h2 id="library-programs-title" className="text-xl font-semibold">Программы в своём темпе</h2><p className="app-muted mt-2 text-sm">Несколько связанных занятий. Раскройте программу, чтобы выбрать следующий шаг.</p>
      <div className="mt-3 space-y-3">{overview.programs.map((program) => {
        const next = nextDevelopmentProgramStep(program, overview);
        const nextTogether = next && isTogetherDevelopment(next.kind);
        return <details key={program.key} open={program.key === highlightedProgram ? true : undefined} className={`app-panel app-panel-solid p-4 ${program.key === highlightedProgram ? "ring-2 ring-rose-600" : ""}`}>
          <summary className="cursor-pointer py-2"><span className="font-semibold">{program.title}</span><span className="app-muted mt-1 block text-sm">Пройдено шагов: {program.completedSteps} из {program.contentKeys.length}</span></summary>
          {next && <button className="app-btn-secondary mt-3 px-3 py-3 text-sm" disabled={busy || next.locked || Boolean(nextTogether && !pairActive)} onClick={() => void onStart(next.key, nextTogether ? pairId ?? undefined : undefined)}>{nextTogether && !pairActive ? "Следующий шаг — после создания или возобновления пары" : program.completedSteps ? "Продолжить программу" : "Начать программу"}</button>}
          {!next && <p className="mt-3 text-sm">Программа завершена. Можно выбрать другую область или личную практику.</p>}
          <ol className="mt-3 space-y-2">{program.contentKeys.map((key, index) => {
            const card = overview.content.find((item) => item.key === key);
            if (!card) return null;
            const together = isTogetherDevelopment(card.kind);
            return <li key={key}><button className="block min-h-11 w-full rounded-lg px-2 py-2 text-left text-sm underline disabled:opacity-50" disabled={busy || card.locked || (together && !pairActive)} onClick={() => void onStart(key, together ? pairId ?? undefined : undefined)}>{index + 1}. {card.title}{card.completedCount ? " · пройдено" : ""}{together && !pairActive ? " · нужна действующая пара" : ""}{card.locked ? " · дополнительный материал" : ""}</button></li>;
          })}</ol>
          <p className="app-muted mt-3 text-sm">Можно идти в своём порядке. Сохранённое занятие откроется в той редакции, в которой было начато.</p>
        </details>;
      })}</div>
    </section>
  </>;
}
