"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { usePair } from "@/client/hooks/usePair";
import { useDevelopment } from "@/client/hooks/useDevelopment";
import { useRefreshOnReturn } from "@/client/hooks/useRefreshOnReturn";
import { developmentRunHref, developmentRunStatus, isTogetherDevelopment, nextDevelopmentProgramStep, resumableDevelopmentRuns } from "@/client/viewmodels/development.viewmodels";
import type {
  DevelopmentCompleteInput,
  DevelopmentDetailDTO,
} from "@/lib/dto/development.dto";
import ErrorView from "@/components/ui/ErrorView";

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
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
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
  const pairActive = pair.pairMe?.pair?.status === "active";
  const [domain, setDomain] = useState("all");
  const [kind, setKind] = useState("all");
  const detail = flow.detail;
  const runs = flow.overview ? resumableDevelopmentRuns({ ...flow.overview, recent: flow.unfinishedRuns }, pairId, pair.pairMe?.pair?.status) : [];
  const close = () => { flow.close(); router.replace("/development", { scroll: false }); };
  const start = async (key: string, selectedPairId?: string) => {
    const saved = runs.find((run) => run.contentKey === key && run.pairId === (selectedPairId ?? null));
    const next = saved ? await flow.open(saved.id) : await flow.start(key, selectedPairId);
    if (next) router.replace(developmentRunHref(next.run.id), { scroll: false });
  };
  const refresh = async () => { await Promise.all([flow.refresh(), pair.refetch()]); };
  useRefreshOnReturn(refresh, !flow.busy && (!detail || detail.run.myCompletion));
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
        <h1 className="text-2xl font-semibold">Развитие и время вместе</h1>
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
      {flow.error && (
        <div className="mt-4">
          <ErrorView error={flow.error} onRetry={() => void refresh()} />
        </div>
      )}
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
                Можно выбрать практику в этой области. Следующее независимое
                прохождение доступно с новой календарной недели UTC.
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
        flow.overview && (
          <>
            <section id="unfinished" className="app-panel app-panel-solid mt-5 p-5">
              <h2 className="text-lg font-semibold">Незавершённые занятия</h2>
              <p className="app-muted mt-2 text-sm">Занятие можно открыть после перезагрузки. Неотправленные ответы и заметки в браузере не сохраняются.</p>
              <button className="app-btn-secondary mt-3 px-3 py-2" disabled={flow.loading || flow.runsLoading || flow.busy} onClick={() => void refresh()}>Обновить список</button>
              {flow.runsNotice && <p className="app-muted mt-3 text-sm" role="status">{flow.runsNotice}</p>}
              {!flow.loading && runs.length === 0 && <p className="app-muted mt-3 text-sm">Незавершённых занятий пока нет. Можно выбрать новое занятие ниже.</p>}
              <div className="mt-3 space-y-3">{runs.map((run) => <div key={run.id} className="app-panel-soft p-3">
                <Link className="font-medium underline" href={developmentRunHref(run.id)}>{flow.overview!.content.find((card) => card.key === run.contentKey)?.title ?? "Сохранённое занятие"}</Link>
                <p className="app-muted mt-1 text-xs">Неделя с <time dateTime={run.periodKey}>{run.periodKey}</time> (UTC) · {run.pairId ? "Совместное" : "Личное"} занятие</p>
                <p className="app-muted mt-1 text-sm">{developmentRunStatus(run, pair.pairMe?.pair?.status === "paused")}</p>
              </div>)}</div>
              {flow.hasMoreRuns && <button className="app-btn-secondary mt-4 px-4 py-2" disabled={flow.loading || flow.runsLoading || flow.busy} onClick={() => void flow.loadMoreRuns()}>{flow.runsLoading ? "Загружаем…" : "Показать ещё"}</button>}
              <p className="app-muted mt-3 text-sm" role="status">{flow.runsLoading ? "Загружаем следующую страницу занятий…" : runs.length > 0 ? `Показано занятий: ${runs.length}${flow.hasMoreRuns ? ". Более ранние занятия доступны по кнопке «Показать ещё»." : ". Все доступные незавершённые занятия загружены."}` : ""}</p>
            </section>
            <section className="app-panel app-panel-solid mt-5 p-5">
              <p className="app-muted text-xs">Один следующий шаг</p>
              <h2 className="mt-1 text-lg font-semibold">
                {flow.overview.suggestion.title}
              </h2>
              <p className="app-muted mt-2 text-sm">
                {flow.overview.suggestion.reason}
              </p>
              <button
                className="app-btn-primary mt-3 px-4 py-2"
                disabled={flow.busy}
                onClick={() =>
                  void start(flow.overview!.suggestion.contentKey)
                }
              >
                Попробовать
              </button>
            </section>
            <section id="programs" className="mt-5 grid scroll-mt-4 gap-3 sm:grid-cols-3">
              {flow.overview.programs.map((program) => {
                const next = nextDevelopmentProgramStep(program, flow.overview!);
                const nextTogether = next && isTogetherDevelopment(next.kind);
                return (
                <article
                  className={`app-panel app-panel-solid p-4 ${program.key === highlightedProgram ? "ring-2 ring-rose-400" : ""}`}
                  key={program.key}
                >
                  <h2 className="font-semibold">{program.title}</h2>
                  <p className="app-muted mt-2 text-sm">
                    Пройдено шагов: {program.completedSteps} из{" "}
                    {program.contentKeys.length}. Можно идти в своём порядке.
                  </p>
                  {next && <button className="app-btn-primary mt-3 px-3 py-2 text-sm disabled:opacity-40" disabled={flow.busy || next.locked || Boolean(nextTogether && !pairActive)} onClick={() => void start(next.key, nextTogether ? pairId ?? undefined : undefined)}>{nextTogether && !pairActive ? "Следующий шаг — после создания или возобновления пары" : program.completedSteps ? "Продолжить программу" : "Начать программу"}</button>}
                  {!next && <p className="mt-3 text-sm">Программа завершена. Можно выбрать другую область или личную практику.</p>}
                  <div className="mt-3 space-y-2">
                    {program.contentKeys.map((key, i) => {
                      const card = flow.overview!.content.find(
                        (item) => item.key === key,
                      )!;
                      const together = isTogetherDevelopment(card.kind);
                      return (
                        <button
                          key={key}
                          disabled={flow.busy || card.locked || (together && !pairActive)}
                          className="block text-left text-sm underline disabled:opacity-40"
                          onClick={() =>
                            void start(
                              key,
                              together ? (pairId ?? undefined) : undefined,
                            )
                          }
                        >
                          {i + 1}. {card.title}
                          {card.completedCount ? " ✓" : ""}
                          {together && !pairActive ? " · нужна действующая пара" : ""}
                        </button>
                      );
                    })}
                  </div>
                </article>
              ); })}
            </section>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Область
                <select
                  className="app-input mt-1 w-full"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                >
                  <option value="all">Все шесть областей</option>
                  {flow.overview.domains.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Формат
                <select
                  className="app-input mt-1 w-full"
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                >
                  <option value="all">Все форматы</option>
                  {Object.entries(KIND_LABELS).map(([key, title]) => (
                    <option key={key} value={key}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {flow.overview.content
                .filter(
                  (card) =>
                    (domain === "all" || card.domain === domain) &&
                    (kind === "all" || card.kind === kind),
                )
                .map((card) => {
                  const together = isTogetherDevelopment(card.kind);
                  return (
                    <article
                      key={card.key}
                      className={`app-panel app-panel-solid flex flex-col p-4 ${card.key === highlightedKey ? "ring-2 ring-rose-400" : ""}`}
                    >
                      <p className="app-muted text-xs">
                        {KIND_LABELS[card.kind]} · {card.durationMinutes} мин
                      </p>
                      <h2 className="mt-2 font-semibold">{card.title}</h2>
                      <p className="app-muted mt-2 text-sm">{card.purpose}</p>
                      <p className="app-muted mb-4 mt-2 text-xs">
                        Прохождений: {card.completedCount}
                      </p>
                      {card.locked ? (
                        <Link
                          href="/store"
                          className="app-btn-secondary mt-auto px-3 py-2"
                        >
                          Дополнительный материал в магазине
                        </Link>
                      ) : (
                        <button
                          disabled={flow.busy || (together && !pairActive)}
                          className="app-btn-primary mt-auto px-3 py-2 disabled:opacity-40"
                          onClick={() =>
                            void start(
                              card.key,
                              together ? (pairId ?? undefined) : undefined,
                            )
                          }
                        >
                          {together && !pairActive
                            ? "Доступно действующей паре"
                            : "Открыть занятие"}
                        </button>
                      )}
                    </article>
                  );
                })}
            </section>
          </>
        )
      )}
    </main>
  );
}
