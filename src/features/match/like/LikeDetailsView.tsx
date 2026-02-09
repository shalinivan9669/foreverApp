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
    <div className="app-shell">
      <main className="space-y-4 pb-4 pt-3 sm:space-y-5 sm:pb-6 sm:pt-4">
        <button onClick={onBack} className="app-btn-secondary px-3 py-1.5 text-sm text-slate-800">
          ← Назад
        </button>

        <header className="app-panel app-reveal flex flex-wrap items-center gap-3 p-3 sm:p-4">
          <img src={like.from.avatar} width={40} height={40} className="rounded-full ring-1 ring-slate-200" alt={like.from.username} />
          <span className="text-sm text-gray-500">→</span>
          <img src={like.to.avatar} width={40} height={40} className="rounded-full ring-1 ring-slate-200" alt={like.to.username} />
          <div className="ml-auto text-sm text-gray-600">
            Скор: {Math.round(like.matchScore)}%
            {like.updatedAt ? ` · ${formatWhen(like.updatedAt)}` : ''}
          </div>
        </header>

        <section className="app-panel app-reveal p-4">
          <div className="mb-2 font-semibold">Карточка партнера</div>
          {!visibleSnapshot ? (
            <div className="text-sm text-gray-500">Снапшот карточки недоступен</div>
          ) : (
            <>
              <div className="mb-3">
                <div className="mb-1 text-xs text-gray-500">Условия</div>
                <ul className="ml-4 list-disc text-sm">
                  {visibleSnapshot.requirements.map((requirement, index) => (
                    <li key={index}>{requirement}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-gray-500">Вопросы</div>
                {visibleSnapshot.questions.map((question, index) => (
                  <div key={index} className="rounded bg-gray-50 p-2 text-sm">
                    {question}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="app-panel app-reveal p-4">
            <div className="mb-2 font-semibold">Твои ответы (инициатор)</div>
            <div className="text-sm">
              <div className="mb-1 text-xs text-gray-500">Согласие</div>
              <div>{like.agreements?.map((value, index) => <span key={index}>{value ? '✅' : '❌'} </span>)}</div>
            </div>
            <div className="mt-2 space-y-2">
              <div className="text-xs text-gray-500">Ответы</div>
              <div className="rounded bg-gray-50 p-2 text-sm">{like.answers?.[0] ?? '—'}</div>
              <div className="rounded bg-gray-50 p-2 text-sm">{like.answers?.[1] ?? '—'}</div>
            </div>
          </div>

          <div className="app-panel app-reveal p-4">
            <div className="mb-2 font-semibold">Ответ получателя</div>
            {!like.recipientResponse ? (
              <div className="text-sm text-gray-500">Пока нет ответа</div>
            ) : (
              <>
                <div className="mb-1 text-xs text-gray-500">Согласие</div>
                <div className="text-sm">
                  {like.recipientResponse.agreements.map((value, index) => (
                    <span key={index}>{value ? '✅' : '❌'} </span>
                  ))}
                </div>
                <div className="mt-2 space-y-2">
                  <div className="text-xs text-gray-500">Ответы</div>
                  <div className="rounded bg-gray-50 p-2 text-sm">{like.recipientResponse.answers[0]}</div>
                  <div className="rounded bg-gray-50 p-2 text-sm">{like.recipientResponse.answers[1]}</div>
                </div>
              </>
            )}
          </div>
        </section>

        <footer className="flex flex-wrap gap-2">
          {canAcceptReject && (
            <>
              <button
                disabled={busy}
                onClick={onAccept}
                className="app-btn-success px-3 py-2 text-white disabled:opacity-60"
              >
                Принять
              </button>
              <button
                disabled={busy}
                onClick={onReject}
                className="app-btn-danger px-3 py-2 text-white disabled:opacity-60"
              >
                Отклонить
              </button>
            </>
          )}
          {canCreatePair && (
            <button
              disabled={busy}
              onClick={onCreatePair}
              className="app-btn-success px-3 py-2 text-white disabled:opacity-60"
            >
              Создать пару
            </button>
          )}
        </footer>

        {errorMessage && <p className="text-red-600">{errorMessage}</p>}
      </main>
    </div>
  );
}
