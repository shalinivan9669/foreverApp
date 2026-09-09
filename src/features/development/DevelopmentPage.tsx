"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { usePair } from "@/client/hooks/usePair";
import { useDevelopment } from "@/client/hooks/useDevelopment";
import { useRefreshOnReturn } from "@/client/hooks/useRefreshOnReturn";
import { confirmAppNavigation, useUnsavedChanges } from "@/client/hooks/useUnsavedChanges";
import { developmentLibraryHref, developmentRunStatus, isTogetherDevelopment, recentCompletedDevelopmentRuns, resumableDevelopmentRuns, type DevelopmentAudience } from "@/client/viewmodels/development.viewmodels";
import type {
  DevelopmentCompleteInput,
  DevelopmentDetailDTO,
} from "@/lib/dto/development.dto";
import ErrorView from "@/components/ui/ErrorView";
import DevelopmentCatalog from "./DevelopmentCatalog";

const KIND_LABELS: Record<string, string> = {
  REFLECTION: "Саморефлексия",
  SOLO_PRACTICE: "Личная практика",
  PAIR_PRACTICE: "Практика пары",
  TOPIC: "Тема разговора",
  LEISURE: "Идея отдыха",
};
function CompletionForm({
  detail,
  busy,
  onComplete,
}: {
  detail: DevelopmentDetailDTO;
  busy: boolean;
  onComplete: (input: DevelopmentCompleteInput) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState("");
  const [note, setNote] = useState("");
  useUnsavedChanges(Object.keys(answers).length > 0 || !!feedback || !!note, busy);
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        if (!["HELPFUL", "NEUTRAL", "NOT_FOR_ME"].includes(feedback)) return;
        void onComplete({
          runId: detail.run.id,
          answers: detail.content.prompts.map((_, question) => ({
            question,
            value:
              answers[question] === "skip" ? null : Number(answers[question]),
          })),
          feedback: feedback as DevelopmentCompleteInput["feedback"],
          privateNote: note,
        });
      }}
    >
      <fieldset disabled={busy} className="space-y-4">
      <legend className="mb-3 font-semibold">Ваш личный результат</legend>
      {detail.content.prompts.map((prompt, i) => (
        <label key={prompt} className="block text-sm">
          {prompt}
          <select
            required
            value={answers[i] ?? ""}
            onChange={(event) =>
              setAnswers({ ...answers, [i]: event.target.value })
            }
            className="app-input mt-2 w-full"
          >
            <option value="" disabled>
              Выберите ответ
            </option>
            {detail.responseOptions.map((option, index) => (
              <option key={option} value={index}>
                {option}
              </option>
            ))}
            <option value="skip">Пропустить этот вопрос</option>
          </select>
        </label>
      ))}
      <label className="block text-sm">
        Как вам это занятие?
        <select
          required
          className="app-input mt-2 w-full"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
        >
          <option value="" disabled>
            Выберите впечатление
          </option>
          <option value="HELPFUL">Полезно</option>
          <option value="NEUTRAL">Пока нейтрально</option>
          <option value="NOT_FOR_ME">Мне не подошло</option>
        </select>
      </label>
      <label className="block text-sm">
        Заметка только для себя, необязательно
        <textarea
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="app-input mt-2 w-full"
          rows={3}
        />
      </label>
      <p className="app-muted text-sm">
        Партнёр увидит только факт выполнения. Ответы и заметка остаются
        личными. Любое впечатление даёт одинаковую награду; отказ и пропуск не
        штрафуются.
      </p>
      <button disabled={busy} className="app-btn-primary px-4 py-3">
        {busy ? "Сохраняем…" : "Сохранить результат"}
      </button>
      </fieldset>
    </form>
  );
}

