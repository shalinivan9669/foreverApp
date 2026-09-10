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
  return <div className="border-t pt-3 space-y-2"><h4 className="font-medium">Отдельно: что описано в эпизодах</h4>
    {skill.A.provenance && <p className="app-muted text-sm">Период применения: {date(skill.A.provenance.period.startsAt)} — {date(new Date(Date.parse(skill.A.provenance.period.endsAt) - 1).toISOString())} (UTC).</p>}
    {[skill.CMinus, ...relevant(skill.NMinus)].map(pattern => <p key={pattern.patternId}>{patternName(pattern.patternId)}: {patternText(pattern)}.</p>)}
    {!!skill.negativeHistory?.length && <details className="text-sm"><summary>История описанных проявлений</summary><div className="mt-2 space-y-3">{skill.negativeHistory.map((entry, index) => <section key={`${entry.period.id}-${index}`}><h5 className="font-medium">{date(entry.period.startsAt)} — {date(new Date(Date.parse(entry.period.endsAt) - 1).toISOString())} (UTC)</h5>{[entry.CMinus, ...relevant(entry.NMinus)].map(pattern => <p key={pattern.patternId}>{patternName(pattern.patternId)}: {patternText(pattern)}.</p>)}<p className="app-muted">Датированное описание этого периода; новый пропуск не подтверждает исчезновение прежнего события.</p></section>)}</div></details>}
    <p className="app-muted text-sm">Это доли описанных эпизодов, а не тяжесть, оценка характера или вероятность будущего вреда. Ни один показатель не является гарантией безопасности. Эти сведения остаются личными.</p>
  </div>;
}
export function AssessmentProfile({ profile }: { profile: OwnerAssessmentProfileDTO }) {
  const snapshot = profile.snapshot;
  return <section className="space-y-4" aria-label="Навыки: раздельные личные показатели">
    <h2 className="text-xl font-semibold">Мои результаты по отдельным темам</h2>
    <p className="app-muted">Авторская пробная анкета. Понимание, учебный выбор и описанное применение рассматриваются отдельно. Положительные навыки не компенсируют вред.</p>
    {profile.status === 'PENDING' && <p role="status">Ответы сохранены; расчёт ожидает восстановления.</p>}
    {!snapshot && profile.status !== 'PENDING' && <p>Пройдите анкету или продолжите сохранённый черновик. Неизвестность не означает нулевой уровень.</p>}
    {snapshot && <>
      <p className="app-muted text-sm">Источник: ваши сохранённые ответы{snapshot.sourceSetIdentity ? '. Каждый компонент ниже сохраняет свой период и происхождение' : ` · период (UTC) ${date(snapshot.period.startsAt)} — ${date(new Date(Date.parse(snapshot.period.endsAt) - 1).toISOString())} · редакция ${snapshot.publicationVersion}`}. Критерий «4 эпизода, 2 семейства, 3/4» — авторская некалиброванная политика.</p>
      {snapshot.skills.map(skill => <article key={skill.skillId} className="app-panel p-4 space-y-3" data-skill-id={skill.skillId}>
        <h3 className="font-semibold">{skill.name}</h3>
        <dl className="grid gap-3 sm:grid-cols-3">{([['K', 'Понимание'], ['D', 'Учебное выполнение'], ['A', 'Описанное применение']] as const).map(([key, label]) => <div key={key} className="app-panel-soft p-3 min-w-0"><dt className="font-medium">{label}</dt><dd>{levelText(skill[key])}</dd><dd className="app-muted text-sm">Отдельных эпизодов: {skill[key].observationCount}. {skill[key].phase === 'ASSISTED' ? 'После учебного образца или подсказки.' : skill[key].phase === 'FOLLOWUP' ? 'Последующее наблюдение.' : 'До учебной подсказки.'}</dd>{skill[key].provenance && <dd className="app-muted text-sm mt-2">{date(skill[key].provenance!.period.startsAt)} — {date(new Date(Date.parse(skill[key].provenance!.period.endsAt) - 1).toISOString())} (UTC). {skill[key].provenance!.samplingFrame === 'ASSIGNED_SCENES' ? 'Предъявленные учебные сцены.' : 'Выбранные описанные эпизоды; не вся повседневная жизнь.'} {skill[key].provenance!.freshness === 'EXPIRED' ? 'Прошлый материал: текущий результат не установлен.' : ''} {skill[key].provenance!.lastObservedAt ? `Последнее наблюдение: ${date(skill[key].provenance!.lastObservedAt!)}.` : 'Дата отдельного наблюдения неизвестна.'} {skill[key].provenance!.disputedFactCount > 0 ? 'Есть несовпадающие сведения; они остаются неизвестностью.' : ''}</dd>}<dd><details className="mt-2 text-sm"><summary>Основания и история</summary><ul className="mt-2 space-y-1">{skill[key].result.criteria.map(criterion => <li key={criterion.level}>Критерий уровня {criterion.level}: {criterion.decision === 'MET' ? 'поддержан данным материалом' : criterion.decision === 'NOT_MET' ? 'не выполнен в данном материале' : 'не установлен'}.</li>)}</ul>{skill[key].history?.map((entry, index) => <p key={index} className="mt-2">{date(entry.period.startsAt)} — {date(new Date(Date.parse(entry.period.endsAt) - 1).toISOString())}: {entry.exactLevel === null ? `возможные уровни ${entry.possibleLevels.join(', ')}` : `уровень ${entry.exactLevel}`}. {entry.comparable ? 'Сопоставимый материал.' : 'Другой контекст или период: прямое сравнение не установлено.'}</p>)}</details></dd></div>)}</dl>
        <NegativeComponents skill={skill} />
        {skill.skillId !== 'DOM.S07' && <p className="app-muted">Для этой темы доступны отдельные учебные формы и добровольное описание применения. Непредъявленный материал остаётся неизвестным.</p>}
      </article>)}
    </>}
    {!!profile.unavailableSkills?.length && <details className="app-panel p-4"><summary>Другие определения каталога: {profile.unavailableSkills.length} тем без готовой рубрики</summary><p className="app-muted mt-3">Это авторские определения, а не ваши измеренные уровни. Для этих тем результат неизвестен: подходящей рубрики пока нет. Средний балл по домену не вычисляется.</p><div className="space-y-3 mt-3">{profile.unavailableSkills.map(({ definition }) => <details key={definition.id} data-unavailable-skill-id={definition.id}><summary>{definition.name} · неизвестно</summary><p>{definition.level_1}</p><p>{definition.level_2}</p><p>{definition.level_3}</p><p className="app-muted">{definition.limits}</p></details>)}</div></details>}
    <div className="flex flex-wrap gap-3"><Link className="app-btn-primary inline-flex" href="/assessments">Темы, ответы и добровольные практики</Link>{snapshot && !snapshot.sourceSetIdentity && <Link className="app-btn-secondary inline-flex" href="/assessments/dom-s07">Ответы первой бытовой анкеты</Link>}</div>
  </section>;
}
