'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { authApi } from '@/client/api/auth.api';
import {
  privacyApi,
  type PrivacyDeletionRequestDTO,
} from '@/client/api/privacy.api';
import { clearEmbeddedSessionBearerToken } from '@/client/api/http';

type Operation = 'export' | 'request' | 'cancel' | 'execute' | 'refresh' | 'logout';
type StatusPhase = 'loading' | 'ready' | 'error';

const statusCopy: Record<
  PrivacyDeletionRequestDTO['status'],
  { title: string; body: string }
> = {
  PENDING_CONFIRMATION: {
    title: 'Запрос ожидает подтверждения',
    body: 'Аккаунт и данные пока не удалены. Вы можете отменить запрос или перейти к окончательному подтверждению.',
  },
  EXECUTING: {
    title: 'Удаление выполняется',
    body: 'Не создавайте новый запрос. Обновите статус через несколько минут.',
  },
  EXECUTED: {
    title: 'Удаление завершено',
    body: 'Аккаунт удалён, связанные с ним сессии отозваны.',
  },
  FAILED: {
    title: 'Удаление не завершилось',
    body: 'Аккаунт и сессии не считаются удалёнными. Можно повторить окончательное подтверждение.',
  },
  CANCELLED: {
    title: 'Запрос отменён',
    body: 'Удаление не выполнялось.',
  },
};

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'дата недоступна';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const exportDateKey = (value: string | undefined): string => {
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
};