export default function DevelopmentPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const flow = useDevelopment(searchParams.get("run"));
  const highlightedKey = searchParams.get("content");
  const highlightedProgram = searchParams.get("program");
  const pair = usePair();
  const pairId = pair.pairId;
  const pairAccessLost = Boolean(pair.error && [401, 403, 404].includes(pair.error.status));
  const pairActive = !pairAccessLost && pair.pairMe?.pair?.status === "active";
  const domain = searchParams.get("area") ?? "all";
  const kind = searchParams.get("format") ?? "all";
  const highlightedCard = flow.overview?.content.find((card) => card.key === highlightedKey);
  const audience: DevelopmentAudience = searchParams.get("scope") === "together" || (!searchParams.has("scope") && highlightedCard && isTogetherDevelopment(highlightedCard.kind)) ? "together" : "personal";
  const detailUnavailable = pair.error?.status === 401 || Boolean(flow.detail?.run.pairId && (pairAccessLost || pair.pairMe?.pair?.status === "ended" || (pair.pairMe && flow.detail.run.pairId !== pair.pairMe.pair?.id)));
  const detail = detailUnavailable ? null : flow.detail;
  const runs = flow.overview ? resumableDevelopmentRuns({ ...flow.overview, recent: flow.unfinishedRuns }, pairAccessLost ? null : pairId, pair.pairMe?.pair?.status) : [];
  const completedRuns = flow.overview ? recentCompletedDevelopmentRuns(flow.overview, pairAccessLost ? null : pairId, pair.pairMe?.pair?.status) : [];
  const libraryHref = (changes: Record<string, string | null>) => developmentLibraryHref(searchParams.toString(), changes);
  const close = () => { if (!confirmAppNavigation()) return; flow.close(); router.replace(`${libraryHref({ run: null })}${highlightedProgram ? "#programs" : ""}`, { scroll: false }); };
  const start = async (key: string, selectedPairId?: string) => {
    const saved = runs.find((run) => run.contentKey === key && run.pairId === (selectedPairId ?? null));
    const next = saved ? await flow.open(saved.id) : await flow.start(key, selectedPairId);
    if (next) router.replace(libraryHref({ run: next.run.id }), { scroll: false });
  };
  const refresh = async () => { await Promise.all([flow.refresh(), pair.refetch()]); };
  useRefreshOnReturn(refresh, !flow.busy && (!detail || detail.run.myCompletion));
  const renderRun = (run: (typeof runs)[number]) => <div key={run.id} className="app-panel-soft p-3">
    <Link className="inline-block py-2 font-medium underline" href={libraryHref({ run: run.id })}>{flow.overview?.content.find((card) => card.key === run.contentKey)?.title ?? "Сохранённое занятие"}</Link>
    <p className="app-muted mt-1 text-sm">{run.periodKey === "once" ? "Одноразовая анкета" : <>Неделя с <time dateTime={run.periodKey}>{run.periodKey}</time> (UTC)</>} · {run.pairId ? "Совместное" : "Личное"} занятие</p>
    <p className="app-muted mt-1 text-sm">{developmentRunStatus(run, pair.pairMe?.pair?.status === "paused")}</p>
  </div>;
  return (
    <main className="app-shell py-5">
      <nav className="mb-5 flex flex-wrap gap-3">
        <Link href="/main-menu" className="app-btn-secondary px-3 py-2">
          На главную
        </Link>
        <Link href="/profile" className="app-btn-secondary px-3 py-2">
          Мои наблюдения
        </Link>
        <Link href="/store" className="app-btn-secondary px-3 py-2">
          Монеты и магазин
        </Link>
      </nav>
      <section className="app-panel app-panel-solid p-5">
        <h1 className="text-2xl font-semibold">Библиотека</h1>
        <p className="app-muted mt-2">
          Шесть областей, личный темп и посильный следующий шаг. Это
          демонстрационные материалы для саморефлексии; они не являются
          психологическими тестами с подтверждённой валидностью.
        </p>
        <p className="app-muted mt-2 text-sm">
          Количество прохождений показывает опыт занятий, а не уровень личности.
          Результаты не меняют подбор партнёров автоматически.
        </p>
      </section>
      {!detail && <nav aria-label="Разделы библиотеки" className="mt-4 flex flex-wrap gap-2"><a href="#unfinished" className="app-btn-secondary px-3 py-2">Продолжить</a><a href="#completed" className="app-btn-secondary px-3 py-2">Недавние результаты</a><a href="#catalog" className="app-btn-secondary px-3 py-2">Выбрать занятие</a><a href="#programs" className="app-btn-secondary px-3 py-2">Программы</a><Link href="/questionnaires" className="app-btn-secondary px-3 py-2">Все анкеты</Link></nav>}
      {flow.error && (
        <div className="mt-4">
          <ErrorView error={flow.error} onRetry={() => void refresh()} />
        </div>
      )}
      {detailUnavailable && <div className="app-alert mt-4 p-4" role="status"><p>Это прохождение сейчас недоступно. Защищённые ответы и действия скрыты.</p><button className="app-btn-secondary mt-3 px-3 py-2" disabled={flow.busy} onClick={() => void refresh()}>Проверить доступ</button></div>}
      {flow.runsError && <div className="mt-4"><ErrorView error={flow.runsError} onRetry={() => void (flow.hasMoreRuns ? flow.loadMoreRuns() : flow.reload())} /></div>}
      {flow.loading && (
        <p role="status" className="mt-4">
          Загружаем библиотеку…
        </p>
      )}
      {detail ? (
        <section className="app-panel app-panel-solid mt-5 p-5">
          <button
            className="app-btn-secondary mb-4 px-3 py-2"
            disabled={flow.busy}
            onClick={close}
          >
            Назад к библиотеке
          </button>
          <p className="app-muted text-sm">
            {KIND_LABELS[detail.content.kind]} ·{" "}
            {detail.content.durationMinutes} мин
          </p>
          <h2 className="mt-2 text-xl font-semibold">{detail.content.title}</h2>
          <p className="app-panel-soft mt-3 p-3 text-sm" role="status">{developmentRunStatus(detail.run, pair.pairMe?.pair?.status === "paused")}</p>
          <p className="mt-3">{detail.content.purpose}</p>
          <p className="app-muted mt-3 text-sm">{detail.content.conditions}</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5">
            {detail.content.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {detail.run.myCompletion ? (
            <div className="mt-5">
              <h3 className="font-semibold">Ваш результат сохранён</h3>
              <p className="mt-2">
                {detail.run.status === "PARTIAL"
                  ? "Первый участник завершил занятие. Общий итог появится после отметки второго."
                  : "Прохождение завершено. Повторная отправка не создаёт новую награду."}
              </p>
              {detail.ownResult?.answers.map((answer) => (
                <p className="app-muted mt-2 text-sm" key={answer.question}>
                  {detail.content.prompts[answer.question]} —{" "}
                  {answer.value === null
                    ? "пропущено"
                    : detail.responseOptions[answer.value]}
                </p>
              ))}
              {detail.ownResult?.privateNote && (
                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white/50 p-3">
                  {detail.ownResult.privateNote}
                </p>
              )}
              <p className="app-muted mt-3 text-sm">
                {detail.content.kind === "REFLECTION"
                  ? "Эта анкета проходится один раз. Сохранённый результат доступен при повторном открытии. Можно выбрать практику в этой области."
                  : "Можно выбрать практику в этой области. Следующее независимое прохождение доступно с новой календарной недели UTC."}
              </p>
              <button className="app-btn-primary mt-3 px-3 py-2" onClick={close}>Выбрать следующий шаг</button>
              {detail.run.pairId && (
                <button
                  className="app-btn-secondary mt-3 px-3 py-2"
                  disabled={flow.busy}
                  onClick={() => void refresh()}
                >
                  Обновить общий итог
                </button>
              )}
            </div>
          ) : detail.run.pairId && !pairActive ? (
            <div className="mt-4"><p className="app-muted text-sm">{pair.loading ? "Проверяем доступ пары…" : "Совместное прохождение доступно действующей паре. Личные занятия можно продолжать отдельно."}</p><Link href={`/pair/${encodeURIComponent(detail.run.pairId)}`} className="mt-3 inline-block underline">Проверить состояние пары</Link></div>
          ) : (
            <CompletionForm
              key={detail.run.id}
              detail={detail}
              busy={flow.busy}
              onComplete={flow.complete}
            />
          )}
        </section>
      ) : (
        pair.error?.status !== 401 && flow.overview && (
          <>
            <section id="unfinished" className="app-panel app-panel-solid mt-5 p-5">
              <h2 className="text-lg font-semibold">Продолжить начатое</h2>
              <p className="app-muted mt-2 text-sm">Занятие можно открыть после перезагрузки. Неотправленные ответы и заметки в браузере не сохраняются.</p>
              <button className="app-btn-secondary mt-3 px-3 py-2" disabled={flow.loading || flow.runsLoading || flow.busy} onClick={() => void refresh()}>Обновить список</button>
              {flow.runsNotice && <p className="app-muted mt-3 text-sm" role="status">{flow.runsNotice}</p>}
              {!flow.loading && runs.length === 0 && <p className="app-muted mt-3 text-sm">Незавершённых занятий пока нет. Можно выбрать новое занятие ниже.</p>}
              <div className="mt-3 space-y-3">{runs.slice(0, 3).map(renderRun)}</div>
              {(runs.length > 3 || flow.hasMoreRuns) && <details className="mt-3"><summary className="cursor-pointer py-3 font-medium">Все начатые занятия ({runs.length}{flow.hasMoreRuns ? "+" : ""})</summary>
                <div className="mt-2 space-y-3">{runs.slice(3).map(renderRun)}</div>
                {flow.hasMoreRuns && <button className="app-btn-secondary mt-4 px-4 py-3" disabled={flow.loading || flow.runsLoading || flow.busy} onClick={() => void flow.loadMoreRuns()}>{flow.runsLoading ? "Загружаем…" : "Показать ещё"}</button>}
              </details>}
              <p className="app-muted mt-3 text-sm" role="status">{flow.runsLoading ? "Загружаем следующую страницу занятий…" : runs.length > 0 ? `Загружено занятий: ${runs.length}${flow.hasMoreRuns ? ". Более ранние занятия доступны по кнопке «Показать ещё» в полном списке." : ". Все доступные незавершённые занятия загружены."}` : ""}</p>
            </section>
            <section id="completed" className="app-panel app-panel-solid mt-5 p-5">
              <h2 className="text-lg font-semibold">Недавние завершённые занятия</h2>
              <p className="app-muted mt-2 text-sm">Показаны до 30 недавних завершённых занятий. Полный архив более ранних результатов пока недоступен.</p>
              {!flow.loading && completedRuns.length === 0 && <p className="app-muted mt-3 text-sm">Нет доступных недавних результатов. Сохранённые ответы незавершённого совместного занятия можно открыть в разделе «Продолжить начатое».</p>}
              <div className="mt-3 space-y-3">{completedRuns.slice(0, 3).map(renderRun)}</div>
              {completedRuns.length > 3 && <details className="mt-3"><summary className="cursor-pointer py-3 font-medium">Ещё недавние результаты ({completedRuns.length - 3})</summary><div className="mt-2 space-y-3">{completedRuns.slice(3).map(renderRun)}</div></details>}
            </section>
            <DevelopmentCatalog overview={flow.overview} audience={audience} domain={domain} kind={kind} highlightedKey={highlightedKey} highlightedProgram={highlightedProgram} pairId={pairId} pairActive={pairActive} pairLoading={pair.loading} busy={flow.busy} onStart={start} onFilter={(changes) => router.replace(libraryHref(changes), { scroll: false })} />
          </>
        )
      )}
    </main>
  );
}
