"use client";

import { useMemo, useState } from "react";

type LikeComposerProps = {
  questions: [string, string];
  loading: boolean;
  mode?: "create" | "respond";
  onSubmit: (input: {
    agreements: [true, true, true];
    answers: [string, string];
  }) => Promise<boolean>;
};

const agreementCopy = [
  "Я отвечаю искренне и уважительно.",
  "Я понимаю, что интерес не обязывает другого человека отвечать.",
  "Я не буду переносить личные ответы за пределы знакомства без согласия.",
] as const;

export default function LikeComposer({
  questions,
  loading,
  mode = "create",
  onSubmit,
}: LikeComposerProps) {
  const [answers, setAnswers] = useState<[string, string]>(["", ""]);
  const [agreements, setAgreements] = useState<[boolean, boolean, boolean]>([
    false,
    false,
    false,
  ]);
  const [submitted, setSubmitted] = useState(false);

  const ready = useMemo(
    () =>
      agreements.every(Boolean) &&
      answers.every(
        (answer) => answer.trim().length > 0 && answer.length <= 280,
      ),
    [agreements, answers],
  );

  if (submitted) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
        role="status"
      >
        <h3 className="font-semibold">
          {mode === "respond" ? "Ответ отправлен" : "Интерес отправлен"}
        </h3>
        <p className="mt-1 text-sm">
          {mode === "respond"
            ? "Теперь инициатор сможет принять ответ или вежливо отказаться."
            : "Ответ появится во вкладке исходящих."}
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || loading) return;
        void onSubmit({
          agreements: [true, true, true],
          answers: [answers[0].trim(), answers[1].trim()],
        }).then(setSubmitted);
      }}
    >
      <div>
        <h3 className="text-lg font-semibold">Ответьте на вопросы</h3>
        <p className="app-muted mt-1 text-sm">
          Ответы увидит только этот человек после отправки интереса.
        </p>
      </div>

      {questions.map((question, index) => (
        <label className="block" key={question}>
          <span className="text-sm font-medium">{question}</span>
          <textarea
            className="mt-2 min-h-24 w-full p-3"
            maxLength={280}
            required
            value={answers[index]}
            onChange={(event) => {
              const next: [string, string] = [...answers];
              next[index] = event.target.value;
              setAnswers(next);
            }}
          />
          <span className="app-muted mt-1 block text-right text-xs">
            {answers[index].length} / 280
          </span>
        </label>
      ))}

      <fieldset className="space-y-2">
        <legend className="font-semibold">Перед отправкой</legend>
        {agreementCopy.map((copy, index) => (
          <label className="flex items-start gap-2 text-sm" key={copy}>
            <input
              className="mt-1"
              type="checkbox"
              checked={agreements[index]}
              onChange={(event) => {
                const next: [boolean, boolean, boolean] = [...agreements];
                next[index] = event.target.checked;
                setAgreements(next);
              }}
            />
            <span>{copy}</span>
          </label>
        ))}
      </fieldset>

      <button
        className="app-btn-primary w-full"
        type="submit"
        disabled={!ready || loading}
      >
        {loading
          ? "Отправляем…"
          : mode === "respond"
            ? "Отправить ответ"
            : "Отправить интерес"}
      </button>
    </form>
  );
}
