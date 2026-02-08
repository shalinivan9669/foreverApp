'use client';

/* eslint-disable @next/next/no-img-element */

type Card = {
  requirements: [string, string, string];
  questions: [string, string];
};

type LikeModalViewProps = {
  open: boolean;
  candidate: { id: string; username: string; avatar: string } | null;
  card: Card | null;
  agree: [boolean, boolean, boolean];
  answers: [string, string];
  canSend: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onToggleAgreement: (index: number, value: boolean) => void;
  onChangeAnswer: (index: number, value: string) => void;
  onSubmit: () => void;
};

const avatarUrl = (id: string, avatar?: string) =>
  avatar
    ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';

export default function LikeModalView(props: LikeModalViewProps) {
  const {
    open,
    candidate,
    card,
    agree,
    answers,
    canSend,
    busy,
    error,
    onClose,
    onToggleAgreement,
    onChangeAnswer,
    onSubmit,
  } = props;

  if (!open || !candidate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 sm:items-center">
      <div className="app-panel w-full overflow-hidden rounded-t-2xl text-slate-900 sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 p-4">
          <img
            src={avatarUrl(candidate.id, candidate.avatar)}
            width={40}
            height={40}
            className="rounded-full ring-1 ring-slate-200"
            alt={candidate.username}
          />
          <div className="font-medium">Р›Р°Р№Рє {candidate.username}</div>
          <button onClick={onClose} className="app-btn-secondary ml-auto px-2 py-1 text-slate-700">
            x
          </button>
        </div>

        <div className="space-y-4 p-4">
          {!card ? (
            <p className="app-muted">Р—Р°РіСЂСѓР·РєР° СѓСЃР»РѕРІРёР№вЂ¦</p>
          ) : (
            <>
              <section>
                <h3 className="mb-2 font-medium">РЎРѕРіР»Р°СЃРёРµ СЃ СѓСЃР»РѕРІРёСЏРјРё</h3>
                <ul className="space-y-2">
                  {card.requirements.map((requirement, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={agree[index]}
                          onChange={(event) => onToggleAgreement(index, event.target.checked)}
                        />
                        <span>{requirement}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="mb-2 font-medium">РћС‚РІРµС‚СЊС‚Рµ РЅР° РІРѕРїСЂРѕСЃС‹</h3>
                {card.questions.map((question, index) => (
                  <div key={index} className="space-y-1">
                    <div className="app-muted text-sm">{question}</div>
                    <textarea
                      value={answers[index]}
                      onChange={(event) => onChangeAnswer(index, event.target.value)}
                      maxLength={280}
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                    />
                    <div className="app-muted text-xs">{answers[index].length}/280</div>
                  </div>
                ))}
              </section>
            </>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 border-t border-slate-200 p-4">
          <button onClick={onClose} className="app-btn-secondary px-4 py-2 text-slate-800">
            РћС‚РјРµРЅР°
          </button>
          <button
            onClick={onSubmit}
            disabled={!canSend || busy}
            className="app-btn-primary px-4 py-2 text-white disabled:opacity-60"
          >
            {busy ? 'РћС‚РїСЂР°РІР»СЏРµРјвЂ¦' : 'РћС‚РїСЂР°РІРёС‚СЊ Р·Р°СЏРІРєСѓ'}
          </button>
        </div>
      </div>
    </div>
  );
}
