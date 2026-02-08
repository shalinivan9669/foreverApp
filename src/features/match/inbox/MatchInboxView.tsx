'use client';

/* eslint-disable @next/next/no-img-element */

import ErrorView from '@/components/ui/ErrorView';
import MatchTabs from '@/components/MatchTabs';
import type { MatchDirection, MatchInboxRowDTO, MatchLikeDTO, MatchStatus } from '@/client/api/types';
import type { UiErrorState } from '@/client/api/errors';

const STATUS_TEXT: Record<MatchDirection, Record<MatchStatus, string>> = {
  incoming: {
    sent: 'Р С•Р В¶Р С‘Р Т‘Р В°Р ВµРЎвЂљ Р Р†Р В°РЎв‚¬Р ВµР С–Р С• Р С•РЎвЂљР Р†Р ВµРЎвЂљР В°',
    viewed: 'Р С•Р В¶Р С‘Р Т‘Р В°Р ВµРЎвЂљ Р Р†Р В°РЎв‚¬Р ВµР С–Р С• Р С•РЎвЂљР Р†Р ВµРЎвЂљР В°',
    awaiting_initiator: 'Р С•Р В¶Р С‘Р Т‘Р В°Р ВµРЎвЂљ РЎР‚Р ВµРЎв‚¬Р ВµР Р…Р С‘РЎРЏ Р С‘Р Р…Р С‘РЎвЂ Р С‘Р В°РЎвЂљР С•РЎР‚Р В°',
    mutual_ready: 'Р С–Р С•РЎвЂљР С•Р Р†Р С• Р С” Р С—Р В°РЎР‚Р Вµ',
    paired: 'Р С—Р В°РЎР‚Р В° РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р В°',
    rejected: 'Р С•РЎвЂљР С”Р В»Р С•Р Р…Р ВµР Р…Р С•',
    expired: 'Р С‘РЎРѓРЎвЂљР ВµР С”Р В»Р С•',
  },
  outgoing: {
    sent: 'Р С•РЎвЂљР С—РЎР‚Р В°Р Р†Р В»Р ВµР Р…Р С•',
    viewed: 'Р С—РЎР‚Р С•РЎРѓР СР С•РЎвЂљРЎР‚Р ВµР Р…Р С•',
    awaiting_initiator: 'Р С•Р В¶Р С‘Р Т‘Р В°Р ВµРЎвЂљ Р Р†Р В°РЎв‚¬Р ВµР С–Р С• РЎР‚Р ВµРЎв‚¬Р ВµР Р…Р С‘РЎРЏ',
    mutual_ready: 'Р С–Р С•РЎвЂљР С•Р Р†Р С• Р С” Р С—Р В°РЎР‚Р Вµ',
    paired: 'Р С—Р В°РЎР‚Р В° РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р В°',
    rejected: 'Р С•РЎвЂљР С”Р В»Р С•Р Р…Р ВµР Р…Р С•',
    expired: 'Р С‘РЎРѓРЎвЂљР ВµР С”Р В»Р С•',
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
            <article key={row.id} className="app-panel p-2">
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
                    <div className="app-muted text-xs">
                      Р РЋР С”Р С•РЎР‚: {Math.round(row.matchScore)}%
                      {row.updatedAt ? ` Р’В· ${formatWhen(row.updatedAt)}` : ''}
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
                      Р С›РЎвЂљР Р†Р ВµРЎвЂљР С‘РЎвЂљРЎРЉ
                    </button>
                  )}

                  {canDecide && (
                    <>
                      <button
                        type="button"
                        onClick={() => onAccept(row.id)}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                      >
                        Р СџРЎР‚Р С‘Р Р…РЎРЏРЎвЂљРЎРЉ
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(row.id)}
                        className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                      >
                        Р С›РЎвЂљР С”Р В»Р С•Р Р…Р С‘РЎвЂљРЎРЉ
                      </button>
                    </>
                  )}

                  {row.canCreatePair && (
                    <button
                      type="button"
                      onClick={() => onCreatePair(row.id)}
                      className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700"
                    >
                      Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С—Р В°РЎР‚РЎС“
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!rows.length && <p className="app-muted text-sm">Р СџРЎС“РЎРѓРЎвЂљР С•</p>}
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
    <div className="mx-auto max-w-2xl p-4 text-slate-900">
      <MatchTabs />

      <div className="mt-3 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Р СџР С•РЎвЂљР ВµР Р…РЎвЂ Р С‘Р В°Р В»РЎРЉР Р…РЎвЂ№Р Вµ Р С—Р В°РЎР‚РЎвЂљР Р…Р ВµРЎР‚РЎвЂ№</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="app-btn-secondary px-3 py-1.5 text-sm text-slate-800 disabled:opacity-60"
            aria-label="Р С›Р В±Р Р…Р С•Р Р†Р С‘РЎвЂљРЎРЉ РЎРѓР С—Р С‘РЎРѓР С•Р С”"
          >
            {loading ? 'Р С›Р В±Р Р…Р С•Р Р†Р В»РЎРЏР ВµР СРІР‚В¦' : 'Р С›Р В±Р Р…Р С•Р Р†Р С‘РЎвЂљРЎРЉ'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorView error={error} onRetry={onRefresh} />
        </div>
      )}

      <Section
        title="Р вЂ™РЎвЂ¦Р С•Р Т‘РЎРЏРЎвЂ°Р С‘Р Вµ"
        rows={incoming}
        onOpen={onOpenIncoming}
        onAccept={onAccept}
        onReject={onReject}
        onCreatePair={onCreatePair}
      />

      <Section
        title="Р ВРЎРѓРЎвЂ¦Р С•Р Т‘РЎРЏРЎвЂ°Р С‘Р Вµ"
        rows={outgoing}
        onOpen={onOpenOutgoing}
        onAccept={onAccept}
        onReject={onReject}
        onCreatePair={onCreatePair}
      />

      {respondModal.open && respondModal.like && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 sm:items-center">
          <div className="app-panel w-full overflow-hidden rounded-t-2xl text-slate-900 sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center gap-3 border-b border-slate-200 p-4">
              <img
                src={toAvatarSrc(respondModal.like.from.id, respondModal.like.from.avatar)}
                width={40}
                height={40}
                className="rounded-full"
                alt={respondModal.like.from.username}
              />
              <div className="font-medium">Р С›РЎвЂљР Р†Р ВµРЎвЂљ Р Р…Р В° Р В·Р В°РЎРЏР Р†Р С”РЎС“ @{respondModal.like.from.username}</div>
              <button
                onClick={onCloseRespondModal}
                className="app-btn-secondary ml-auto px-2 py-1 text-slate-700"
                aria-label="Р вЂ”Р В°Р С”РЎР‚РЎвЂ№РЎвЂљРЎРЉ"
              >
                РІСљвЂў
              </button>
            </div>

            <div className="p-4 space-y-4">
              <section>
                <h3 className="font-medium mb-2">Р РЋР С•Р С–Р В»Р В°РЎРѓР С‘Р Вµ РЎРѓ РЎС“РЎРѓР В»Р С•Р Р†Р С‘РЎРЏР СР С‘</h3>
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
                <h3 className="font-medium mb-2">Р С›РЎвЂљР Р†Р ВµРЎвЂљРЎРЉРЎвЂљР Вµ Р Р…Р В° Р Р†Р С•Р С—РЎР‚Р С•РЎРѓРЎвЂ№</h3>
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

            <div className="flex gap-3 border-t border-slate-200 p-4">
              <button onClick={onCloseRespondModal} className="app-btn-secondary px-4 py-2 text-slate-800">
                Р С›РЎвЂљР СР ВµР Р…Р В°
              </button>
              <button
                onClick={onSubmitResponse}
                disabled={!respondModal.canSubmit || respondModal.busy}
                className="app-btn-primary px-4 py-2 text-white disabled:opacity-60"
              >
                {respondModal.busy ? 'Р С›РЎвЂљР С—РЎР‚Р В°Р Р†Р В»РЎРЏР ВµР СРІР‚В¦' : 'Р С›РЎвЂљР С—РЎР‚Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р С•РЎвЂљР Р†Р ВµРЎвЂљ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


