'use client';
import Link from 'next/link';
import type { OwnerAssessmentProfileDTO } from '@/lib/dto/assessment.dto';
import type { AssessmentTrackSnapshot } from '@/domain/assessment/profile';

const levelText = (track: AssessmentTrackSnapshot) => track.exactLevel !== null ? `Уровень ${track.exactLevel}` : track.observationCount === 0 ? 'Неизвестно: нет подходящих данных' : track.possibleLevels.length === 4 ? 'Частичные данные: уровень пока неизвестен' : `Возможные уровни: ${track.possibleLevels.join(', ')}`;
const date = (value: string) => new Date(value).toLocaleDateString('ru-RU', { timeZone: 'UTC' });
export function AssessmentProfile({ profile }: { profile: OwnerAssessmentProfileDTO }) {
  const snapshot = profile.snapshot;
  return <section className="space-y-4" aria-label="Бытовая ответственность: раздельные показатели">
    <h2 className="text-xl font-semibold">Бытовая ответственность</h2>
    <p className="app-muted">Авторская пробная анкета. Понимание, учебный выбор и описанное применение рассматриваются отдельно. Положительные навыки не компенсируют вред.</p>
    {profile.status === 'PENDING' && <p role="status">Ответы сохранены; расчёт ожидает восстановления.</p>}
    {!snapshot && profile.status !== 'PENDING' && <p>Пройдите анкету или продолжите сохранённый черновик. Неизвестность не означает нулевой уровень.</p>}
    {snapshot && <>
      <p className="app-muted text-sm">Источник: ваши сохранённые ответы · период (UTC) {date(snapshot.period.startsAt)} — {date(new Date(Date.parse(snapshot.period.endsAt) - 1).toISOString())} · редакция {snapshot.publicationVersion}. Критерий «4 эпизода, 2 семейства, 3/4» — авторская некалиброванная политика.</p>
      {snapshot.skills.map(skill => <article key={skill.skillId} className="app-panel p-4 space-y-3" data-skill-id={skill.skillId}>
        <h3 className="font-semibold">{skill.name}</h3>
        <dl className="grid gap-3 sm:grid-cols-3">{([['K', 'Понимание'], ['D', 'Учебное выполнение'], ['A', 'Описанное применение']] as const).map(([key, label]) => <div key={key} className="app-panel-soft p-3"><dt className="font-medium">{label}</dt><dd>{levelText(skill[key])}</dd><dd className="app-muted text-sm">Отдельных эпизодов: {skill[key].observationCount}. {skill[key].phase === 'ASSISTED' ? 'После учебного образца или подсказки.' : skill[key].phase === 'FOLLOWUP' ? 'Последующее наблюдение.' : 'До учебной подсказки.'}</dd></div>)}</dl>
        {skill.skillId === 'DOM.S07' && <div className="border-t pt-3 space-y-2"><h4 className="font-medium">Отдельные отрицательные компоненты</h4>{[skill.CMinus, ...skill.NMinus].map(pattern => <p key={pattern.patternId}>{pattern.patternId === 'NEG.AGR.01' ? 'Невыполнение договорённости' : pattern.patternId === 'NEG.DOM.01' ? 'Перенос ответственности без согласования' : 'Преднамеренное уничтожение результата'}: {pattern.evidence.signedRate === null ? pattern.evidence.occurrenceRoots.length ? `${pattern.evidence.occurrenceRoots.length} описанных проявлений; доля неизвестна` : 'неизвестно' : `${pattern.evidence.yes ? '−' : ''}${pattern.evidence.yes}/${pattern.evidence.denominator} описанных возможностей`}.</p>)}<p className="app-muted text-sm">Это доли описанных эпизодов, а не тяжесть, оценка характера или вероятность будущего вреда. Ни один показатель не является гарантией безопасности.</p></div>}
        {skill.skillId !== 'DOM.S07' && <p className="app-muted">Рубрика сохранена в реестре, но анкета этого навыка ещё не опубликована. Результаты не измерены.</p>}
      </article>)}
    </>}
    <Link className="app-btn-primary inline-flex" href="/assessments/dom-s07">{snapshot ? 'Ответы, исправление и разрешения' : 'Открыть анкету бытовой ответственности'}</Link>
  </section>;
}
