"use client";
import { useState } from "react";
import { CURRENCIES, type SharedLifeSettings } from "@/lib/contracts/sharedLife";
import type { SharedLifeDTO } from "@/lib/dto/sharedLife.dto";

export default function SharedLifeSettingsForm({ data, busy, conflictError, onSave, onClose, onCancel, onDirty }: {
  data: SharedLifeDTO; busy: boolean; conflictError: boolean;
  onSave: (settings: SharedLifeSettings, revision: number) => Promise<boolean>;
  onClose: () => void; onCancel: () => void; onDirty: () => void;
}) {
  const [draft, setDraft] = useState(data.settings);
  const [revision, setRevision] = useState(data.revision);
  const conflict = revision !== data.revision;
  const update = (next: SharedLifeSettings) => { setDraft(next); onDirty(); };
  return <form className="space-y-4" onSubmit={(event) => {
    event.preventDefault();
    if (busy || conflict || data.readOnly) return;
    void onSave(draft, revision).then((saved) => { if (saved) onClose(); });
  }}>
    {conflict && <section className="app-alert p-4" role="status">
      <h3 className="font-semibold">Настройки изменились. Сравните их с вашим черновиком ниже.</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div><dt>Дата отношений на сервере</dt><dd>{data.settings.relationshipStartDate || "Не указана"}</dd></div>
        <div><dt>Календарные поводы</dt><dd>{data.settings.holidaysEnabled ? "Включены" : "Выключены"}</dd></div>
        <div><dt>Предложения авторов</dt><dd>{data.settings.authorEventsEnabled ? "Включены" : "Выключены"}</dd></div>
        <div><dt>Напоминания</dt><dd>За {data.settings.reminderLeadDays} дней</dd></div>
        <div><dt>Валюта по умолчанию</dt><dd>{data.settings.defaultCurrency}</dd></div>
      </dl>
      <button type="button" disabled={busy} className="app-btn-secondary mt-3 px-3 py-2" onClick={() => setRevision(data.revision)}>Версии сравнены — разрешить сохранение черновика</button>
    </section>}
    {conflictError && !conflict && <p className="app-muted text-sm" role="status">Сохранение ещё не выполнено. Проверьте выбранные значения перед повторной отправкой.</p>}
    <fieldset disabled={busy || data.readOnly} className="space-y-4">
      <legend className="mb-3 font-semibold">Ваши настройки</legend>
      <label className="block text-sm">Дата начала отношений
        <input type="date" min="1900-01-01" max="2200-12-31" className="app-input mt-1 w-full" value={draft.relationshipStartDate ?? ""} onChange={(event) => {
          const next = { ...draft }; delete next.relationshipStartDate;
          update({ ...next, ...(event.target.value ? { relationshipStartDate: event.target.value } : {}) });
        }} />
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={draft.holidaysEnabled} onChange={(event) => update({ ...draft, holidaysEnabled: event.target.checked })} />Предлагать календарные поводы</label>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={draft.authorEventsEnabled} onChange={(event) => update({ ...draft, authorEventsEnabled: event.target.checked })} />Показывать отдельно отмеченные предложения авторов</label>
      <label className="block text-sm">Выделять события заранее
        <select className="app-input mt-1 w-full" value={draft.reminderLeadDays} onChange={(event) => update({ ...draft, reminderLeadDays: Number(event.target.value) })}>{[0, 1, 3, 7, 14, 30].map((days) => <option key={days} value={days}>За {days} дней</option>)}</select>
      </label>
      <label className="block text-sm">Валюта для новых операций
        <select className="app-input mt-1 w-full" value={draft.defaultCurrency} onChange={(event) => {
          const next = CURRENCIES.find((currency) => currency === event.target.value);
          if (next) update({ ...draft, defaultCurrency: next });
        }}>{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select>
      </label>
      <p className="app-muted text-sm">Напоминания появляются внутри приложения по календарю устройства. Настройки видны обоим участникам.</p>
      <div className="flex flex-wrap gap-3">
        <button className="app-btn-primary px-4 py-3" disabled={conflict}>{busy ? "Сохраняем…" : "Сохранить настройки"}</button>
        <button type="button" className="app-btn-secondary px-4 py-3" onClick={onCancel}>Отмена</button>
      </div>
    </fieldset>
  </form>;
}
