'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { pairInvitesApi, type PairInviteOwnerDTO, type PairInviteStatus } from '@/client/api/pairInvites.api';
import { entryApi } from '@/client/api/entry.api';
import { useApi } from '@/client/hooks/useApi';
import BackBar from '@/components/ui/BackBar';
import EmptyStateView from '@/components/ui/EmptyStateView';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';

const STATUS_LABELS: Record<PairInviteStatus, string> = {
  ACTIVE: 'Ожидаем партнёра',
  ACCEPTED: 'Партнёр присоединился',
  CANCELLED: 'Приглашение отменено',
  EXPIRED: 'Срок приглашения истёк',
};

const formatExpiry = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Срок действия уточняется';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const effectiveStatus = (invite: PairInviteOwnerDTO): PairInviteStatus => {
  if (invite.status !== 'ACTIVE') return invite.status;
  const expiresAt = new Date(invite.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() ? 'EXPIRED' : 'ACTIVE';
};

const makeShareLink = (token: string): string | null => {
  if (typeof window === 'undefined') return null;
  const fragment = new URLSearchParams({ token }).toString();
  return `${window.location.origin}/join#${fragment}`;
};

export default function PairInvitePage() {
  const router = useRouter();
  const [invite, setInvite] = useState<PairInviteOwnerDTO | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [publicId, setPublicId] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [entryAllowed, setEntryAllowed] = useState(false);
  const { run, loading, error, clearError } = useApi('pair-invite');

  const shareLink = useMemo(() => (rawToken ? makeShareLink(rawToken) : null), [rawToken]);
  const status = invite ? effectiveStatus(invite) : null;

  const loadCurrent = useCallback(async () => {
    clearError();
    setNotice(null);
    setIdentityConfirmed(false);
    try {
      const current = await run(() => pairInvitesApi.getCurrent(), {
        loadingKey: 'pair-invite-status',
      });

      if (
        !current ||
        current.status !== 'ACTIVE' ||
        (invite && current.id !== invite.id)
      ) {
        setRawToken(null);
      }
      setInvite(current);
    } catch {
      // useApi exposes a sanitized UI error.
    } finally {
      setLoaded(true);
    }
  }, [clearError, invite, run]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    void (async () => {
      try {
        const current = await run(() => pairInvitesApi.getCurrent(controller.signal), {
          loadingKey: 'pair-invite-status',
        });
        if (!active) return;
        setInvite(current);
        const entry = await run(() => entryApi.get(controller.signal), { loadingKey: 'pair-entry' });
        if (!active) return;
        setPublicId(entry.user.publicId);
        setEntryAllowed(entry.user.entryCohort === 'EXISTING_PARTNER');
      } catch {
        // useApi exposes a sanitized UI error.
      } finally {
        if (active) setLoaded(true);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [run]);

  const createInvite = async () => {
    clearError();
    setNotice(null);
    try {
      const created = await run(() => pairInvitesApi.create(), {
        loadingKey: 'pair-invite-create',
      });
      setInvite(created);
      setIdentityConfirmed(false);
      setRawToken(created.token ?? null);
      setNotice(
        created.token
          ? 'Ссылка готова. Отправьте её только своему партнёру.'
          : 'Приглашение создано. Чтобы получить новую ссылку, перевыпустите его.'
      );
    } catch {
      // useApi exposes a sanitized UI error.
    }
  };

  const confirmPartner = async () => {
    const partner = invite?.partner;
    if (!invite || !partner || !identityConfirmed) return;
    try {
      const result = await run(() => pairInvitesApi.confirm(invite.id, partner.publicId), { loadingKey: 'pair-invite-confirm' });
      if (result.pairId) router.replace(`/pair/${encodeURIComponent(result.pairId)}`);
    } catch { /* useApi displays the safe failure. */ }
  };

  const cancelInvite = async () => {
    if (!invite) return;
    if (!window.confirm('Отменить текущую ссылку? После этого она перестанет работать.')) {
      return;
    }

    clearError();
    setNotice(null);
    try {
      const cancelled = await run(() => pairInvitesApi.cancel(invite.id), {
        loadingKey: 'pair-invite-cancel',
      });
      setInvite(cancelled);
      setRawToken(null);
      setNotice('Приглашение отменено.');
    } catch {
      // useApi exposes a sanitized UI error.
    }
  };

  const reissueInvite = async () => {
    if (!invite) return;
    if (
      status === 'ACTIVE' &&
      !window.confirm('Перевыпустить ссылку? Текущая ссылка сразу перестанет работать.')
    ) {
      return;
    }

    clearError();
    setNotice(null);
    try {
      const reissued = await run(() => pairInvitesApi.reissue(invite.id), {
        loadingKey: 'pair-invite-reissue',
      });
      setInvite(reissued);
      setIdentityConfirmed(false);
      setRawToken(reissued.token ?? null);
      setNotice(
        reissued.token
          ? 'Новая ссылка готова. Предыдущая ссылка больше не работает.'
          : 'Приглашение перевыпущено, но ссылку получить не удалось.'
      );
    } catch {
      // useApi exposes a sanitized UI error.
    }
  };

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      if (!navigator.clipboard) {
        setNotice('Скопируйте ссылку из поля вручную.');
        return;
      }
      await navigator.clipboard.writeText(shareLink);
      setNotice('Ссылка скопирована.');
    } catch {
      setNotice('Не удалось скопировать автоматически. Скопируйте ссылку из поля.');
    }
  };

  const shareInvite = async () => {
    if (!shareLink) return;
    if (typeof navigator.share !== 'function') {
      await copyShareLink();
      return;
    }

    try {
      await navigator.share({
        title: 'Приглашение во «Вместе»',
        text: 'Присоединяйся к нашей общей парной области.',
        url: shareLink,
      });
      setNotice('Ссылка отправлена.');
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.name === 'AbortError') return;
      setNotice('Не удалось открыть меню отправки. Скопируйте ссылку вручную.');
    }
  };

  if (!loaded) {
    return <LoadingView label="Проверяем приглашение..." />;
  }

  return (
    <main className="app-shell-compact app-page-stack py-3 sm:py-5">
      <BackBar title="Приглашение партнёра" />

      <section className="app-panel app-reveal p-4 text-slate-900 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
          Только для вашей пары
        </p>
        <h1 className="font-display mt-2 text-2xl font-semibold leading-tight">
          Свяжите ваши аккаунты
        </h1>
        <p className="app-muted mt-2 text-sm leading-relaxed">
          Создайте приглашение и передайте партнёру ссылку или свой код «Вместе».
          Каждый увидит имя и код другого и отдельно подтвердит: «Это мой партнёр».
          Одной ссылки или чужого Discord-имени недостаточно для создания пары.
        </p>
        {publicId && <div className="app-panel-soft mt-4 space-y-2 p-3">
          <p className="text-sm font-medium">Ваш постоянный код «Вместе»</p>
          <input readOnly aria-label="Ваш код Вместе" value={publicId} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-lg border border-slate-200 p-2 font-mono text-sm" />
          <p className="app-muted text-xs">Код ищет только ваше действующее приглашение. Он не заменяет вход в аккаунт.</p>
        </div>}
      </section>

      {!entryAllowed && <section className="app-panel-soft p-4 text-sm"><p>Для связывания реального партнёра сначала выберите этот путь в личной настройке.</p><Link href="/entry" className="app-btn-primary mt-3 inline-flex px-4 py-2">Выбрать путь</Link></section>}

      {entryAllowed && <form onSubmit={(event) => { event.preventDefault(); router.push(`/join#${new URLSearchParams({ partnerCode: partnerCode.trim().toUpperCase() })}`); }} className="app-panel app-panel-solid space-y-3 p-4">
        <label className="block text-sm font-medium" htmlFor="partner-code">Партнёр уже создал приглашение? Введите его код</label>
        <input id="partner-code" value={partnerCode} onChange={(event) => setPartnerCode(event.target.value)} placeholder="VM-XXXXXXXX-XXXXXXXX-XXXXXXXX" maxLength={29} autoComplete="off" className="w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-sm" />
        <button type="submit" disabled={!/^VM-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/.test(partnerCode.trim().toUpperCase())} className="app-btn-secondary px-4 py-2 text-sm disabled:opacity-50">Проверить приглашение</button>
      </form>}

      {error && (
        <>
          <ErrorView
            error={error}
            onRetry={() => void loadCurrent()}
            onAuthRequired={() => router.push('/')}
          />
          {error.code === 'ONBOARDING_REQUIRED' && (
            <Link
              href="/mvp-onboarding"
              className="app-btn-primary inline-flex w-full justify-center px-4 py-2.5 text-white"
            >
              Пройти личную настройку
            </Link>
          )}
        </>
      )}

      {!invite && loaded && !error && entryAllowed && (
        <section className="app-panel-soft app-reveal p-4 sm:p-5">
          <EmptyStateView
            title="Активного приглашения пока нет"
            description="Создайте ссылку и поделитесь ею с партнёром."
          />
          <button
            type="button"
            onClick={() => void createInvite()}
            disabled={loading}
            className="app-btn-primary mt-4 w-full px-4 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Создать приглашение
          </button>
        </section>
      )}

      {invite && status && (
        <section className="app-panel app-reveal p-4 text-slate-900 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-muted text-xs">Статус</p>
              <p className="mt-1 text-lg font-semibold">{STATUS_LABELS[status]}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadCurrent()}
              disabled={loading}
              className="app-btn-secondary px-3 py-1.5 text-sm disabled:opacity-60"
            >
              Обновить
            </button>
          </div>

          <div className="app-panel-soft mt-4 p-3 text-sm">
            <span className="app-muted">Действует до: </span>
            <span className="font-medium">{formatExpiry(invite.expiresAt)}</span>
          </div>

          {status === 'ACTIVE' && invite.awaitingOwnerConfirmation && invite.partner && <div className="mt-4 space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <h2 className="font-semibold">Проверьте, кто откликнулся</h2>
            <p>{invite.partner.username}</p><p className="break-all font-mono text-sm">{invite.partner.publicId}</p>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={identityConfirmed} onChange={(event) => setIdentityConfirmed(event.target.checked)} className="mt-1" />Это мой партнёр. Я добровольно подтверждаю создание нашей пары.</label>
            <button type="button" disabled={!identityConfirmed || loading} onClick={() => void confirmPartner()} className="app-btn-primary w-full px-4 py-2 disabled:opacity-50">Подтвердить нашу пару</button>
            <p className="app-muted text-xs">Если имя или код не совпадают, отмените приглашение. До вашего подтверждения общая пара не создаётся.</p>
          </div>}

          {status === 'ACTIVE' && !invite.awaitingOwnerConfirmation && shareLink && (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium" htmlFor="pair-invite-link">
                Ссылка для партнёра
              </label>
              <input
                id="pair-invite-link"
                readOnly
                value={shareLink}
                onFocus={(event) => event.currentTarget.select()}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-400"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void copyShareLink()}
                  className="app-btn-primary px-4 py-2 text-white"
                >
                  Скопировать
                </button>
                <button
                  type="button"
                  onClick={() => void shareInvite()}
                  className="app-btn-secondary px-4 py-2"
                >
                  Поделиться
                </button>
              </div>
            </div>
          )}

          {status === 'ACTIVE' && !invite.awaitingOwnerConfirmation && !shareLink && (
            <div className="app-alert app-alert-auth mt-4">
              <p className="font-medium">Приглашение активно</p>
              <p className="mt-1 text-sm">
                Партнёр может ввести ваш постоянный код «Вместе». Старая одноразовая ссылка
                не восстанавливается после входа; при необходимости перевыпустите её.
              </p>
            </div>
          )}

          {status === 'ACCEPTED' ? (
            <Link
              href="/main-menu"
              className="app-btn-primary mt-4 inline-flex w-full justify-center px-4 py-2.5 text-white"
            >
              Открыть текущий цикл
            </Link>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void reissueInvite()}
                disabled={loading}
                className="app-btn-secondary flex-1 px-4 py-2 disabled:opacity-60"
              >
                Перевыпустить ссылку
              </button>
              {status === 'ACTIVE' && (
                <button
                  type="button"
                  onClick={() => void cancelInvite()}
                  disabled={loading}
                  className="rounded-xl border border-rose-200 bg-white px-4 py-2 font-medium text-rose-700 disabled:opacity-60"
                >
                  Отменить
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {notice && (
        <div className="app-alert app-alert-auth app-reveal" aria-live="polite">
          {notice}
        </div>
      )}
    </main>
  );
}
