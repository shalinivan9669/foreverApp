'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { entryApi } from '@/client/api/entry.api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BackBar from '@/components/ui/BackBar';
import {
  mvpOnboardingApi,
  type MvpOnboardingAnswerValue,
  type MvpOnboardingCapturePolicy,
  type MvpOnboardingQuestionDTO,
  type MvpOnboardingResponseDTO,
} from '@/client/api/mvpOnboarding.api';

type ConsentState = {
  adultConfirmed: boolean;
  voluntaryParticipationConfirmed: boolean;
  privacyAcknowledged: boolean;
};

const EMPTY_CONSENT: ConsentState = {
  adultConfirmed: false,
  voluntaryParticipationConfirmed: false,
  privacyAcknowledged: false,
};

const policyButtonClass = (selected: boolean): string =>
  `rounded-lg border p-3 text-left text-sm transition ${
    selected
      ? 'border-blue-500 bg-blue-50 text-blue-950'
      : 'border-slate-200 bg-white text-slate-800'
  }`;

const optionButtonClass = (selected: boolean): string =>
  `w-full rounded-lg border px-3 py-3 text-left text-sm transition ${
    selected
      ? 'border-emerald-500 bg-emerald-50 text-emerald-950'
      : 'border-slate-200 bg-white text-slate-800'
  }`;

function ConsentScreen({
  payload,
  consent,
  busy,
  onConsentChange,
  onStart,
}: {
  payload: MvpOnboardingResponseDTO;
  consent: ConsentState;
  busy: boolean;
  onConsentChange: (next: ConsentState) => void;
  onStart: () => void;
}) {
  const allConfirmed = Object.values(consent).every(Boolean);

  return (
    <section className="app-panel app-panel-solid p-4 sm:p-6">
      <div className="app-muted text-xs">Перед началом</div>
      <h1 className="mt-1 text-2xl font-semibold">Короткое знакомство с форматом</h1>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Здесь {payload.definition.questions.length} закрытых вопросов без свободного текста. Чувствительные вопросы можно
        пропустить. Для каждого ответа вы отдельно выбираете, как его разрешено использовать.
      </p>

      <div className="mt-5 space-y-3">
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <input
            type="checkbox"
            checked={consent.adultConfirmed}
            onChange={(event) =>
              onConsentChange({ ...consent, adultConfirmed: event.target.checked })
            }
            className="mt-0.5"
          />
          <span>Мне исполнилось 18 лет.</span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <input
            type="checkbox"
            checked={consent.voluntaryParticipationConfirmed}
            onChange={(event) =>
              onConsentChange({
                ...consent,
                voluntaryParticipationConfirmed: event.target.checked,
              })
            }
            className="mt-0.5"
          />
          <span>
            Я участвую добровольно и могу остановиться, не отвечать на необязательный вопрос
            или вернуться позже.
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <input
            type="checkbox"
            checked={consent.privacyAcknowledged}
            onChange={(event) =>
              onConsentChange({ ...consent, privacyAcknowledged: event.target.checked })
            }
            className="mt-0.5"
          />
          <span>
            Я понимаю разницу между «только для меня», «только для расчёта» и «можно
            показать».
          </span>
        </label>
      </div>

      <div className="app-panel-soft mt-5 p-4 text-sm">
        <div className="font-medium">Версии согласия</div>
        <div className="app-muted mt-1">
          Контент: {payload.definition.contentRevision} · политика:{' '}
          {payload.definition.policyVersion}
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={!allConfirmed || busy}
        className="app-btn-primary mt-5 w-full px-4 py-3 text-sm disabled:opacity-50 sm:w-auto"
      >
        {busy ? 'Сохраняем согласие...' : 'Начать'}
      </button>
    </section>
  );
}

