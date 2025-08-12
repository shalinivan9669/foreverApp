'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/utils/api';
import { useUserStore } from '@/store/useUserStore';
import MatchTabs from '@/components/MatchTabs';

type Detail = {
  likeId: string;
  from: { id: string; username: string; avatar: string };
  to:   { id: string; username: string; avatar: string };
  agreements: [boolean, boolean, boolean];
  answers: [string, string];
  cardSnapshot: { requirements: [string,string,string]; questions: [string,string] };
  recipientResponse: null | {
    agreements: [boolean,boolean,boolean];
    answers: [string,string];
    initiatorCardSnapshot: { requirements: [string,string,string]; questions: [string,string] };
    at: string;
  };
  matchScore: number;
  status: 'sent'|'viewed'|'awaiting_initiator'|'accepted'|'rejected'|'expired';
  createdAt: string;
};

type Card = { requirements: [string,string,string]; questions: [string,string] };

/* eslint-disable @next/next/no-img-element */
export default function LikeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useUserStore(s => s.user);
  const router = useRouter();

  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // поля встречного ответа получателя
  const [initCard, setInitCard] = useState<Card | null>(null);
  const [agree, setAgree] = useState<[boolean,boolean,boolean]>([false,false,false]);
  const [ans, setAns] = useState<[string,string]>(['','']);

  useEffect(() => {
    if (!user || !id) return;
    fetch(api(`/api/match/like/${id}?userId=${user.id}`))
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then(async (d: Detail) => {
        setData(d);
        // если я получатель и ещё не отвечал — подтянуть карточку инициатора
        if (d.to.id === user.id && !d.recipientResponse) {
          const r = await fetch(api(`/api/match/card/${d.from.id}`));
          if (r.ok) setInitCard(await r.json());
        }
      })
      .catch(async (r: Response) => setErr((await r.json().catch(() => ({})))?.error || 'Ошибка'));
  }, [user, id]);

  if (!user) return <div className="p-4">No user</div>;
  if (!data) return <div className="p-4">Загрузка… {err && <span className="text-red-600">{err}</span>}</div>;

  const isRecipient = data.to.id === user.id;
  const isInitiator = data.from.id === user.id;

  const respond = async () => {
    if (!initCard || !agree.every(Boolean) || !ans[0].trim() || !ans[1].trim()) return;
    setBusy(true);
    const res = await fetch(api('/api/match/respond'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ likeId: data.likeId, userId: user.id, agreements: [true,true,true], answers: ans }),
    });
    setBusy(false);
    if (!res.ok) return;
    router.replace('/match/inbox');
  };

  const confirm = async () => {
    setBusy(true);
    const res = await fetch(api('/api/match/confirm'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ likeId: data.likeId, userId: user.id }),
    });
    setBusy(false);
    if (!res.ok) return;
    router.replace('/couple-activity');
  };

  const reject = async () => {
    setBusy(true);
    const res = await fetch(api('/api/match/reject'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ likeId: data.likeId, userId: user.id }),
    });
    setBusy(false);
    if (!res.ok) return;
    router.replace('/match/inbox');
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <MatchTabs />

      <div className="flex items-center gap-3">
        <img src={`https://cdn.discordapp.com/avatars/${data.from.id}/${data.from.avatar}.png`} width={48} height={48} className="rounded-full" alt={data.from.username}/>
        <div className="font-semibold">{data.from.username}</div>
        <div className="ml-auto text-sm text-gray-500">Скор: {Math.round(data.matchScore)}%</div>
      </div>

      {/* 1) Что отправил инициатор (A→B) */}
      <section className="border rounded p-3">
        <h2 className="font-medium mb-2">Ваши условия и вопросы (выставленные получателю)</h2>
        <div className="mb-3">
          <h3 className="text-sm text-gray-500">Согласия с условиями</h3>
          <ul className="mt-1 space-y-1">
            {data.cardSnapshot.requirements.map((r,i)=>(
              <li key={i} className="flex gap-2 items-start">
                <span className={`mt-1 w-2 h-2 rounded-full ${data.agreements[i]?'bg-green-600':'bg-red-600'}`}/>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm text-gray-500">Ответы на ваши вопросы</h3>
          {data.cardSnapshot.questions.map((q,i)=>(
            <div key={i} className="mt-1">
              <div className="text-xs text-gray-500">{q}</div>
              <div className="border rounded px-3 py-2 bg-gray-50 whitespace-pre-wrap">{data.answers[i]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 2) Встречный ответ получателя (B→A) */}
      {isRecipient && !data.recipientResponse && (
        <section className="border rounded p-3 space-y-3">
          <h2 className="font-medium">Ответить и перейти к ожиданию</h2>
          {!initCard ? <p>Загрузка карточки инициатора…</p> : (
            <>
              <div>
                <h3 className="text-sm text-gray-500">Согласие с условиями инициатора</h3>
                <ul className="space-y-2 mt-1">
                  {initCard.requirements.map((r,i)=>(
                    <li key={i} className="flex items-start gap-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={agree[i]}
                          onChange={e=>{
                            const a=[...agree] as [boolean,boolean,boolean];
                            a[i]=e.target.checked; setAgree(a);
                          }}
                        />
                        <span>{r}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm text-gray-500">Ответьте на вопросы инициатора</h3>
                {initCard.questions.map((q,i)=>(
                  <div key={i} className="mt-1">
                    <div className="text-xs text-gray-500">{q}</div>
                    <textarea
                      value={ans[i]}
                      onChange={e=>{ const a=[...ans] as [string,string]; a[i]=e.target.value.slice(0,280); setAns(a); }}
                      maxLength={280}
                      rows={3}
                      className="w-full border rounded px-3 py-2"
                    />
                    <div className="text-[11px] text-gray-500">{ans[i].length}/280</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={respond} disabled={busy || !agree.every(Boolean) || !ans[0].trim() || !ans[1].trim()} className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-60">
                  {busy ? 'Отправляем…' : 'Отправить ответ'}
                </button>
                <button onClick={reject} disabled={busy} className="bg-gray-200 rounded px-4 py-2">Отклонить</button>
              </div>
            </>
          )}
        </section>
      )}

      {/* 3) Просмотр инициатором ответа и финальное подтверждение */}
      {isInitiator && data.status === 'awaiting_initiator' && data.recipientResponse && (
        <section className="border rounded p-3 space-y-3">
          <h2 className="font-medium">Ответ кандидата</h2>
          <div>
            <h3 className="text-sm text-gray-500">Согласие с вашими условиями</h3>
            <ul className="mt-1 space-y-1">
              {data.recipientResponse.initiatorCardSnapshot.requirements.map((r,i)=>(
                <li key={i} className="flex gap-2 items-start">
                  <span className={`mt-1 w-2 h-2 rounded-full ${data.recipientResponse!.agreements[i]?'bg-green-600':'bg-red-600'}`}/>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm text-gray-500">Ответы на ваши вопросы</h3>
            {data.recipientResponse.initiatorCardSnapshot.questions.map((q,i)=>(
              <div key={i} className="mt-1">
                <div className="text-xs text-gray-500">{q}</div>
                <div className="border rounded px-3 py-2 bg-gray-50 whitespace-pre-wrap">
                  {data.recipientResponse!.answers[i]}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={confirm} disabled={busy} className="bg-green-600 text-white rounded px-4 py-2">
              Подтвердить и создать пару
            </button>
            <button onClick={reject} disabled={busy} className="bg-gray-200 rounded px-4 py-2">
              Отклонить
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
