'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/utils/api';
import { fetchEnvelope } from '@/utils/apiClient';

/* eslint-disable @next/next/no-img-element */

type Card = { requirements: [string, string, string]; questions: [string, string] };

type Props = {
  open: boolean;
  onClose: () => void;
  candidate: { id: string; username: string; avatar: string } | null;
  onSent?: (payload: { matchScore: number; toId: string }) => void;
};

const avatarUrl = (id: string, avatar?: string) =>
  avatar
    ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

export default function LikeModal({ open, onClose, candidate, onSent }: Props) {
  const [card, setCard] = useState<Card | null>(null);
  const [agree, setAgree] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [ans, setAns] = useState<[string, string]>(['', '']);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !candidate) return;
    setErr(null);
    setAgree([false, false, false]);
    setAns(['', '']);
    fetch(api(`/api/match/card/${candidate.id}`))
      .then((r) => (r.ok ? r.json() : null))
      .then(setCard)
      .catch(() => setCard(null));
  }, [open, candidate]);

  const canSend = useMemo(() => {
    if (!card) return false;
    if (!agree.every(Boolean)) return false;
    const a0 = ans[0].trim();
    const a1 = ans[1].trim();
    return a0.length > 0 && a0.length <= 280 && a1.length > 0 && a1.length <= 280;
  }, [card, agree, ans]);

  if (!open || !candidate) return null;

  const send = async () => {
    if (!card || !canSend || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const data = await fetchEnvelope<{ id: string; matchScore: number }>(
        api('/api/match/like'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toId: candidate.id,
            agreements: [true, true, true],
            answers: ans,
          }),
        },
        { idempotency: true }
      );
      onSent?.({ matchScore: data.matchScore, toId: candidate.id });
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'РћС€РёР±РєР°');
    } finally {
      setBusy(false);
    }
  };

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
          <div className="font-medium">Р›Р°Р№Рє {candidate.username}</div>
          <button onClick={onClose} className="ml-auto text-gray-500 hover:text-black">
            вњ•
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!card ? (
            <p>Р—Р°РіСЂСѓР·РєР° СѓСЃР»РѕРІРёР№вЂ¦</p>
          ) : (
            <>
              <section>
                <h3 className="font-medium mb-2">РЎРѕРіР»Р°СЃРёРµ СЃ СѓСЃР»РѕРІРёСЏРјРё</h3>
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
                <h3 className="font-medium mb-2">РћС‚РІРµС‚СЊС‚Рµ РЅР° РІРѕРїСЂРѕСЃС‹</h3>
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
          {err && <p className="text-red-600">{err}</p>}
        </div>

        <div className="p-4 border-t flex gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200">
            РћС‚РјРµРЅР°
          </button>
          <button
            onClick={send}
            disabled={!canSend || busy}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
          >
            {busy ? 'РћС‚РїСЂР°РІР»СЏРµРјвЂ¦' : 'РћС‚РїСЂР°РІРёС‚СЊ Р·Р°СЏРІРєСѓ'}
          </button>
        </div>
      </div>
    </div>
  );
}