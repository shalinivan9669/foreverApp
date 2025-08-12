// src/components/LikeModal.tsx
'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/utils/api';

type Card = { requirements: [string, string, string]; questions: [string, string] };

type Props = {
  open: boolean;
  onClose: () => void;
  fromId: string;
  candidate: { id: string; username: string; avatar?: string } | null;
  onSent?: (payload: { matchScore: number }) => void;
};

/** Безопасный URL аватара + запасной вариант, чтобы Discord WebView не падал */
const avatarUrl = (id: string, avatar?: string) =>
  avatar
    ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/${Number(id) % 5}.png`;

export default function LikeModal({ open, onClose, fromId, candidate, onSent }: Props) {
  const [card, setCard] = useState<Card | null>(null);
  const [agree, setAgree] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [ans, setAns] = useState<[string, string]>(['', '']);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Заголовок модалки
  const title = useMemo(
    () => (candidate ? `Лайк ${candidate.username}` : 'Лайк'),
    [candidate]
  );

  // Подгружаем карточку кандидата
  useEffect(() => {
    if (!open || !candidate) return;

    // сброс локальных состояний
    setErr(null);
    setAgree([false, false, false]);
    setAns(['', '']);
    setCard(null);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    fetch(api(`/api/match/card/${candidate.id}`), { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!ac.signal.aborted) setCard(data);
      })
      .catch(() => {
        if (!ac.signal.aborted) setCard(null);
      });

    return () => ac.abort();
  }, [open, candidate]);

  // Закрытие по Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !candidate) return null;

  const canSend =
    !!card &&
    agree.every(Boolean) &&
    ans[0].trim().length > 0 &&
    ans[1].trim().length > 0 &&
    ans[0].length <= 280 &&
    ans[1].length <= 280;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="like-modal-title"
      onMouseDown={(e) => {
        // клик по фону закрывает
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-xl">
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3">
          <img
            src={avatarUrl(candidate.id, candidate.avatar)}
            width={40}
            height={40}
            className="rounded-full"
            alt={candidate.username}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = avatarUrl(candidate.id);
            }}
          />
          <div id="like-modal-title" className="font-medium truncate">
            {title}
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-gray-500 hover:text-black"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {!card ? (
            <p className="text-sm text-gray-600">Загрузка условий…</p>
          ) : (
            <>
              <section>
                <h3 className="font-medium mb-2">Согласие с условиями</h3>
                <ul className="space-y-2">
                  {card.requirements.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={agree[i]}
                          onChange={(e) => {
                            const a = [...agree] as [boolean, boolean, boolean];
                            a[i] = e.target.checked;
                            setAgree(a);
                          }}
                        />
                        <span>{r}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium mb-2">Ответьте на вопросы</h3>
                {card.questions.map((q, i) => (
                  <div key={i} className="space-y-1">
                    <div className="text-sm text-gray-500">{q}</div>
                    <textarea
                      value={ans[i]}
                      onChange={(e) => {
                        const a = [...ans] as [string, string];
                        a[i] = e.target.value.slice(0, 280);
                        setAns(a);
                      }}
                      maxLength={280}
                      rows={3}
                      className="w-full border rounded px-3 py-2"
                    />
                    <div className="text-xs text-gray-500">{ans[i].length}/280</div>
                  </div>
                ))}
              </section>
            </>
          )}
          {err && <p className="text-red-600 text-sm">{err}</p>}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
          >
            Отмена
          </button>
          <button
            onClick={async () => {
              if (!card || !canSend) return;
              try {
                setBusy(true);
                setErr(null);
                const res = await fetch(api('/api/match/like'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    fromId: fromId,
                    toId: candidate.id,
                    agreements: [true, true, true],
                    answers: ans,
                  }),
                });
                if (!res.ok) {
                  const d = await res.json().catch(() => ({}));
                  setErr(d?.error || 'Не удалось отправить.');
                  return;
                }
                const d = (await res.json()) as { matchScore: number };
                onSent?.({ matchScore: d.matchScore });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
            disabled={!canSend || busy}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60 hover:bg-blue-700"
          >
            {busy ? 'Отправляем…' : 'Отправить заявку'}
          </button>
        </div>
      </div>
    </div>
  );
}
