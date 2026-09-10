'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { assessmentBetaApi } from '@/client/api/assessmentBeta';
import { useAssessmentResource } from '@/client/hooks/useAssessmentResource';
import { useUnsavedChanges } from '@/client/hooks/useUnsavedChanges';
import { ASSESSMENT_INFORMATION_VERSION, ASSESSMENT_TERMS_VERSION, type AssessmentChoices, type AssessmentSettingsDTO } from '@/lib/dto/assessmentClient.dto';

type Resource = ReturnType<typeof useAssessmentResource<AssessmentSettingsDTO>>;
function SettingsForm({ data, resource, registration }: { data: AssessmentSettingsDTO; resource: Resource; registration: boolean }) {
  const [choices, setChoices] = useState<AssessmentChoices>(data.settings);
  const [adult, setAdult] = useState(false), [terms, setTerms] = useState(false), [dirty, setDirty] = useState(false);
  const receipt = useRef<string | null>(null);
  useUnsavedChanges(dirty, resource.busy);
  const change = (key: 'ownerAssessment' | 'discovery' | 'pairSharing', value: boolean) => { setChoices(previous => ({ ...previous, [key]: value })); setDirty(true); receipt.current = null; };
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault();
    if (registration && (!adult || !terms || !choices.ownerAssessment)) return;
    receipt.current ??= crypto.randomUUID();
    const submittedKey = receipt.current;
    void resource.run(async (current, signal) => {
      if (registration) await assessmentBetaApi.register({ viewerToken: current.viewerToken, idempotencyKey: submittedKey, termsAccepted: true, adultConfirmed: true, termsVersion: ASSESSMENT_TERMS_VERSION, informationVersion: ASSESSMENT_INFORMATION_VERSION, ownerAssessment: choices.ownerAssessment, discovery: choices.discovery, pairSharing: choices.pairSharing }, signal);
      else await assessmentBetaApi.updateSettings({ ...choices, viewerToken: current.viewerToken, expectedRevision: current.revision }, signal);
    }).then(ok => { if (ok) { setDirty(false); receipt.current = null; } });
  }}>
    {registration && <fieldset disabled={resource.busy} className="space-y-3"><legend className="font-semibold">Условия участия</legend>
      <p>Закрытая бета «Вместе» предназначена для приглашённых совершеннолетних. Авторские анкеты описывают выбранные действия, не дают диагноз и не обещают результат отношений. Участие добровольно: можно пропустить вопрос, остановиться или выйти. Не публикуйте чужие личные сведения; контакт и договорённости требуют самостоятельного решения каждого.</p>
      <label className="flex min-h-11 gap-3 items-center"><input type="checkbox" checked={adult} onChange={event => setAdult(event.target.checked)} />Мне исполнилось 18 лет.</label>
      <label className="flex min-h-11 gap-3 items-center"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} />Принимаю описанные условия использования закрытой беты.</label>
    </fieldset>}
    <fieldset disabled={resource.busy} className="space-y-3"><legend className="font-semibold">Обработка данных и использование результатов</legend>
      <p>Три темы: бытовая ответственность, конкретная просьба, пауза и возврат к разговору. Ваши ответы сохраняются в аккаунте. Эти настройки применяются к выбранным сохранённым и будущим анкетам. Разрешённые расчёты и история обновляются автоматически после сохранения; повторно подтверждать каждую операцию не требуется.</p>
      <label className="flex min-h-11 gap-3 items-start"><input className="mt-1" type="checkbox" checked={choices.ownerAssessment} onChange={event => change('ownerAssessment', event.target.checked)} /><span>Разрешаю сохранять мои ответы на эти темы, рассчитывать отдельные личные результаты и обновлять их историю.</span></label>
      <label className="flex min-h-11 gap-3 items-start"><input className="mt-1" type="checkbox" checked={choices.discovery} onChange={event => change('discovery', event.target.checked)} /><span>Включаю поиск в закрытой бете: разрешаю использовать мои условия и допущенные краткие выводы для сравнения с участниками. Личные ответы и негативные компоненты им не показываются.</span></label>
      <label className="flex min-h-11 gap-3 items-start"><input className="mt-1" type="checkbox" checked={choices.pairSharing} onChange={event => change('pairSharing', event.target.checked)} /><span>Разрешаю ограниченное сравнение с текущим партнёром. Это не подтверждает конкретную договорённость и не открывает ему мои ответы или личные отчёты.</span></label>
      <p className="app-muted text-sm">Исследования, маркетинг, чувствительные модули и дополнительные передачи этим выбором не включаются. Расширение назначений потребует отдельного решения.</p>
    </fieldset>
    {!registration && data.availablePublicationIds.length > 0 && <details className="app-panel-soft p-3"><summary>Управлять областью анкет</summary><p className="app-muted text-sm my-2">Снятие отметки прекращает использование этой формы. Новые формы не включаются автоматически.</p>{data.availablePublicationIds.map(id => <label key={id} className="flex min-h-11 gap-3 items-center"><input type="checkbox" disabled={resource.busy} checked={choices.publicationIds.includes(id)} onChange={event => { setChoices(previous => ({ ...previous, publicationIds: event.target.checked ? [...previous.publicationIds, id] : previous.publicationIds.filter(value => value !== id) })); setDirty(true); }} /><span>{publicationLabel(id)}</span></label>)}</details>}
    <button className="app-btn-primary" disabled={resource.busy || (registration && (!adult || !terms || !choices.ownerAssessment))}>{resource.busy ? 'Ждём подтверждения сервера…' : registration ? 'Сохранить выбор и продолжить' : 'Сохранить настройки'}</button>
    {dirty && <p role="status" className="app-muted">Изменения ещё не подтверждены сервером.</p>}
  </form>;
}
function publicationLabel(id: string) {
  if (id === 'dom-s07-application-clarification-beta') return 'Бытовая ответственность: необязательное дополнение об эпизоде (2 страницы)';
  const topic = id.startsWith('dom-s07') ? 'Бытовая ответственность' : id.startsWith('com-s02') ? 'Конкретная просьба' : 'Пауза и возврат';
  return `${topic}: ${id.includes('knowledge') ? 'понимание' : id.includes('task') ? 'учебное выполнение' : id.includes('application') ? 'описанное применение' : 'первая анкета'}`;
}
export default function AssessmentSettingsPanel({ registration = false }: { registration?: boolean }) {
  const resource = useAssessmentResource(assessmentBetaApi.settings);
  const { data, busy, error, saved } = resource;
  const register = registration && data?.admission === 'INVITED';
  return <section className="app-panel p-4 space-y-4" id="assessment-settings" aria-labelledby="assessment-settings-heading">
    <h2 id="assessment-settings-heading" className="text-xl font-semibold">{register ? 'Участие в закрытой бете' : 'Навыки и анкеты: мои данные'}</h2>
    {error && <p role="alert">{error}</p>}{!data && <button className="app-btn-secondary" disabled={busy} onClick={() => void resource.reload()}>{busy ? 'Проверяем текущий аккаунт…' : 'Загрузить настройки'}</button>}
    {saved && <p role="status">Выбор сохранён на сервере. Он применяется к следующим разрешённым действиям.</p>}
    {data && <>
      <details className="app-panel-soft p-3" open={Boolean(register)}><summary className="font-semibold">Какие данные, для чего и кому доступны</summary><div className="space-y-4 mt-3">{data.dataFlow.map((flow, index) => <div key={index}><p className="font-medium">{flow.data}</p><p>{flow.purpose}.</p><p className="app-muted">{flow.recipients}. {flow.retention}.</p></div>)}</div></details>
      {(data.admission === 'ACTIVE' || register) && <SettingsForm key={`${resource.ownerId}:${data.revision}`} data={data} resource={resource} registration={Boolean(register)} />}
      {data.admission === 'INVITED' && !registration && <Link href="/assessments/start" className="app-btn-primary inline-flex">Открыть условия участия</Link>}
      {data.admission === 'UNAVAILABLE' && <p>Участие пока недоступно этому аккаунту. Доступ к вашим существующим данным и настройкам аккаунта сохраняется.</p>}
      {data.admission === 'REVOKED' && <p>Вы вышли из беты. Новые ответы и выдача закрыты; экспорт и удаление остаются доступны.</p>}
      {data.admission === 'ACTIVE' && <div className="flex flex-wrap gap-3"><Link href="/assessments" className="app-btn-secondary inline-flex">К темам и результатам</Link><button className="app-btn-secondary" disabled={busy} onClick={() => void resource.run(async (current, signal) => { await assessmentBetaApi.withdraw({ viewerToken: current.viewerToken, expectedRevision: current.revision }, signal); })}>Выйти из закрытой беты</button></div>}
      <div className="flex flex-wrap gap-3"><Link href="/profile/settings" className="underline">Экспорт и удаление аккаунта</Link><Link href="/assessments/support" className="underline">Сообщить об ошибке или неподходящем результате</Link><Link href="/profile/help" className="underline">Личная помощь и безопасный выход</Link></div>
    </>}
  </section>;
}
