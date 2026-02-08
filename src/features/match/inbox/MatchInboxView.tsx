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
  avatar.startsWith('http')
    ? avatar
    : `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;

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
    <section className="mb-8">
      <h2 className="font-medium mb-2">{title}</h2>
      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const canRespond = row.direction === 'incoming' && (row.status === 'sent' || row.status === 'viewed');
          const canDecide = row.direction === 'outgoing' && row.status === 'awaiting_initiator';

          return (
            <article key={row.id} className="border rounded p-2">
              <div className="w-full text-left flex items-center gap-3">
                <button type="button" onClick={() => onOpen(row.id)} className="flex items-center gap-3 flex-1">
                  <img
                    src={toAvatarSrc(row.peer.id, row.peer.avatar)}
                    width={40}
                    height={40}
                    className="rounded-full"
                    alt={row.peer.username}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{row.peer.username}</div>
                      <span className={`text-[11px] px-2 py-0.5 rounded ${BADGE_CLASS[row.status]}`}>
                        {STATUS_TEXT[row.direction][row.status]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Скор: {Math.round(row.matchScore)}%
                      {row.updatedAt ? ` · ${formatWhen(row.updatedAt)}` : ''}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  {canRespond && (
                    <button
                      type="button"
                      onClick={() => onOpen(row.id)}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                    >
                      Ответить
                    </button>
                  )}

                  {canDecide && (
                    <>
                      <button
                        type="button"
                        onClick={() => onAccept(row.id)}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                      >
                        Принять
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(row.id)}
                        className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                      >
                        Отклонить
                      </button>
                    </>
                  )}

                  {row.canCreatePair && (
                    <button
                      type="button"
                      onClick={() => onCreatePair(row.id)}
                      className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700"
                    >
                      Создать пару
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!rows.length && <p className="text-sm text-gray-500">Пусто</p>}
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
    <div className="p-4 max-w-2xl mx-auto">
      <MatchTabs />

      <div className="mt-3 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Потенциальные партнеры</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-60"
            aria-label="Обновить список"
          >
            {loading ? 'Обновляем…' : 'Обновить'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorView error={error} onRetry={onRefresh} />
        </div>
      )}

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

      {respondModal.open && respondModal.like && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden">
            <div className="p-4 border-b flex items-center gap-3">
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
                className="ml-auto text-gray-500 hover:text-black"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              <section>
                <h3 className="font-medium mb-2">Согласие с условиями</h3>
                <ul className="space-y-2">
                  {respondModal.like.fromCardSnapshot?.requirements.map((requirement, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <label className="flex items-start gap-2 cursor-pointer">
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
                <h3 className="font-medium mb-2">Ответьте на вопросы</h3>
                {respondModal.like.fromCardSnapshot?.questions.map((question, index) => (
                  <div key={index} className="space-y-1">
                    <div className="text-sm text-gray-500">{question}</div>
                    <textarea
                      value={respondModal.answers[index]}
                      onChange={(event) => onChangeAnswer(index, event.target.value)}
                      maxLength={280}
                      rows={3}
                      className="w-full border rounded px-3 py-2"
                    />
                    <div className="text-xs text-gray-500">{respondModal.answers[index].length}/280</div>
                  </div>
                ))}
              </section>

              {respondModal.error && <p className="text-red-600">{respondModal.error}</p>}
            </div>

            <div className="p-4 border-t flex gap-3">
              <button onClick={onCloseRespondModal} className="px-4 py-2 rounded bg-gray-200">
                Отмена
              </button>
              <button
                onClick={onSubmitResponse}
                disabled={!respondModal.canSubmit || respondModal.busy}
                className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
              >
                {respondModal.busy ? 'Отправляем…' : 'Отправить ответ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
