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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center gap-3">
          <img
            src={avatarUrl(candidate.id, candidate.avatar)}
            width={40}
            height={40}
            className="rounded-full"
            alt={candidate.username}
          />
          <div className="font-medium">Лайк {candidate.username}</div>
          <button onClick={onClose} className="ml-auto text-gray-500 hover:text-black">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!card ? (
            <p>Загрузка условий…</p>
          ) : (
            <>
              <section>
                <h3 className="font-medium mb-2">Согласие с условиями</h3>
                <ul className="space-y-2">
                  {card.requirements.map((requirement, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <label className="flex items-start gap-2 cursor-pointer">
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
                <h3 className="font-medium mb-2">Ответьте на вопросы</h3>
                {card.questions.map((question, index) => (
                  <div key={index} className="space-y-1">
                    <div className="text-sm text-gray-500">{question}</div>
                    <textarea
                      value={answers[index]}
                      onChange={(event) => onChangeAnswer(index, event.target.value)}
                      maxLength={280}
                      rows={3}
                      className="w-full border rounded px-3 py-2"
                    />
                    <div className="text-xs text-gray-500">{answers[index].length}/280</div>
                  </div>
                ))}
              </section>
            </>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>

        <div className="p-4 border-t flex gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200">
            Отмена
          </button>
          <button
            onClick={onSubmit}
            disabled={!canSend || busy}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
          >
            {busy ? 'Отправляем…' : 'Отправить заявку'}
          </button>
        </div>
      </div>
    </div>
  );
}
