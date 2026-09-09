"use client";
import Link from "next/link";
import { useState } from "react";
import { usePair } from "@/client/hooks/usePair";
import { useSharedLife } from "@/client/hooks/useSharedLife";
import { useRefreshOnReturn } from "@/client/hooks/useRefreshOnReturn";
import { confirmAppNavigation, useUnsavedChanges } from "@/client/hooks/useUnsavedChanges";
import { SHARED_LIFE_SECTIONS, sharedLifeAgenda, sharedLifeDate, sharedLifeEntries, sharedLifeMoney as money, sharedLifeRole } from "@/client/viewmodels/sharedLife.viewmodels";
import type { SharedLifeEntryInput } from "@/lib/contracts/sharedLife";
import type { SharedLifeEntryDTO } from "@/lib/dto/sharedLife.dto";
import ErrorView from "@/components/ui/ErrorView";
import Dialog from "@/components/ui/Dialog";
import SharedLifeEntryForm from "./SharedLifeEntryForm";
import SharedLifeEntrySnapshot from "./SharedLifeEntrySnapshot";
import SharedLifeSettingsForm from "./SharedLifeSettingsForm";

export default function SharedLifePage() {
  const pair = usePair();
  const flow = useSharedLife(pair.pairId);
  const [filter, setFilter] = useState<SharedLifeEntryInput["kind"]>("TASK");
  const [draft, setEditing] = useState<{ id: string; pairId: string; entry?: SharedLifeEntryDTO; revision: number; preservedState?: SharedLifeEntryInput } | null>(null);
  const editing = draft?.pairId === pair.pairId ? draft : null;
  const [deleteSelection, setDeleteSelection] = useState<{ entry: SharedLifeEntryDTO; pairId: string; revision: number } | null>(null);
  const deleting = deleteSelection?.pairId === pair.pairId ? deleteSelection : null;
  const [settingsPair, setSettingsPair] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const pairAccessLost = (pair.error && [401, 403, 404].includes(pair.error.status)) || pair.pairMe?.pair?.status === "ended";
  const data = pairAccessLost ? null : flow.data;
  const readOnly = Boolean(data?.readOnly || pair.pairMe?.pair?.status === "paused");
  const displayError = flow.error?.status === 409 && flow.error.message.startsWith("Партнёр уже изменил общие записи.")
    ? { ...flow.error, message: "Общие записи изменились. Проверьте актуальную версию. В открытом черновике или подтверждении удаления сначала сравните данные и подтвердите свой выбор, затем повторите действие." }
    : flow.error;
  const settingsOpen = Boolean(data && settingsPair === data.pairId);
  useUnsavedChanges(Boolean(data && dirty && (editing || settingsOpen)), flow.busy);
  const closeEditing = () => { setEditing(null); setDirty(false); };
  const cancelEditing = () => { if (confirmAppNavigation()) closeEditing(); };
  const closeSettings = () => { setSettingsPair(null); setDirty(false); };
  const cancelSettings = () => { if (confirmAppNavigation()) closeSettings(); };
  const roleLabel = (role: string) => sharedLifeRole(role, data?.myRole ?? "A");
  const save = (entryId: string, next: SharedLifeEntryInput) => data ? flow.update({
    action: "SAVE", expectedRevision: editing?.id === entryId ? editing.revision : data.revision, entryId, data: next,
  }) : Promise.resolve(false);
  const refresh = async () => { await Promise.all([pair.refetch(), flow.reload()]); };
  useRefreshOnReturn(refresh, !flow.busy && !flow.loading && !editing && !deleting && !settingsOpen);
  const section = SHARED_LIFE_SECTIONS[filter];
  const entries = data ? sharedLifeEntries(data.entries, filter) : [];
  const agenda = data ? sharedLifeAgenda(data) : [];
  const conflict = Boolean(data && editing && editing.revision !== data.revision);
  const serverEntry = data?.entries.find((entry) => entry.id === editing?.id) ?? null;
  const deleteCurrent = data?.entries.find((entry) => entry.id === deleting?.entry.id) ?? null;
  const openEntry = (entry?: SharedLifeEntryDTO) => {
    if (!data) return;
    setDirty(false);
    setEditing({ id: entry?.id ?? crypto.randomUUID(), pairId: data.pairId, entry, revision: data.revision });
  };
  return <main className="app-shell py-5">
    <nav aria-label="Навигация общей жизни" className="mb-5 flex flex-wrap gap-3">
      <Link href="/main-menu" className="app-btn-secondary px-3 py-2">На главную</Link>
      {pair.pairId && <Link href={`/pair/${pair.pairId}`} className="app-btn-secondary px-3 py-2">Наша пара</Link>}
      <Link href="/development" className="app-btn-secondary px-3 py-2">Библиотека</Link>
    </nav>
    <header className="app-panel app-panel-solid p-5">
      <h1 className="text-2xl font-semibold">Наша общая жизнь</h1>
      <p className="app-muted mt-2">Договорённости, планы и моменты, которые хочется сохранить. Записи видны обоим участникам пары.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="app-btn-secondary px-3 py-2" disabled={flow.busy || flow.loading} onClick={() => void refresh()}>{flow.loading ? "Обновляем…" : "Обновить записи"}</button>
        {data && <button className="app-btn-secondary px-3 py-2" disabled={flow.busy || readOnly} onClick={() => { setDirty(false); setSettingsPair(data.pairId); }}>Даты и настройки</button>}
      </div>
      <p className="app-muted mt-2 text-sm">После действия партнёра можно обновить записи. При одновременной правке сначала сравним версии.</p>
    </header>
    {(pair.loading || flow.loading) && <p role="status" className="mt-4">Загружаем пространство…</p>}
    {(pair.error || flow.error) && <div className="mt-4"><ErrorView error={pair.error ?? displayError} onRetry={() => void refresh()} /></div>}
    {!pair.loading && !pair.error && !pair.pairId && <section className="app-panel mt-5 p-5">
      <p>Общее пространство появится после подтверждения пары.</p>
      <Link href="/invite" className="app-btn-primary mt-3 inline-block px-4 py-2">Связать партнёра</Link>
    </section>}
    {data && <>
      {readOnly && <p className="app-alert mt-4 p-3" role="status">Пара на паузе. Записи доступны для просмотра; изменения — после возобновления.</p>}
      <nav aria-label="Разделы общей жизни" className="mt-5 flex flex-wrap gap-2">
        {Object.entries(SHARED_LIFE_SECTIONS).map(([key, item]) => <button key={key} aria-pressed={filter === key}
          className="app-btn-secondary px-3 py-2 text-sm" onClick={() => setFilter(key as SharedLifeEntryInput["kind"])}>
          {item.title} <span className="app-muted">{data.entries.filter((entry) => entry.data.kind === key).length}</span>
        </button>)}
      </nav>
      <section className="mt-5" aria-labelledby="shared-life-section">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="shared-life-section" className="text-xl font-semibold">{section.title}</h2><p className="app-muted mt-1 max-w-2xl text-sm">{section.description}</p></div>
          <button className="app-btn-primary px-4 py-3" disabled={readOnly || flow.busy || !!editing} onClick={() => openEntry()}>{section.action}</button>
        </div>
        {filter === "EVENT" && <section className="app-panel app-panel-solid mt-4 p-4">
          <h3 className="font-semibold">Ближайшее в календаре</h3>
          <p className="app-muted mt-1 text-sm">События и дела с датой. Напоминания видны внутри приложения.</p>
          {agenda.length ? <ol className="mt-3 space-y-3">{agenda.map((item) => <li key={item.id} className="app-panel-soft p-3 text-sm">
            <time dateTime={item.date} className="font-medium">{sharedLifeDate(item.date)}</time>
            <p className="mt-1 break-words">{item.title}</p>
            {item.source === "AUTHOR" && <p className="app-muted mt-1">Предложение авторов</p>}
            {Date.parse(`${item.date}T12:00:00Z`) - Date.parse(`${data.today}T12:00:00Z`) <= data.settings.reminderLeadDays * 86400000 && <p className="mt-1">Скоро</p>}
          </li>)}</ol> : <p className="app-muted mt-3 text-sm">Ближайших поводов пока нет. Можно добавить свою дату.</p>}
        </section>}
        {filter === "TASK" && <section className="app-panel mt-4 p-4">
          <h3 className="font-semibold">Что запланировано</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">{data.taskLoad.map((row) => <p key={row.role} className="app-panel-soft p-3 text-sm"><span className="block font-medium capitalize">{roleLabel(row.role)}</span>{row.openTasks} дел · {row.plannedMinutes} мин</p>)}</div>
          <p className="app-muted mt-3 text-sm">Минуты включают организацию и вводятся вами. Это план времени, а не оценка справедливости или вклада человека.</p>
        </section>}
        {filter === "BUDGET" && <section className="app-panel mt-4 p-4">
          <h3 className="font-semibold">Итоги по валютам</h3>
          <p className="app-muted mt-1 text-sm">Доходы + взносы − расходы. Это реальные деньги в ваших записях. Монеты приложения и покупки в магазине сюда не входят; банковского подключения нет.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{data.budget.map((row) => <dl key={row.currency} className="app-panel-soft space-y-2 p-3 text-sm">
            <div><dt className="font-semibold">Остаток · {row.currency}</dt><dd className="mt-1 text-lg font-semibold">{money(row.balanceMinor, row.currency)}</dd></div>
            <div><dt>Доходы</dt><dd>{money(row.incomeMinor, row.currency)}</dd></div>
            <div><dt>Взносы</dt><dd>{money(row.contributionMinor, row.currency)}</dd></div>
            <div><dt>Расходы</dt><dd>{money(row.expenseMinor, row.currency)}</dd></div>
          </dl>)}</div>
          {!data.budget.length && <p className="app-muted mt-3 text-sm">Итоги появятся после первой операции.</p>}
        </section>}
        <div className={`mt-4 grid gap-3 ${filter === "GOAL" ? "sm:grid-cols-2" : ""}`}>
          {entries.map((entry) => {
            const item = entry.data;
            return <article key={entry.id} className="app-panel app-panel-solid min-w-0 p-4">
              {entry.nextDate && <p className="app-muted mb-2 text-sm"><time dateTime={entry.nextDate}>{sharedLifeDate(entry.nextDate)}</time>
                {entry.nextDate < data.today && (item.kind === "TASK" || item.kind === "EVENT") && item.status === "OPEN" ? " · дата прошла" : ""}</p>}
              <h3 className="break-words font-semibold">{item.title}</h3>
              {item.kind === "BUDGET" && <p className="mt-2 text-lg font-semibold">{{ EXPENSE: "Расход", INCOME: "Доход", CONTRIBUTION: "Взнос" }[item.direction]} · {money(item.amountMinor, item.currency)}</p>}
              {item.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.note}</p>}
              {"place" in item && item.place && <p className="app-muted mt-2 break-words text-sm">Место: {item.place}</p>}
              {"assignee" in item && <p className="app-muted mt-2 text-sm">{item.kind === "BUDGET" ? "Чей вклад / расход" : "Ответственный"}: {roleLabel(item.assignee)}{item.kind === "TASK" ? ` · ${item.effortMinutes} мин` : ""}</p>}
              {item.kind === "MEMORY" && item.photoLink && <a className="mt-2 inline-block py-2 text-sm underline" href={item.photoLink} target="_blank" rel="noopener noreferrer">Открыть фото на внешнем сервисе</a>}
              {item.kind === "SHOPPING" && <div className="mt-2 text-sm">
                <p>Количество / вариант: {item.quantity}</p><p className="mt-1">Кто покупает: {roleLabel(item.reservedBy)}</p>
                {item.status !== "DONE" && <button disabled={flow.busy || readOnly || (item.reservedBy !== "NONE" && item.reservedBy !== data.myRole)} onClick={() => void save(entry.id, { ...item, reservedBy: item.reservedBy === data.myRole ? "NONE" : data.myRole })} className="app-btn-secondary mt-3 px-3 py-2">{item.reservedBy === data.myRole ? "Освободить покупку" : item.reservedBy === "NONE" ? "Беру на себя" : "Покупает партнёр"}</button>}
              </div>}
              {item.kind === "GOAL" && <div className="mt-3 space-y-2">
                <p className="text-sm font-medium">Готово этапов: {item.milestones.filter((step) => step.done).length} из {item.milestones.length}</p>
                <progress className="w-full" aria-label={`Готовность цели «${item.title}»`} value={item.milestones.filter((step) => step.done).length} max={item.milestones.length} />
                {item.milestones.map((step, i) => <label key={`${i}:${step.title}`} className="app-panel-soft flex min-h-11 items-start gap-3 p-3 text-sm"><input className="mt-1" type="checkbox" checked={step.done} disabled={flow.busy || readOnly} onChange={(event) => {
                  const milestones = item.milestones.map((current, index) => index === i ? { ...current, done: event.target.checked } : current);
                  void save(entry.id, { ...item, milestones, status: milestones.every((current) => current.done) ? "DONE" : "OPEN" });
                }} /><span className="min-w-0 break-words">{step.title}{step.done && <span className="app-muted block">Готово</span>}</span></label>)}
              </div>}
              {"status" in item && <p className="mt-3 text-sm font-medium">{item.status === "DONE" ? "Завершено" : "В планах"}</p>}
              <p className="app-muted mt-3 text-xs">Последняя правка: {roleLabel(entry.updatedBy)}, {new Date(entry.updatedAt).toLocaleString("ru-RU")}</p>
              {!readOnly && <div className="mt-3 flex flex-wrap gap-2">
                {"status" in item && item.kind !== "GOAL" && <button disabled={flow.busy} className="app-btn-secondary px-3 py-2 text-sm" onClick={() => void save(entry.id,
                  (item.kind === "EVENT" || item.kind === "TASK") && item.repeat !== "NONE" && entry.nextDate ? { ...item, status: "OPEN", lastCompletedDate: entry.nextDate } : { ...item, status: item.status === "DONE" ? "OPEN" : "DONE" })}>
                  {item.status === "DONE" ? "Вернуть в план" : item.kind === "SHOPPING" ? "Куплено" : "Готово"}
                </button>}
                <button disabled={flow.busy || !!editing} onClick={() => openEntry(entry)} className="app-btn-secondary px-3 py-2 text-sm">Изменить</button>
                <button disabled={flow.busy} onClick={() => setDeleteSelection({ entry, pairId: data.pairId, revision: data.revision })} className="app-btn-secondary px-3 py-2 text-sm">Удалить</button>
              </div>}
            </article>;
          })}
        </div>
        {!entries.length && <div className="app-panel mt-4 p-5"><p>{section.empty}</p>{readOnly && <p className="app-muted mt-2 text-sm">Новые записи можно добавить после возобновления пары.</p>}</div>}
      </section>
      <details className="app-panel mt-5 p-4"><summary className="cursor-pointer py-2 text-sm">Последние изменения пространства</summary>
        {[...data.changes].reverse().slice(0, 12).map((change) => <p key={change.revision} className="app-muted mt-2 text-sm">{roleLabel(change.actor)} · {change.action === "DELETE" ? "удаление записи" : change.action === "SETTINGS" ? "настройки" : "сохранение записи"} · {new Date(change.at).toLocaleString("ru-RU")}</p>)}
        {!data.changes.length && <p className="app-muted mt-2 text-sm">Изменений пока нет.</p>}
      </details>
      {editing && !readOnly && <Dialog open onClose={cancelEditing} title={editing.entry ? "Изменить общую запись" : section.action} description="Изменения увидит партнёр после сохранения." busy={flow.busy} className={conflict ? "app-dialog-wide" : undefined}>
        {flow.error && <div className="mb-4"><ErrorView error={displayError} onRetry={() => void flow.reload()} /></div>}
        {conflict && <div className="app-alert mb-4 p-4" role="status"><h3 className="font-semibold">Пока вы редактировали, общие записи изменились</h3><p className="mt-2 text-sm">Сравните актуальную запись с вашим черновиком ниже. Ввод можно поправить перед повторным сохранением.</p><button className="app-btn-secondary mt-3 px-3 py-2" disabled={flow.busy} onClick={() => setEditing({ ...editing, revision: data.revision, preservedState: serverEntry?.data })}>Версии сравнены — разрешить сохранение черновика</button><button className="app-btn-secondary mt-3 px-3 py-2" disabled={flow.busy} onClick={cancelEditing}>Оставить актуальную версию</button></div>}
        <div className={conflict ? "grid gap-5 md:grid-cols-2" : ""}>
          {conflict && <section className="app-panel-soft min-w-0 p-4"><h3 className="font-semibold">Сейчас в общем пространстве</h3><SharedLifeEntrySnapshot entry={serverEntry} myRole={data.myRole} />{editing.entry && !serverEntry && <p className="mt-3 text-sm">Партнёр удалил запись. Если сохранить ваш черновик после сравнения, запись появится снова.</p>}</section>}
          <div key="draft" className="min-w-0"><SharedLifeEntryForm key={`${editing.pairId}:${editing.id}`} entry={editing.entry} preservedState={editing.preservedState} initialKind={editing.entry?.data.kind ?? filter} myRole={data.myRole} currency={data.settings.defaultCurrency} busy={flow.busy} saveDisabled={conflict} onDirty={() => setDirty(true)} onClose={closeEditing} onCancel={cancelEditing} onSave={(next) => save(editing.id, next)} /></div>
        </div>
      </Dialog>}
      {settingsOpen && !readOnly && <Dialog open onClose={cancelSettings} title="Даты и настройки" description="Общие настройки пары. Изменения применятся после сохранения." busy={flow.busy}>
        {flow.error && <div className="mb-4"><ErrorView error={displayError} onRetry={() => void flow.reload()} /></div>}
        <SharedLifeSettingsForm key={data.pairId} data={data} busy={flow.busy} conflictError={flow.error?.status === 409} onDirty={() => setDirty(true)} onClose={closeSettings} onCancel={cancelSettings} onSave={(settings, revision) => flow.update({ action: "SETTINGS", expectedRevision: revision, settings })} />
      </Dialog>}
      {deleting && !readOnly && <Dialog open onClose={() => setDeleteSelection(null)} title="Удалить общую запись?" description="Запись исчезнет у обоих участников пары." busy={flow.busy}>
        {flow.error && <div className="mb-4"><ErrorView error={displayError} onRetry={() => void flow.reload()} /></div>}
        <SharedLifeEntrySnapshot entry={deleteCurrent} myRole={data.myRole} />
        {deleting.revision !== data.revision && deleteCurrent && <div className="app-alert mt-4 p-3" role="status"><p>После открытия подтверждения пространство изменилось. Выше — текущая версия записи.</p><button className="app-btn-secondary mt-3 px-3 py-2" disabled={flow.busy} onClick={() => setDeleteSelection({ ...deleting, entry: deleteCurrent, revision: data.revision })}>Проверено — разрешить удаление</button></div>}
        <div className="mt-5 flex flex-wrap gap-3"><button className="app-btn-danger px-4 py-3" disabled={flow.busy || !deleteCurrent || deleting.revision !== data.revision} onClick={() => void flow.update({ action: "DELETE", expectedRevision: deleting.revision, entryId: deleting.entry.id }).then((saved) => { if (saved) setDeleteSelection(null); })}>{flow.busy ? "Удаляем…" : "Удалить запись"}</button><button className="app-btn-secondary px-4 py-3" disabled={flow.busy} onClick={() => setDeleteSelection(null)}>Оставить</button></div>
      </Dialog>}
    </>}
  </main>;
}
