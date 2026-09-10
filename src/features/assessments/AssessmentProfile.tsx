'use client';
import Link from 'next/link';
import type { OwnerAssessmentProfileDTO } from '@/lib/dto/assessment.dto';
import type { AssessmentSkillSnapshot, AssessmentTrackSnapshot } from '@/lib/dto/assessmentClient.dto';

const levelText = (track: AssessmentTrackSnapshot) => track.status === 'INCONSISTENT' || track.possibleLevels.length === 0 ? 'Сведения не согласуются: уровень не установлен' : track.exactLevel !== null ? `Уровень ${track.exactLevel}` : track.observationCount === 0 ? 'Неизвестно: нет подходящих данных' : track.possibleLevels.length === 4 ? 'Частичные данные: уровень пока неизвестен' : `Возможные уровни: ${track.possibleLevels.join(', ')}`;
const date = (value: string) => new Date(value).toLocaleDateString('ru-RU', { timeZone: 'UTC' });
const patternName = (id: string) => id === 'NEG.AGR.01' ? 'Невыполнение договорённости' : id === 'NEG.DOM.01' ? 'Перенос ответственности без согласования' : 'Преднамеренное уничтожение результата';
function patternText(pattern: AssessmentSkillSnapshot['CMinus']): string {
  const evidence = pattern.evidence;
  if (evidence.signedRate !== null) return `${evidence.yes ? '−' : ''}${evidence.yes}/${evidence.denominator} описанных возможностей`;
  if (evidence.signedBounds) return `от −${evidence.yes + evidence.unknown}/${evidence.denominator} до ${evidence.yes ? '−' : ''}${evidence.yes}/${evidence.denominator} описанных возможностей; часть исходов неизвестна`;
  return evidence.occurrenceRoots.length ? `${evidence.occurrenceRoots.length} описанных проявлений; доля неизвестна` : 'неизвестно: недостаточно подходящих описанных случаев';
}
function NegativeComponents({ skill }: { skill: AssessmentSkillSnapshot }) {
  const relevant = (patterns: AssessmentSkillSnapshot['NMinus']) => patterns.filter(pattern => skill.skillId === 'DOM.S07' || pattern.evidence.denominator > 0 || pattern.evidence.occurrenceRoots.length > 0);
  return <div className="space-y-4 rounded-2xl border border-[#e4cbd2] bg-[#fcf0f0] p-4 sm:p-5"><h4 className="text-lg font-semibold">Отдельно: что описано в эпизодах</h4>
    {skill.A.provenance && <p className="app-muted text-sm leading-relaxed">Период применения: {date(skill.A.provenance.period.startsAt)} — {date(new Date(Date.parse(skill.A.provenance.period.endsAt) - 1).toISOString())} (UTC).</p>}
    <dl className="grid gap-4 lg:grid-cols-3">{[skill.CMinus, ...relevant(skill.NMinus)].map(pattern => <div key={pattern.patternId} className="min-w-0 space-y-1"><dt className="text-sm font-semibold">{patternName(pattern.patternId)}</dt><dd className="text-sm leading-relaxed">{patternText(pattern)}.</dd></div>)}</dl>
    {!!skill.negativeHistory?.length && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 font-semibold">История описанных проявлений</summary><div className="mt-2 space-y-4 border-t pt-4">{skill.negativeHistory.map((entry, index) => <section key={`${entry.period.id}-${index}`} className="space-y-2"><h5 className="font-medium">{date(entry.period.startsAt)} — {date(new Date(Date.parse(entry.period.endsAt) - 1).toISOString())} (UTC)</h5>{[entry.CMinus, ...relevant(entry.NMinus)].map(pattern => <p key={pattern.patternId}>{patternName(pattern.patternId)}: {patternText(pattern)}.</p>)}<p className="app-muted">Датированное описание этого периода; новый пропуск не подтверждает исчезновение прежнего события.</p></section>)}</div></details>}
    <p className="app-muted max-w-[85ch] border-t pt-4 text-sm leading-relaxed">Это доли описанных эпизодов, а не тяжесть, оценка характера или вероятность будущего вреда. Ни один показатель не является гарантией безопасности. Эти сведения остаются личными.</p>
  </div>;
}

function TrackCard({ track, label, index }: { track: AssessmentTrackSnapshot; label: string; index: number }) {
  const provenance = track.provenance;
  const tone = ['border-[#c5d5c6] bg-[#edf3e8]', 'border-[#dfc5d0] bg-[#f9eaf0]', 'border-[#cfc5de] bg-[#eee9f5]'][index];
  return <div className={`flex min-w-0 flex-col rounded-2xl border p-4 shadow-[inset_0_2px_0_#ffffffbb,0_4px_0_#a790991a] sm:p-5 ${tone}`}>
    <dt className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white bg-white/60 text-xs" aria-hidden="true">0{index + 1}</span>{label}</dt>
    <dd className="mt-4 text-lg font-semibold leading-snug">{levelText(track)}</dd>
    <dd className="app-muted mt-3 text-sm leading-relaxed">Отдельных эпизодов: {track.observationCount}. {track.phase === 'ASSISTED' ? 'После учебного образца или подсказки.' : track.phase === 'FOLLOWUP' ? 'Последующее наблюдение.' : 'До учебной подсказки.'}</dd>
    {provenance?.freshness === 'EXPIRED' && <dd className="mt-3 text-sm font-medium">Прошлый материал: текущий результат не установлен.</dd>}
    {provenance && provenance.disputedFactCount > 0 && <dd className="mt-3 text-sm font-medium">Есть несовпадающие сведения; они остаются неизвестностью.</dd>}
    <dd className="mt-auto pt-4"><details className="border-t border-[#bda4b144] text-sm leading-relaxed"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Основания и история</summary>
      {provenance && <p className="app-muted mb-4">{date(provenance.period.startsAt)} — {date(new Date(Date.parse(provenance.period.endsAt) - 1).toISOString())} (UTC). {provenance.samplingFrame === 'ASSIGNED_SCENES' ? 'Предъявленные учебные сцены.' : 'Выбранные описанные эпизоды; не вся повседневная жизнь.'} {provenance.lastObservedAt ? `Последнее наблюдение: ${date(provenance.lastObservedAt)}.` : 'Дата отдельного наблюдения неизвестна.'}</p>}
      <ul className="space-y-2">{track.result.criteria.map(criterion => <li key={criterion.level}>Критерий уровня {criterion.level}: {criterion.decision === 'MET' ? 'поддержан данным материалом' : criterion.decision === 'NOT_MET' ? 'не выполнен в данном материале' : 'не установлен'}.</li>)}</ul>
      {track.history?.map((entry, historyIndex) => <p key={historyIndex} className="mt-3 border-t border-[#bda4b144] pt-3">{date(entry.period.startsAt)} — {date(new Date(Date.parse(entry.period.endsAt) - 1).toISOString())}: {entry.exactLevel === null ? `возможные уровни ${entry.possibleLevels.join(', ')}` : `уровень ${entry.exactLevel}`}. {entry.comparable ? 'Сопоставимый материал.' : 'Другой контекст или период: прямое сравнение не установлено.'}</p>)}
    </details></dd>
  </div>;
}

export function AssessmentProfile({ profile }: { profile: OwnerAssessmentProfileDTO }) {
  const snapshot = profile.snapshot;
  return <section className="min-w-0 space-y-5" aria-label="Навыки: раздельные личные показатели">
    <header className="space-y-3"><p className="app-muted text-xs font-bold uppercase tracking-[.12em]">Личный взгляд на свой опыт</p><h2 className="text-2xl font-semibold sm:text-3xl">Мои результаты по отдельным темам</h2><p className="app-muted max-w-[78ch] leading-relaxed">Авторская пробная анкета. Понимание, учебный выбор и описанное применение рассматриваются отдельно. Положительные навыки не компенсируют вред.</p></header>
    {profile.status === 'PENDING' && <p className="app-panel-soft p-5 leading-relaxed" role="status">Ответы сохранены; расчёт ожидает восстановления.</p>}
    {!snapshot && profile.status !== 'PENDING' && <div className="app-panel-soft space-y-2 p-5 sm:p-6"><p className="font-semibold">Здесь появятся ваши результаты</p><p className="app-muted max-w-[68ch] leading-relaxed">Пройдите анкету или продолжите сохранённый черновик. Неизвестность не означает нулевой уровень.</p></div>}
    {snapshot && <>
      <details className="app-panel-soft px-5 py-2 text-sm leading-relaxed"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Как читать эти результаты</summary><p className="app-muted max-w-[85ch] pb-3">Источник: ваши сохранённые ответы{snapshot.sourceSetIdentity ? '. Каждый компонент ниже сохраняет свой период и происхождение' : ` · период (UTC) ${date(snapshot.period.startsAt)} — ${date(new Date(Date.parse(snapshot.period.endsAt) - 1).toISOString())} · редакция ${snapshot.publicationVersion}`}. Критерий «4 эпизода, 2 семейства, 3/4» — авторская некалиброванная политика.</p></details>
      {snapshot.skills.map(skill => <article key={skill.skillId} className="app-panel space-y-5 p-4 sm:p-6" data-skill-id={skill.skillId}>
        <header className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-semibold sm:text-2xl">{skill.name}</h3><span className="rounded-full border bg-white/60 px-3 py-1 text-xs font-medium">Личные результаты</span></header>
        <dl className="grid gap-4 md:grid-cols-3">{([['K', 'Понимание'], ['D', 'Учебное выполнение'], ['A', 'Описанное применение']] as const).map(([key, label], index) => <TrackCard key={key} track={skill[key]} label={label} index={index} />)}</dl>
        <NegativeComponents skill={skill} />
        {skill.skillId !== 'DOM.S07' && <p className="app-muted max-w-[85ch] text-sm leading-relaxed">Для этой темы доступны отдельные учебные формы и добровольное описание применения. Непредъявленный материал остаётся неизвестным.</p>}
      </article>)}
    </>}
    {!!profile.unavailableSkills?.length && <details className="app-panel p-5"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Другие определения каталога: {profile.unavailableSkills.length} тем без готовой рубрики</summary><p className="app-muted mt-3 max-w-[85ch] leading-relaxed">Это авторские определения, а не ваши измеренные уровни. Для этих тем результат неизвестен: подходящей рубрики пока нет. Средний балл по домену не вычисляется.</p><div className="mt-4 space-y-3">{profile.unavailableSkills.map(({ definition }) => <details key={definition.id} className="app-panel-soft space-y-3 px-4 py-2 text-sm leading-relaxed" data-unavailable-skill-id={definition.id}><summary className="min-h-11 cursor-pointer py-3 font-semibold">{definition.name} · неизвестно</summary><p>{definition.level_1}</p><p>{definition.level_2}</p><p>{definition.level_3}</p><p className="app-muted pb-3">{definition.limits}</p></details>)}</div></details>}
    <div className="flex flex-wrap gap-3"><Link className="app-btn-primary inline-flex" href="/assessments">Темы, ответы и добровольные практики</Link>{snapshot && !snapshot.sourceSetIdentity && <Link className="app-btn-secondary inline-flex" href="/assessments/dom-s07">Ответы первой бытовой анкеты</Link>}</div>
  </section>;
}
