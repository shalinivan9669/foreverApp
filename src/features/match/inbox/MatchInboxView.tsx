'use client';

/* eslint-disable @next/next/no-img-element */

import ErrorView from '@/components/ui/ErrorView';
import MatchTabs from '@/components/MatchTabs';
import type { MatchDirection, MatchInboxRowDTO, MatchLikeDTO, MatchStatus } from '@/client/api/types';
import type { UiErrorState } from '@/client/api/errors';

const STATUS_TEXT: Record<MatchDirection, Record<MatchStatus, string>> = {
  incoming: {
    sent: 'ожидает вашего ответа',
    viewed: 'ожидает вашего ответа',
    awaiting_initiator: 'ожидает решения инициатора',
    mutual_ready: 'готово к паре',
    paired: 'пара создана',
    rejected: 'отклонено',
    expired: 'истекло',
  },
  outgoing: {
    sent: 'отправлено',
    viewed: 'просмотрено',
    awaiting_initiator: 'ожидает вашего решения',
    mutual_ready: 'готово к паре',
    paired: 'пара создана',
    rejected: 'отклонено',
    expired: 'истекло',
  },
};

const BADGE_CLASS: Record<MatchStatus, string> = {
  sent: 'bg-gray-100 text-gray-800',
  viewed: 'bg-gray-100 text-gray-800',
  awaiting_initiator: 'bg-amber-100 text-amber-900',
  mutual_ready: 'bg-green-100 text-green-900',
  paired: 'bg-green-200 text-green-900',
  rejected: 'bg-red-100 text-red-900',
  expired: 'bg-gray-100 text-gray-500',
};

