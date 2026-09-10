'use client';
import Link from 'next/link';
import { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { useAssessmentPrivacy, type AssessmentPrivacyAction } from '@/client/hooks/useAssessmentPrivacy';

export default function AssessmentPrivacyControls() {
  const { data, busy, error, saved, load, mutate } = useAssessmentPrivacy();
  const [deletion, setDeletion] = useState<'delete-run' | 'delete-direct' | null>(null);
  const change = (action: AssessmentPrivacyAction) => { void mutate(action); };
  return <section className="app-panel p-4 space-y-4" aria-label="Управление сохранёнными данными анкеты">
    <h2 className="font-semibold text-lg">Управление сохранёнными данными</h2>
    <p>Если прохождение сейчас недоступно, можно проверить собственные разрешения, отозвать использование данных или удалить свои ответы. Действия выполняются только по вашему выбору.</p>
    <button className="app-btn-secondary" disabled={busy} onClick={() => { setDeletion(null); void load(); }}>Показать мои сохранённые разрешения</button>
    {busy && <p role="status">Проверяем подтверждение сервера…</p>}{error && <p role="alert">{error}</p>}{saved && <p role="status">Изменение подтверждено сервером.</p>}
    {data && <>
      {data.run && data.run.status !== 'NEW' && data.run.status !== 'DELETED' && <div className="space-y-3"><h3 className="font-medium">Измерительные ответы</h3><p>Для сравнения: {data.run.matchingUse ? 'разрешены' : 'не разрешены'}. Для договорённостей пары: {data.run.pairUse ? 'разрешены' : 'не разрешены'}.</p><div className="flex flex-wrap gap-3">{data.run.matchingUse && <button className="app-btn-secondary" disabled={busy} onClick={() => change('revoke-run-matching')}>Отозвать измерительные ответы из сравнения</button>}{data.run.pairUse && <button className="app-btn-secondary" disabled={busy} onClick={() => change('revoke-run-pair')}>Отозвать измерительные ответы из договорённостей</button>}<button className="app-btn-secondary" disabled={busy} onClick={() => setDeletion('delete-run')}>Удалить мои измерительные ответы</button></div></div>}
      {data.comparison && data.comparison.direct.revision > 0 && <div className="space-y-3"><h3 className="font-medium">Прямые позиции и предложения</h3><p>Для сравнения: {data.comparison.direct.useForComparison ? 'разрешены' : 'не разрешены'}. Для договорённостей пары: {data.comparison.direct.pairUse ? 'разрешены' : 'не разрешены'}.</p><div className="flex flex-wrap gap-3">{data.comparison.direct.useForComparison && <button className="app-btn-secondary" disabled={busy} onClick={() => change('revoke-direct-matching')}>Отозвать позиции из сравнения</button>}{data.comparison.direct.pairUse && <button className="app-btn-secondary" disabled={busy} onClick={() => change('revoke-direct-pair')}>Отозвать позиции из договорённостей</button>}<button className="app-btn-secondary" disabled={busy} onClick={() => setDeletion('delete-direct')}>Удалить мои прямые ответы</button></div></div>}
      {data.pair?.context && data.pair.revision > 0 && <div className="space-y-3"><h3 className="font-medium">Участие в последней своей договорённости</h3><button className="app-btn-secondary" disabled={busy} onClick={() => change('withdraw-pair')}>Отозвать моё участие в договорённости</button></div>}
      {!data.run && !data.comparison && !data.pair?.context && <p>Для текущего аккаунта сохранённых данных этого раздела не найдено.</p>}
      <Link className="app-btn-secondary inline-flex" href="/profile/settings">Экспорт собственных данных в настройках</Link>
    </>}
    <Dialog open={Boolean(deletion && data)} onClose={() => setDeletion(null)} title="Удалить свои ответы?" busy={busy} footer={<><button className="app-btn-secondary" disabled={busy} onClick={() => setDeletion(null)}>Отмена</button><button className="app-btn-primary" disabled={busy || !data} onClick={() => { if (deletion) void mutate(deletion).then(ok => { if (ok) setDeletion(null); }); }}>Удалить выбранные ответы</button></>}><p>Будут удалены ваши {deletion === 'delete-run' ? 'измерительные ответы и их производный профиль' : 'прямые позиции, предложения и основанные на них сравнения'}. Отдельные ответы другого участника сохраняются.</p></Dialog>
  </section>;
}