function QuestionOptions({
  question,
  singleValue,
  multiValues,
  booleanValue,
  onSingleChange,
  onMultiChange,
  onBooleanChange,
}: {
  question: MvpOnboardingQuestionDTO;
  singleValue: string | null;
  multiValues: string[];
  booleanValue: boolean | null;
  onSingleChange: (value: string) => void;
  onMultiChange: (values: string[]) => void;
  onBooleanChange: (value: boolean) => void;
}) {
  if (question.kind === 'boolean') {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onBooleanChange(true)}
          className={optionButtonClass(booleanValue === true)}
          aria-pressed={booleanValue === true}
        >
          Да
        </button>
        <button
          type="button"
          onClick={() => onBooleanChange(false)}
          className={optionButtonClass(booleanValue === false)}
          aria-pressed={booleanValue === false}
        >
          Нет
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(question.choices ?? []).map((choice) => {
        const selected =
          question.kind === 'single'
            ? singleValue === choice.id
            : multiValues.includes(choice.id);
        return (
          <button
            key={choice.id}
            type="button"
            onClick={() => {
              if (question.kind === 'single') {
                onSingleChange(choice.id);
                return;
              }
              if (selected) {
                onMultiChange(multiValues.filter((value) => value !== choice.id));
                return;
              }
              const max = question.maxSelections ?? question.choices?.length ?? 1;
              if (multiValues.length < max) {
                onMultiChange([...multiValues, choice.id]);
              }
            }}
            className={optionButtonClass(selected)}
            aria-pressed={selected}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

function QuestionScreen({
  payload,
  question,
  busy,
  onSaved,
  onError,
}: {
  payload: MvpOnboardingResponseDTO;
  question: MvpOnboardingQuestionDTO;
  busy: boolean;
  onSaved: (next: MvpOnboardingResponseDTO) => void;
  onError: (message: string) => void;
}) {
  const [singleValue, setSingleValue] = useState<string | null>(null);
  const [multiValues, setMultiValues] = useState<string[]>([]);
  const [booleanValue, setBooleanValue] = useState<boolean | null>(null);
  const [capturePolicy, setCapturePolicy] =
    useState<MvpOnboardingCapturePolicy | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [question.id]);

  const answerValue = useMemo<MvpOnboardingAnswerValue | null>(() => {
    if (question.kind === 'single') {
      return singleValue ? { kind: 'single', optionId: singleValue } : null;
    }
    if (question.kind === 'multi') {
      const min = question.minSelections ?? 1;
      return multiValues.length >= min
        ? { kind: 'multi', optionIds: multiValues }
        : null;
    }
    return booleanValue === null
      ? null
      : { kind: 'boolean', booleanValue };
  }, [booleanValue, multiValues, question.kind, question.minSelections, singleValue]);

  const submit = async (value: MvpOnboardingAnswerValue, policy: MvpOnboardingCapturePolicy) => {
    if (busy || submitting) return;

    setSubmitting(true);
    onError('');
    try {
      const next = await mvpOnboardingApi.mutate({
        action: 'answer',
        questionId: question.id,
        questionRevision: question.revision,
        capturePolicy: policy,
        value,
      });
      onSaved(next);
    } catch {
      onError('Не удалось сохранить ответ. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  const answerPending = busy || submitting;

  const cursor = payload.session?.cursor ?? 0;
  const total = payload.definition.questions.length;

  return (
    <section className="app-panel app-panel-solid p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="app-muted text-xs">
          Вопрос {Math.min(cursor + 1, total)} из {total}
        </span>
        <div className="flex gap-2 text-xs">
          {question.sensitive && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
              чувствительный
            </span>
          )}
          {question.optional && (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              необязательный
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          role="progressbar"
          aria-label="Прогресс начальной настройки"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={cursor}
          className="h-full rounded-full bg-blue-500"
          style={{ width: `${Math.round((cursor / total) * 100)}%` }}
        />
      </div>

      <h1 ref={headingRef} tabIndex={-1} className="mt-5 text-xl font-semibold outline-none">{question.title}</h1>
      <p className="app-muted mt-2 text-sm">{question.description}</p>
      {question.kind === 'multi' && (
        <p className="app-muted mt-2 text-xs">
          Выберите от {question.minSelections ?? 1} до {question.maxSelections ?? question.choices?.length ?? 1} вариантов.
        </p>
      )}

      <div className="mt-5">
        <QuestionOptions
          question={question}
          singleValue={singleValue}
          multiValues={multiValues}
          booleanValue={booleanValue}
          onSingleChange={setSingleValue}
          onMultiChange={setMultiValues}
          onBooleanChange={setBooleanValue}
        />
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold">Как можно использовать этот ответ?</h2>
        <p className="app-muted mt-1 text-xs">
          Выбор относится только к этому ответу и его текущей ревизии.
        </p>
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {payload.definition.capturePolicies
            .filter((policy) => question.allowedCapturePolicies.includes(policy.id))
            .map((policy) => (
              <button
                key={policy.id}
                type="button"
                onClick={() => setCapturePolicy(policy.id)}
                className={policyButtonClass(capturePolicy === policy.id)}
                aria-pressed={capturePolicy === policy.id}
              >
                <span className="block font-medium">{policy.title}</span>
                <span className="app-muted mt-1 block text-xs">{policy.description}</span>
              </button>
            ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            if (answerValue && capturePolicy) void submit(answerValue, capturePolicy);
          }}
          disabled={!answerValue || !capturePolicy || answerPending}
          className="app-btn-primary px-4 py-3 text-sm disabled:opacity-50"
        >
          {answerPending ? 'Сохраняем...' : 'Сохранить и продолжить'}
        </button>
        {question.optional && (
          <button
            type="button"
            onClick={() => void submit({ kind: 'skipped' }, 'PRIVATE')}
            disabled={answerPending}
            className="app-btn-secondary px-4 py-3 text-sm disabled:opacity-50"
          >
            Пропустить
          </button>
        )}
      </div>
    </section>
  );
}

export default function MvpOnboardingPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<MvpOnboardingResponseDTO | null>(null);
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnHref, setReturnHref] = useState('/main-menu');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entry = await entryApi.get();
      if (!entry.user.entryCompletedAt || !entry.user.entryCohort) {
        router.replace(`/entry${window.location.hash}`);
        return;
      }
      if (new URLSearchParams(window.location.hash.slice(1)).get('return') !== 'join' && !entry.hasPair) {
        setReturnHref(entry.user.entryCohort === 'EXISTING_PARTNER' ? '/invite' : '/profile');
      }
      setPayload(await mvpOnboardingApi.getOwnerState());
    } catch {
      setError('Не удалось загрузить настройку. Проверьте вход и попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = fragment.get('token')?.trim() ?? '';
    const partnerCode = fragment.get('partnerCode')?.trim() ?? '';
    if (fragment.get('return') === 'join' && (/^[A-Za-z0-9_-]{43}$/.test(token) || /^VM-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/.test(partnerCode))) {
      const nextReturnHref = `/join#${new URLSearchParams(token ? { token } : { partnerCode }).toString()}`;
      void Promise.resolve().then(() => {
        if (active) setReturnHref(nextReturnHref);
      });
    }

    void Promise.resolve().then(() => { if (active) return load(); });

    return () => {
      active = false;
    };
  }, [load]);

  const start = async () => {
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      setPayload(
        await mvpOnboardingApi.mutate({
          action: 'start',
          contentRevision: payload.definition.contentRevision,
          policyVersion: payload.definition.policyVersion,
          consent,
        })
      );
    } catch {
      setError('Не удалось сохранить согласие. Проверьте отметки и попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    setBusy(true);
    setError(null);
    try {
      setPayload(await mvpOnboardingApi.mutate({ action: 'complete' }));
    } catch {
      setError('Не удалось завершить настройку. Проверьте обязательные ответы.');
    } finally {
      setBusy(false);
    }
  };

  const currentQuestion = payload?.session
    ? payload.definition.questions[payload.session.cursor]
    : undefined;

  return (
    <main className="app-shell-compact app-page-stack py-3 sm:py-5 lg:py-7">
      <BackBar title="Начальная настройка" fallbackHref="/main-menu" />

      {loading && (
        <div className="app-panel-soft p-4 text-sm app-muted" role="status" aria-live="polite">Загружаем прогресс...</div>
      )}

      {error && (
        <div className="app-alert app-alert-error text-sm" role="alert">
          <div>{error}</div>
          {!payload && (
            <button
              type="button"
              onClick={() => void load()}
              className="app-btn-secondary mt-3 px-3 py-2 text-sm"
            >
              Повторить
            </button>
          )}
        </div>
      )}

      {!loading && payload && !payload.session && (
        <ConsentScreen
          payload={payload}
          consent={consent}
          busy={busy}
          onConsentChange={setConsent}
          onStart={() => void start()}
        />
      )}

      {!loading && payload?.session?.status === 'in_progress' && currentQuestion && (
        <QuestionScreen
          key={currentQuestion.id}
          payload={payload}
          question={currentQuestion}
          busy={busy}
          onSaved={(next) => {
            setError(null);
            setPayload(next);
          }}
          onError={(message) => setError(message || null)}
        />
      )}

      {!loading &&
        payload?.session?.status === 'in_progress' &&
        !currentQuestion && (
          <section className="app-panel app-panel-solid p-4 sm:p-6">
            <div className="app-muted text-xs">Все вопросы сохранены</div>
            <h1 className="mt-1 text-2xl font-semibold">Можно завершить настройку</h1>
            <p className="app-muted mt-2 text-sm">
              Ответы сохранены с отдельными правилами использования. После завершения
              этой настройки изменить эти ответы здесь нельзя; они не станут общими автоматически.
            </p>
            <button
              type="button"
              onClick={() => void complete()}
              disabled={busy}
              className="app-btn-primary mt-5 px-4 py-3 text-sm disabled:opacity-50"
            >
              {busy ? 'Завершаем...' : 'Завершить настройку'}
            </button>
          </section>
        )}

      {!loading && payload?.session?.status === 'completed' && (
        <section className="app-panel app-panel-solid p-4 sm:p-6">
          <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">
            завершено
          </div>
          <h1 className="mt-3 text-2xl font-semibold">Начальная настройка готова</h1>
          <p className="app-muted mt-2 text-sm">
            Сохранено ответов: {payload.session.answers.length}. Точные ответы не становятся
            общими автоматически и используются согласно выбранному правилу для каждого ответа.
          </p>
          {returnHref === '/profile' && <p className="app-muted mt-3 text-sm">
            Теперь можно выбрать личную практику или программу. Поиск партнёра настраивается отдельно, когда вы будете готовы.
          </p>}
          <Link
            href={returnHref === '/profile' ? '/development' : returnHref}
            className="app-btn-primary mt-5 inline-flex w-full justify-center px-4 py-3 text-sm sm:w-auto"
          >
            {returnHref.startsWith('/join') ? 'Вернуться к приглашению' : returnHref === '/invite' ? 'Связать аккаунт партнёра' : returnHref === '/profile' ? 'Продолжить личное развитие' : 'Открыть «Вместе»'}
          </Link>
          {returnHref === '/profile' && <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/match-card/create" className="app-btn-secondary px-4 py-3 text-sm">Настроить поиск партнёра</Link>
            <Link href="/profile" className="app-btn-secondary px-4 py-3 text-sm">Мой профиль</Link>
          </div>}
        </section>
      )}
    </main>
  );
}
