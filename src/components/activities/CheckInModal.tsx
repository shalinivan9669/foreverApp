'use client';

type I18nText = Record<string, string>;
type CheckIn = { id: string; scale: 'likert5'|'bool'; map: number[]; text: I18nText; weight?: number };
type Activity = { _id: string; title: I18nText; checkIns: CheckIn[] };

export default function CheckInModal(props: {
  activity: Activity;
  locale: string;
  onClose: () => void;
  onSubmit: (answers: Array<{checkInId:string; ui:number}>) => void;
}) {
  const { activity: a, locale, onClose, onSubmit } = props;
  const t = (txt?: I18nText) => (txt ? (txt[locale] ?? txt['en'] ?? Object.values(txt)[0]) : '');

  const initial = Object.fromEntries(a.checkIns.map(c => [c.id, 1]));
  const state = Object.assign(initial, {}) as Record<string, number>;

  const handleChange = (id: string, ui: number) => {
    state[id] = ui;
  };

  const submit = () => {
    const answers = a.checkIns.map(c => ({ checkInId: c.id, ui: Number(state[c.id] ?? 1) }));
    onSubmit(answers);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded shadow-lg w-full max-w-lg p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Оцените: {t(a.title)}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-black">✕</button>
        </div>

        <div className="mt-3 space-y-4">
          {a.checkIns.map((c) => (
            <div key={c.id} className="space-y-1">
              <div className="text-sm">{t(c.text)}</div>

              {c.scale === 'likert5' ? (
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(ui => (
                    <label key={ui} className="text-xs flex items-center gap-1">
                      <input name={c.id} type="radio" defaultChecked={ui===1} onChange={() => handleChange(c.id, ui)} />
                      {ui}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="flex gap-3">
                  <label className="text-xs flex items-center gap-1">
                    <input name={c.id} type="radio" defaultChecked onChange={() => handleChange(c.id, 1)} />
                    Да
                  </label>
                  <label className="text-xs flex items-center gap-1">
                    <input name={c.id} type="radio" onChange={() => handleChange(c.id, 2)} />
                    Нет
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded border">Отмена</button>
          <button onClick={submit} className="px-3 py-2 rounded bg-black text-white">Отправить</button>
        </div>
      </div>
    </div>
  );
}