export default function PrivacySettingsHub() {
  const router = useRouter();
  const [deletionRequest, setDeletionRequest] =
    useState<PrivacyDeletionRequestDTO | null>(null);
  const [statusPhase, setStatusPhase] = useState<StatusPhase>('loading');
  const [operation, setOperation] = useState<Operation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const deletionDialogRef = useRef<HTMLDivElement | null>(null);
  const deletionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const logoutDialogRef = useRef<HTMLDivElement | null>(null);
  const logoutTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirmingDeletion) deletionDialogRef.current?.focus();
  }, [confirmingDeletion]);

  useEffect(() => {
    if (confirmingLogout) logoutDialogRef.current?.focus();
  }, [confirmingLogout]);

  useEffect(() => {
    const controller = new AbortController();
    privacyApi
      .getDeletionRequest(controller.signal)
      .then((request) => {
        if (controller.signal.aborted) return;
        setDeletionRequest(request);
        setStatusPhase('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatusPhase('error');
      });
    return () => controller.abort();
  }, []);

  const clearFeedback = () => {
    setMessage(null);
    setError(null);
  };

  const refreshDeletionStatus = async () => {
    setOperation('refresh');
    clearFeedback();
    try {
      setDeletionRequest(await privacyApi.getDeletionRequest());
      setStatusPhase('ready');
    } catch {
      setStatusPhase('error');
      setError('Не удалось обновить статус запроса. Попробуйте ещё раз.');
    } finally {
      setOperation(null);
    }
  };

  const downloadOwnerExport = async () => {
    setOperation('export');
    clearFeedback();
    try {
      const ownerExport = await privacyApi.getOwnerExport();
      const generatedAt =
        typeof ownerExport.generatedAt === 'string'
          ? ownerExport.generatedAt
          : undefined;
      const blob = new Blob([JSON.stringify(ownerExport, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `forever-owner-export-${exportDateKey(generatedAt)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
      setMessage('Файл с вашими данными подготовлен и скачан.');
    } catch {
      setError('Не удалось подготовить выгрузку. Попробуйте ещё раз позже.');
    } finally {
      setOperation(null);
    }
  };

  const requestDeletion = async () => {
    setOperation('request');
    clearFeedback();
    try {
      const request = await privacyApi.requestDeletion();
      setDeletionRequest(request);
      setStatusPhase('ready');
      setMessage('Запрос создан. Данные ещё не удалены — требуется отдельное подтверждение.');
    } catch {
      setError('Не удалось создать запрос на удаление. Попробуйте ещё раз.');
    } finally {
      setOperation(null);
    }
  };

  const cancelDeletion = async () => {
    setOperation('cancel');
    clearFeedback();
    try {
      const response = await privacyApi.cancelDeletion();
      setDeletionRequest(response.cancelled ? null : response.request);
      setConfirmingDeletion(false);
      setConfirmationPhrase('');
      setMessage(
        response.cancelled
          ? 'Запрос на удаление отменён.'
          : 'Активного запроса, который можно отменить, уже нет.'
      );
    } catch {
      setError('Не удалось отменить запрос. Обновите статус и попробуйте ещё раз.');
    } finally {
      setOperation(null);
    }
  };

  const executeDeletion = async () => {
    if (confirmationPhrase.trim().toUpperCase() !== 'УДАЛИТЬ') return;
    setOperation('execute');
    clearFeedback();
    try {
      await privacyApi.executeDeletion();
      clearEmbeddedSessionBearerToken();
      router.replace('/');
      router.refresh();
    } catch {
      setError('Не удалось выполнить удаление. Аккаунт не считается удалённым.');
      setOperation(null);
    }
  };

  const logoutAllSessions = async () => {
    setOperation('logout');
    clearFeedback();
    try {
      await authApi.logoutAll();
      window.location.replace('/');
    } catch {
      setError('Не удалось завершить сеансы. Текущая сессия остаётся активной.');
      setOperation(null);
    }
  };

  const busy = operation !== null;
  const canExecute =
    confirmationPhrase.trim().toUpperCase() === 'УДАЛИТЬ' && !busy;
  const canConfirmRequest =
    deletionRequest?.status === 'PENDING_CONFIRMATION' ||
    deletionRequest?.status === 'FAILED';

  return (
    <main className="app-shell-narrow space-y-4 py-4 sm:py-7">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="app-muted text-xs">Аккаунт</div>
          <h1 className="mt-1 text-2xl font-semibold">Настройки и приватность</h1>
          <p className="app-muted mt-2 max-w-xl text-sm">
            Управляйте личными данными и действиями, которые влияют на аккаунт.
          </p>
        </div>
        <Link href="/profile" className="app-btn-secondary shrink-0 px-3 py-2 text-sm">
          К профилю
        </Link>
      </header>

      <section className="app-panel app-panel-solid p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Приватность по умолчанию</h2>
        <p className="app-muted mt-2 text-sm leading-relaxed">
          Личный дневник, личные заметки и приватные настройки не показываются партнёру.
          Партнёр получает только явно отправленные сигналы и безопасные общие сводки.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link href="/profile/help" className="app-btn-secondary px-4 py-3 text-left text-sm">
            <span className="block font-medium">Как работает Forever</span>
            <span className="app-muted mt-1 block text-xs">
              Циклы, сигналы, границы приватности и помощь
            </span>
          </Link>
          <Link href="/profile/safety" className="app-btn-secondary px-4 py-3 text-left text-sm">
            <span className="block font-medium">SafetyGate</span>
            <span className="app-muted mt-1 block text-xs">
              Приватный выбор только нейтральных активностей
            </span>
          </Link>
        </div>
      </section>

      <section className="app-panel app-panel-solid p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Сеансы Discord</h2>
            <p className="app-muted mt-2 max-w-xl text-sm leading-relaxed">
              Завершите все сеансы Forever, если устройство потеряно или вход больше не должен оставаться активным. На этом устройстве приложение предложит подключиться заново.
            </p>
          </div>
          <button
            ref={logoutTriggerRef}
            type="button"
            onClick={() => {
              clearFeedback();
              setConfirmingLogout(true);
            }}
            disabled={busy}
            aria-expanded={confirmingLogout}
            aria-controls="logout-all-confirmation"
            className="app-btn-secondary shrink-0 px-4 py-2 text-sm disabled:opacity-60"
          >
            Завершить все сеансы
          </button>
        </div>

        {confirmingLogout && (
          <div
            ref={logoutDialogRef}
            id="logout-all-confirmation"
            role="alertdialog"
            aria-labelledby="logout-all-confirmation-title"
            tabIndex={-1}
            className="app-alert app-alert-rate mt-4 text-sm outline-none"
          >
            <h3 id="logout-all-confirmation-title" className="font-semibold">
              Завершить сеансы на всех устройствах?
            </h3>
            <p className="mt-1">
              Для продолжения потребуется повторное безопасное подключение через Discord.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void logoutAllSessions()}
                disabled={busy}
                className="app-btn-primary px-4 py-2 text-sm disabled:opacity-60"
              >
                {operation === 'logout' ? 'Завершаем…' : 'Да, завершить'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingLogout(false);
                  requestAnimationFrame(() => logoutTriggerRef.current?.focus());
                }}
                disabled={busy}
                className="app-btn-secondary px-4 py-2 text-sm disabled:opacity-60"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="app-panel app-panel-solid p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Выгрузка моих данных</h2>
            <p className="app-muted mt-2 max-w-xl text-sm leading-relaxed">
              Скачайте JSON-файл со своими данными. В него не входят приватные ответы
              партнёра, токены, cookies и внутренние защитные записи.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void downloadOwnerExport()}
            disabled={busy}
            className="app-btn-primary shrink-0 px-4 py-2 text-sm disabled:opacity-60"
          >
            {operation === 'export' ? 'Готовим файл…' : 'Скачать данные'}
          </button>
        </div>
      </section>

      <section className="app-panel app-panel-solid border border-red-200 p-4 sm:p-5">
        <div className="max-w-xl">
          <div className="text-xs font-medium text-red-700">Опасная зона</div>
          <h2 className="mt-1 text-lg font-semibold">Удаление аккаунта</h2>
          <p className="app-muted mt-2 text-sm leading-relaxed">
            Запрос сам по себе ничего не удаляет. После отдельного финального
            подтверждения аккаунт будет удалён, а связанные с ним сессии отозваны.
            Выполненное удаление отменить нельзя.
          </p>
        </div>

        <div className="mt-4">
          {statusPhase === 'loading' ? (
            <p className="app-muted text-sm">Проверяем статус запроса…</p>
          ) : statusPhase === 'error' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p>Не удалось проверить, есть ли активный запрос.</p>
              <button
                type="button"
                onClick={() => void refreshDeletionStatus()}
                disabled={busy}
                className="app-btn-secondary mt-3 px-3 py-2 text-sm disabled:opacity-60"
              >
                {operation === 'refresh' ? 'Проверяем…' : 'Повторить проверку'}
              </button>
            </div>
          ) : deletionRequest ? (
            <div className="rounded-lg border border-red-200 bg-red-50/70 p-4">
              <div className="font-medium">{statusCopy[deletionRequest.status].title}</div>
              <p className="app-muted mt-1 text-sm">
                {statusCopy[deletionRequest.status].body}
              </p>
              <p className="app-muted mt-2 text-xs">
                Запрос от {formatDateTime(deletionRequest.requestedAt)}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {canConfirmRequest && (
                  <button
                    ref={deletionTriggerRef}
                    type="button"
                    onClick={() => {
                      setConfirmingDeletion(true);
                      setConfirmationPhrase('');
                      clearFeedback();
                    }}
                    disabled={busy}
                    className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    Перейти к финальному подтверждению
                  </button>
                )}
                {deletionRequest.status === 'PENDING_CONFIRMATION' && (
                  <button
                    type="button"
                    onClick={() => void cancelDeletion()}
                    disabled={busy}
                    className="app-btn-secondary px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {operation === 'cancel' ? 'Отменяем…' : 'Отменить запрос'}
                  </button>
                )}
                {deletionRequest.status === 'EXECUTING' && (
                  <button
                    type="button"
                    onClick={() => void refreshDeletionStatus()}
                    disabled={busy}
                    className="app-btn-secondary px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {operation === 'refresh' ? 'Проверяем…' : 'Обновить статус'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void requestDeletion()}
              disabled={busy}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
            >
              {operation === 'request' ? 'Создаём запрос…' : 'Запросить удаление'}
            </button>
          )}
        </div>

        {confirmingDeletion && canConfirmRequest && (
          <div
            ref={deletionDialogRef}
            role="alertdialog"
            aria-labelledby="delete-account-confirmation-title"
            tabIndex={-1}
            className="mt-4 rounded-lg border-2 border-red-500 bg-white p-4 outline-none"
          >
            <h3 id="delete-account-confirmation-title" className="font-semibold text-red-800">
              Финальное подтверждение
            </h3>
            <p className="app-muted mt-2 text-sm">
              Это действие необратимо. Введите <strong>УДАЛИТЬ</strong>, чтобы подтвердить
              удаление аккаунта и отзыв сессий.
            </p>
            <label className="mt-4 block text-sm" htmlFor="delete-account-confirmation">
              Подтверждение
              <input
                id="delete-account-confirmation"
                value={confirmationPhrase}
                onChange={(event) => setConfirmationPhrase(event.target.value)}
                autoComplete="off"
                className="mt-2 w-full rounded-lg border border-red-300 bg-white p-3 outline-none focus:border-red-600"
                placeholder="УДАЛИТЬ"
              />
            </label>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setConfirmingDeletion(false);
                  setConfirmationPhrase('');
                  requestAnimationFrame(() => deletionTriggerRef.current?.focus());
                }}
                disabled={busy}
                className="app-btn-secondary px-4 py-2 text-sm disabled:opacity-60"
              >
                Вернуться без удаления
              </button>
              <button
                type="button"
                onClick={() => void executeDeletion()}
                disabled={!canExecute}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {operation === 'execute' ? 'Удаляем аккаунт…' : 'Удалить аккаунт навсегда'}
              </button>
            </div>
          </div>
        )}
      </section>

      <div aria-live="polite" className="space-y-2">
        {message && (
          <div className="app-panel-soft app-panel-soft-solid rounded-lg p-3 text-sm">
            {message}
          </div>
        )}
        {error && <div className="app-alert app-alert-error text-sm">{error}</div>}
      </div>
    </main>
  );
}
