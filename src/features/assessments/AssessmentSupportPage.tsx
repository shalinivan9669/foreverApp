'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import BackBar from '@/components/ui/BackBar';
import { assessmentBetaApi } from '@/client/api/assessmentBeta';
import { assessmentApi } from '@/client/api/assessment';
import { useAssessmentResource } from '@/client/hooks/useAssessmentResource';
import { useUnsavedChanges } from '@/client/hooks/useUnsavedChanges';
import type { AssessmentSupportInput } from '@/lib/dto/assessmentClient.dto';

const readSupport = async (signal: AbortSignal) => {
  const [settings, tickets] = await Promise.all([assessmentBetaApi.settings(signal), assessmentBetaApi.supportList(signal)]);
  return { settings, tickets };
};
type Resource = ReturnType<typeof useAssessmentResource<Awaited<ReturnType<typeof readSupport>>>>;
function SupportBody({ resource }: { resource: Resource }) {
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<AssessmentSupportInput['category']>('CLARITY');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [publicationId, setPublicationId] = useState('');
  const [attachment, setAttachment] = useState<AssessmentSupportInput['attachResult']>();
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);
  useEffect(() => {
    if (!publicationId) return;
    const abort = new AbortController();
    void assessmentApi.get(abort.signal, publicationId).then(run => {
      if (abort.signal.aborted) return;
      if (run.runId && run.status === 'FINALIZED') setAttachment({ runId: run.runId, revision: run.revision, consent: true });
      else setAttachmentError('У этой формы нет завершённого результата. Можно отправить сообщение без приложения.');
    }).catch(() => { if (!abort.signal.aborted) setAttachmentError('Результат не удалось проверить. Уберите приложение или выберите форму снова.'); });
    return () => abort.abort();
  }, [publicationId]);
  useUnsavedChanges(message.length > 0, resource.busy);
  return <main className="app-shell-narrow py-5 space-y-5"><BackBar title="Обратная связь" fallbackHref="/assessments" /><h1 className="text-2xl font-semibold">Сообщить о проблеме</h1>
    <p>Опишите непонятный вопрос, ошибку или результат, который вам не подходит. Обращение доступно уполномоченной поддержке. Оно не меняет ваши показатели и не отправляется партнёру.</p>
    <p className="app-muted">Ответы анкет и результаты не прикладываются автоматически. Не включайте чужую переписку и личные данные. Поддержка не является круглосуточной экстренной службой.</p>
    {resource.error && <p role="alert">{resource.error}</p>}
    {receipt && <p role="status" className="app-panel-soft p-3">Обращение сохранено. {receipt}</p>}
    {!resource.data && <button className="app-btn-secondary" disabled={resource.busy} onClick={() => void resource.reload()}>{resource.busy ? 'Проверяем текущий аккаунт…' : 'Повторить загрузку'}</button>}
    {resource.data && <form key={resource.ownerId} className="app-panel p-4 space-y-4" onSubmit={event => {
      event.preventDefault(); requestKey.current ??= crypto.randomUUID();
      const submittedKey = requestKey.current;
      void resource.run(async (current, signal) => { await assessmentBetaApi.support({ viewerToken: current.settings.viewerToken, idempotencyKey: submittedKey, category, message, ...(publicationId && attachment ? { publicationId, attachResult: attachment } : {}) }, signal); }).then(ok => { if (ok) { setMessage(''); setPublicationId(''); setAttachment(undefined); setReceipt('Смотрите список ваших обращений ниже.'); requestKey.current = null; } });
    }}><fieldset disabled={resource.busy} className="space-y-4"><label className="block">Тема<select className="app-input mt-2 w-full" value={category} onChange={event => { const value = event.target.value; if (value === 'CLARITY' || value === 'INAPPROPRIATE' || value === 'BUG' || value === 'PRIVACY') setCategory(value); requestKey.current = null; }}><option value="CLARITY">Непонятно</option><option value="INAPPROPRIATE">Мне не подходит</option><option value="BUG">Техническая ошибка</option><option value="PRIVACY">Мои данные и приватность</option></select></label>
      <label className="block">Ваше сообщение<textarea className="app-input mt-2 w-full" required maxLength={2000} rows={6} value={message} onChange={event => { setMessage(event.target.value); requestKey.current = null; setReceipt(null); }} /></label>
      <label className="block">Необязательно: приложить свой конкретный результат для поддержки<select className="app-input block w-full mt-2" value={publicationId} onChange={event => { setPublicationId(event.target.value); setAttachment(undefined); setAttachmentError(null); requestKey.current = null; }}><option value="">Без приложения</option>{resource.data.settings.settings.publicationIds.map(id => <option key={id} value={id}>{id.startsWith('dom-s07') ? 'Бытовая ответственность' : id.startsWith('com-s02') ? 'Конкретная просьба' : 'Пауза и возврат'} · {id.includes('knowledge') ? 'понимание' : id.includes('task') ? 'учебное выполнение' : id.includes('application') ? 'применение' : 'первая анкета'}</option>)}</select></label>
      {publicationId && <p className="app-muted">Выбранная сохранённая ревизия и её результат будут доступны уполномоченной поддержке для этого обращения.</p>}{attachmentError && <p role="alert">{attachmentError}</p>}
      <button className="app-btn-primary" disabled={resource.busy || !message.trim() || Boolean(publicationId && !attachment)}>{resource.busy ? 'Отправляем…' : attachment ? 'Отправить сообщение с выбранным результатом' : 'Отправить только это сообщение'}</button>
    </fieldset></form>}
    {resource.data && <section className="space-y-3"><h2 className="text-xl font-semibold">Мои обращения</h2>{resource.data.tickets.length === 0 ? <p>Обращений пока нет.</p> : <ul className="space-y-2">{resource.data.tickets.map(ticket => <li key={ticket.id} className="app-panel-soft p-3"><time>{new Date(ticket.createdAt).toLocaleDateString('ru-RU')}</time> · {ticket.status === 'OPEN' ? 'Ожидает обработки' : 'Закрыто'} · {ticket.attachedResult ? 'Результат приложен по вашему выбору' : 'Без приложенного результата'}</li>)}</ul>}</section>}
    <div className="flex flex-wrap gap-4"><Link href="/profile/settings#assessment-settings" className="underline">Ограничить использование или удалить данные</Link><Link href="/profile/help" className="underline">Личная помощь</Link></div>
  </main>;
}
export default function AssessmentSupportPage() {
  const resource = useAssessmentResource(readSupport);
  return <SupportBody key={resource.ownerId ?? 'unverified'} resource={resource} />;
}