const formatWhen = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const toAvatarSrc = (id: string, avatar: string): string =>
  avatar.startsWith('http') ? avatar : `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;

type RespondModalState = {
  open: boolean;
  like: MatchLikeDTO | null;
  agreements: [boolean, boolean, boolean];
  answers: [string, string];
  canSubmit: boolean;
  busy: boolean;
  error: string | null;
};

type MatchInboxViewProps = {
  incoming: MatchInboxRowDTO[];
  outgoing: MatchInboxRowDTO[];
  loading: boolean;
  error: UiErrorState | null;
  onRefresh: () => void;
  onOpenIncoming: (id: string) => void;
  onOpenOutgoing: (id: string) => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onCreatePair: (id: string) => void;
  respondModal: RespondModalState;
  onCloseRespondModal: () => void;
  onToggleAgreement: (index: number, checked: boolean) => void;
  onChangeAnswer: (index: number, value: string) => void;
  onSubmitResponse: () => void;
};

function Section(props: {
  title: string;
  rows: MatchInboxRowDTO[];
  onOpen: (id: string) => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onCreatePair: (id: string) => void;
}) {
  const { title, rows, onOpen, onAccept, onReject, onCreatePair } = props;

  return (
    <section className="space-y-2">
      <h2 className="mb-2 font-medium">{title}</h2>
      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const canRespond = row.direction === 'incoming' && (row.status === 'sent' || row.status === 'viewed');
          const canDecide = row.direction === 'outgoing' && row.status === 'awaiting_initiator';

          return (
            <article key={row.id} className="app-panel p-2 sm:p-3">
              <div className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center">
                <button type="button" onClick={() => onOpen(row.id)} className="flex min-w-0 flex-1 items-center gap-3">
                  <img
                    src={toAvatarSrc(row.peer.id, row.peer.avatar)}
                    width={40}
                    height={40}
                    className="rounded-full"
                    alt={row.peer.username}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate font-medium">{row.peer.username}</div>
                      <span className={`rounded px-2 py-0.5 text-[11px] ${BADGE_CLASS[row.status]}`}>
                        {STATUS_TEXT[row.direction][row.status]}
                      </span>
                    </div>
                    <div className="app-muted text-xs">
                      Скор: {Math.round(row.matchScore)}%
                      {row.updatedAt ? ` · ${formatWhen(row.updatedAt)}` : ''}
                    </div>
                  </div>
                </button>

                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  {canRespond && (
                    <button
                      type="button"
                      onClick={() => onOpen(row.id)}
                      className="w-full rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 sm:w-auto"
                    >
                      Ответить
                    </button>
                  )}

                  {canDecide && (
                    <>
                      <button
                        type="button"
                        onClick={() => onAccept(row.id)}
                        className="w-full rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 sm:w-auto"
                      >
                        Принять
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(row.id)}
                        className="w-full rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 sm:w-auto"
                      >
                        Отклонить
                      </button>
                    </>
                  )}

                  {row.canCreatePair && (
                    <button
                      type="button"
                      onClick={() => onCreatePair(row.id)}
                      className="w-full rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 sm:w-auto"
                    >
                      Создать пару
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!rows.length && <p className="app-muted text-sm">Пусто</p>}
      </div>
    </section>
  );
}

export default function MatchInboxView(props: MatchInboxViewProps) {
  const {
    incoming,
    outgoing,
    loading,
    error,
    onRefresh,
    onOpenIncoming,
    onOpenOutgoing,
    onAccept,
    onReject,
    onCreatePair,
    respondModal,
    onCloseRespondModal,
    onToggleAgreement,
    onChangeAnswer,
    onSubmitResponse,
  } = props;

  return (
    <div className="mx-auto w-full max-w-6xl p-3 text-slate-900 sm:p-4 lg:p-6">
      <MatchTabs />

      <div className="mb-4 mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold sm:text-xl">Потенциальные партнеры</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="app-btn-secondary px-3 py-1.5 text-sm text-slate-800 disabled:opacity-60"
            aria-label="Обновить список"
          >
            {loading ? 'Обновляем...' : 'Обновить'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorView error={error} onRetry={onRefresh} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title="Входящие"
          rows={incoming}
          onOpen={onOpenIncoming}
          onAccept={onAccept}
          onReject={onReject}
          onCreatePair={onCreatePair}
        />

        <Section
          title="Исходящие"
          rows={outgoing}
          onOpen={onOpenOutgoing}
          onAccept={onAccept}
          onReject={onReject}
          onCreatePair={onCreatePair}
        />
      </div>

      {respondModal.open && respondModal.like && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-2 sm:items-center sm:p-3">
          <div className="app-panel w-full overflow-hidden rounded-t-2xl text-slate-900 sm:max-w-xl sm:rounded-2xl">
            <div className="flex items-center gap-3 border-b border-slate-200 p-4">
              <img
                src={toAvatarSrc(respondModal.like.from.id, respondModal.like.from.avatar)}
                width={40}
                height={40}
                className="rounded-full"
                alt={respondModal.like.from.username}
              />
              <div className="font-medium">Ответ на заявку @{respondModal.like.from.username}</div>
              <button
                onClick={onCloseRespondModal}
                className="app-btn-secondary ml-auto px-2 py-1 text-slate-700"
                aria-label="Закрыть"
              >
                x
              </button>
            </div>

            <div className="space-y-4 p-4">
              <section>
                <h3 className="mb-2 font-medium">Согласие с условиями</h3>
                <ul className="space-y-2">
                  {respondModal.like.fromCardSnapshot?.requirements.map((requirement, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={respondModal.agreements[index]}
                          onChange={(event) => onToggleAgreement(index, event.target.checked)}
                        />
                        <span>{requirement}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="mb-2 font-medium">Ответьте на вопросы</h3>
                {respondModal.like.fromCardSnapshot?.questions.map((question, index) => (
                  <div key={index} className="space-y-1">
                    <div className="app-muted text-sm">{question}</div>
                    <textarea
                      value={respondModal.answers[index]}
                      onChange={(event) => onChangeAnswer(index, event.target.value)}
                      maxLength={280}
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                    />
                    <div className="app-muted text-xs">{respondModal.answers[index].length}/280</div>
                  </div>
                ))}
              </section>

              {respondModal.error && <p className="text-red-600">{respondModal.error}</p>}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 p-4 sm:flex-row">
              <button onClick={onCloseRespondModal} className="app-btn-secondary px-4 py-2 text-slate-800">
                Отмена
              </button>
              <button
                onClick={onSubmitResponse}
                disabled={!respondModal.canSubmit || respondModal.busy}
                className="app-btn-primary px-4 py-2 text-white disabled:opacity-60"
              >
                {respondModal.busy ? 'Отправляем...' : 'Отправить ответ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
