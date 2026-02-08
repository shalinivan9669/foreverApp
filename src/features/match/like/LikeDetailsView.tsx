'use client';

/* eslint-disable @next/next/no-img-element */

import type { MatchCardSnapshotDTO, MatchLikeDTO } from '@/client/api/types';

type LikeDetailsViewProps = {
  like: MatchLikeDTO;
  visibleSnapshot: MatchCardSnapshotDTO | null;
  canAcceptReject: boolean;
  canCreatePair: boolean;
  busy: boolean;
  errorMessage: string | null;
  onBack: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCreatePair: () => void;
};

const formatWhen = (iso?: string): string => {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
};

export default function LikeDetailsView({
  like,
  visibleSnapshot,
  canAcceptReject,
  canCreatePair,
  busy,
  errorMessage,
  onBack,
  onAccept,
  onReject,
  onCreatePair,
}: LikeDetailsViewProps) {
  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <button onClick={onBack} className="text-sm text-gray-600 hover:underline">
        ← Назад
      </button>

      <header className="flex items-center gap-3">
        <img src={like.from.avatar} width={36} height={36} className="rounded-full" alt={like.from.username} />
        <span className="text-sm text-gray-500">→</span>
        <img src={like.to.avatar} width={36} height={36} className="rounded-full" alt={like.to.username} />
        <div className="ml-auto text-sm text-gray-600">
          Скор: {Math.round(like.matchScore)}%
          {like.updatedAt ? ` · ${formatWhen(like.updatedAt)}` : ''}
        </div>
      </header>

      <section className="border rounded p-3">
        <div className="font-medium mb-2">Карточка партнера</div>
        {!visibleSnapshot ? (
          <div className="text-sm text-gray-500">Снапшот карточки недоступен</div>
        ) : (
          <>
            <div className="mb-2">
              <div className="text-xs text-gray-500 mb-1">Условия</div>
              <ul className="list-disc ml-4 text-sm">
                {visibleSnapshot.requirements.map((requirement, index) => (
                  <li key={index}>{requirement}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-gray-500">Вопросы</div>
              {visibleSnapshot.questions.map((question, index) => (
                <div key={index} className="p-2 bg-gray-50 rounded text-sm">
                  {question}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="grid md:grid-cols-2 gap-3">
        <div className="border rounded p-3">
          <div className="font-medium mb-2">Твои ответы (инициатор)</div>
          <div className="text-sm">
            <div className="text-xs text-gray-500 mb-1">Согласие</div>
            <div>{like.agreements?.map((value, index) => <span key={index}>{value ? '✅' : '❌'} </span>)}</div>
          </div>
          <div className="mt-2 space-y-2">
            <div className="text-xs text-gray-500">Ответы</div>
            <div className="p-2 bg-gray-50 rounded text-sm">{like.answers?.[0] ?? '—'}</div>
            <div className="p-2 bg-gray-50 rounded text-sm">{like.answers?.[1] ?? '—'}</div>
          </div>
        </div>

        <div className="border rounded p-3">
          <div className="font-medium mb-2">Ответ получателя</div>
          {!like.recipientResponse ? (
            <div className="text-sm text-gray-500">Пока нет ответа</div>
          ) : (
            <>
              <div className="text-xs text-gray-500 mb-1">Согласие</div>
              <div className="text-sm">
                {like.recipientResponse.agreements.map((value, index) => (
                  <span key={index}>{value ? '✅' : '❌'} </span>
                ))}
              </div>
              <div className="mt-2 space-y-2">
                <div className="text-xs text-gray-500">Ответы</div>
                <div className="p-2 bg-gray-50 rounded text-sm">{like.recipientResponse.answers[0]}</div>
                <div className="p-2 bg-gray-50 rounded text-sm">{like.recipientResponse.answers[1]}</div>
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="flex gap-2">
        {canAcceptReject && (
          <>
            <button
              disabled={busy}
              onClick={onAccept}
              className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-60"
            >
              Принять
            </button>
            <button
              disabled={busy}
              onClick={onReject}
              className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-60"
            >
              Отклонить
            </button>
          </>
        )}
        {canCreatePair && (
          <button
            disabled={busy}
            onClick={onCreatePair}
            className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
          >
            Создать пару
          </button>
        )}
      </footer>

      {errorMessage && <p className="text-red-600">{errorMessage}</p>}
    </main>
  );
}
