// src/components/LikeModal.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/utils/api';

/* eslint-disable @next/next/no-img-element */

type Card = { requirements: [string, string, string]; questions: [string, string] };
type Candidate = { id: string; username: string; avatar: string };

type Props = {
  open: boolean;
  onClose: () => void;
  fromId: string;
  candidate: Candidate | null;
  onSent?: (payload: { matchScore: number }) => void;
};

// helpers
const avatarUrl = (id: string, avatar?: string) =>
  avatar
    ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

const isStringArray = (v: unknown, len: number): v is string[] =>
  Array.isArray(v) && v.length === len && v.every(x => typeof x === 'string');

const isCard = (v: unknown): v is Card => {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as { requirements?: unknown; questions?: unknown };
  return isStringArray(obj.requirements, 3) && isStringArray(obj.questions, 2);
};

export default function LikeModal({ open, onClose, fromId, candidate, onSent }: Props) {
  const [card, setCard] = useState<Card | null>(null);
  const [agree, setAgree] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [ans, setAns] = useState<[string, string]>(['', '']);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // загрузка карточки
  useEffect(() => {
    if (!open || !candidate) return;

    setErr(null);
    setAgree([false, false, false]);
    setAns(['', '']);
    setCard(null);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        const res = await fetch(api(`/api/match/card/${candidate.id}`), { signal: ac.signal });
        if (!res.ok) {
          setErr('Не удалось получить условия пользователя.');
          return;
        }
        const data = (await res.json()) as unknown;
        if (isCard(data)) setCard(data);
        else setErr('Некорректная структура карточки.');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setErr('Ошибка сети при загрузке карточки.');
      }
    })();

    return () => ac.abort();
  }, [open, candidate]);

  // ESC для закрытия
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // ⬇️ Хуки выше; никаких ранних return до них
  const canSend = useMemo(() => {
    if (!open || !candidate) return false;
    if (!card) return false;
    if (!agree.every(Boolean)) return false;
    const a0 = ans[0].trim();
    const a1 = ans[1].trim();
    return a0.length > 0 && a1.length > 0 && a0.length <= 280 && a1.length <= 280;
  }, [open, candidate, card, agree, ans]);

  const send = async () => {
    if (!card || !candidate || !canSend) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(api('/api/match/like'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromId,
          toId: candidate.id,
          agreements: [true, true, true] as [true, true, true],
          answers: [ans[0], ans[1]] as [string, string],
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(d?.error || 'Не удалось отправить лайк.');
        return;
      }
      const d = (await res.json()) as { matchScore: number };
      onSent?.({ matchScore: d.matchScore });
      onClose();
    } catch {
      setErr('Ошибка сети при отправке.');
    } finally {
      setBusy(false);
    }
  };

  if (!open || !candidate) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      aria-modal="true"
      role="dialog"
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b flex items-center gap-3">
          <img
            src={avatarUrl(candidate.id, candidate.avatar)}
            width={40}
            height={40}
            className="rounded-full"
            alt={candidate.username}
          />
          <div className="font-medium truncate">Лайк @{candidate.username}</div>
          <button
            onClick={onClose}
            className="ml-auto text-gray-500 hover:text-black"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!card ? (
            <div className="text-sm text-gray-600">
              {err ? <span className="text-red-600">{err}</span> : 'Загрузка условий…'}
            </div>
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
                            const next: [boolean, boolean, boolean] = [...agree] as [
                              boolean,
                              boolean,
                              boolean
                            ];
                            next[i] = e.target.checked;
                            setAgree(next);
                          }}
                        />
                        <span>{r}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="font-medium">Ответьте на вопросы</h3>
                {card.questions.map((q, i) => (
                  <div key={i} className="space-y-1">
                    <div className="text-sm text-gray-500">{q}</div>
                    <textarea
                      value={ans[i]}
                      onChange={(e) => {
                        const next: [string, string] = [...ans] as [string, string];
                        next[i] = e.target.value.slice(0, 280);
                        setAns(next);
                      }}
                      maxLength={280}
                      rows={3}
                      className="w-full border rounded px-3 py-2"
                    />
                    <div className="text-xs text-gray-500">{ans[i].length}/280</div>
                  </div>
                ))}
              </section>

              {err && <p className="text-red-600">{err}</p>}
            </>
          )}
        </div>

        <div className="p-4 border-t flex gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200">
            Отмена
          </button>
          <button
            onClick={send}
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
