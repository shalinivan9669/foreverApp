"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { MatchPublicCardDTO } from "@/client/api/match.api";
import { createIdempotencyKey } from "@/client/api/idempotency";
import { useUnsavedChanges } from "@/client/hooks/useUnsavedChanges";
import { matchingComposerReadiness } from "@/client/viewmodels/matchingComposer";
import type { MatchingAnswers, MatchingStatementReaction, MatchingStatementSection } from "@/lib/contracts/matchingProduct";

type Props = {
  questions: MatchingAnswers;
  card?: MatchPublicCardDTO;
  loading: boolean;
  mode?: "create" | "respond";
  onSubmit: (input: { agreements: [true, true, true]; answers: MatchingAnswers; reactions: MatchingStatementReaction[] }, idempotencyKey?: string) => Promise<boolean>;
};
const labels = { give: "Что человек готов дать", requirements: "Чего человек ожидает", boundaries: "Чего человек не принимает" };
const choices = [{ value: "AGREE", label: "Согласен" }, { value: "NEUTRAL", label: "Нейтрально" }, { value: "AGAINST", label: "Против" }] as const;
const promises = ["Я отвечаю искренне и уважительно.", "Я понимаю, что интерес не обязывает другого человека отвечать.", "Я не буду передавать личные ответы другим без согласия."];
type Step = "intro" | "reactions" | "questions" | "review";

export default function LikeComposer({ questions, card, loading, mode = "create", onSubmit }: Props) {
  const [answers, setAnswers] = useState<MatchingAnswers>(() => questions.map(() => "") as MatchingAnswers);
  const [reactions, setReactions] = useState<MatchingStatementReaction[]>([]);
  const [agreements, setAgreements] = useState([false, false, false]);
  const [step, setStep] = useState<Step>("intro");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const pendingRef = useRef(false);
  const attemptRef = useRef<{ signature: string; key: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const readiness = matchingComposerReadiness(card, answers, reactions, agreements);
  const pending = loading || submitting;
  useUnsavedChanges(!submitted && (answers.some(Boolean) || reactions.length > 0 || agreements.some(Boolean)), submitting);
  useEffect(() => { if (step !== "intro" || submitted) heading.current?.focus(); }, [step, submitted]);
  const updateReaction = (section: MatchingStatementSection, index: number, patch: Partial<MatchingStatementReaction>) => {
    setReactions((current) => {
      const existing = current.find((item) => item.section === section && item.index === index);
      if (!existing && !patch.reaction) return current;
      return [...current.filter((item) => item.section !== section || item.index !== index), { section, index, reaction: existing?.reaction ?? "NEUTRAL", ...existing, ...patch }].sort((a, b) => (a.section + a.index).localeCompare(b.section + b.index));
    });
  };
  const submit = async () => {
    if (!readiness.ready || pending || pendingRef.current) return;
    pendingRef.current = true;
    setSubmitting(true);
    setSubmitError(false);
    const input = { agreements: [true, true, true] as [true, true, true], answers: answers.map((answer) => answer.trim()) as MatchingAnswers, reactions };
    const signature = JSON.stringify(input);
    if (attemptRef.current?.signature !== signature) attemptRef.current = { signature, key: createIdempotencyKey() };
    try {
      const saved = await onSubmit(input, attemptRef.current.key);
      setSubmitted(saved);
      setSubmitError(!saved);
      if (saved) attemptRef.current = null;
    } catch { setSubmitError(true); }
    finally { pendingRef.current = false; setSubmitting(false); }
  };
  if (submitted) return <section className="app-panel-soft p-4" role="status"><h3 ref={heading} tabIndex={-1} className="font-semibold">{mode === "respond" ? "Знакомство началось" : "Интерес отправлен"}</h3><p className="mt-2 text-sm">{mode === "respond" ? "Откройте темы и готовность ниже. Создание пары требует отдельного согласия обоих." : "Его можно отозвать до ответа; срок ожидания — семь дней. Продолжение появится во входящих."}</p></section>;
  return <section className="min-w-0 space-y-4" aria-label="Ваш ответ человеку">
    <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">{step === "intro" ? "Хотите начать знакомство?" : step === "reactions" ? "1. Ваша реакция на конкретные пункты" : step === "questions" ? "2. Ответьте на вопросы" : "3. Проверьте перед отправкой"}</h3>
    <p className="app-muted text-sm">Эти ответы и реакции увидит только этот человек сразу после отправки. {mode === "respond" ? "Отправляя ответ, вы соглашаетесь начать знакомство. Пара создаётся отдельным согласием обоих." : "Знакомство начнётся, если получатель ответит и примет интерес."}</p>
    {step === "intro" ? <><p className="text-sm">Отметьте реакции, ответьте на вопросы и проверьте всё перед отправкой. Интерес не обязывает другого человека отвечать.</p><button type="button" className="app-btn-primary w-full" disabled={loading} onClick={() => setStep(readiness.statements.length ? "reactions" : "questions")}>{mode === "respond" ? "Подготовить ответ" : "Начать ответ"}</button></> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (step === "review") void submit(); }}>
      <ol className="grid grid-cols-3 gap-2 text-sm" aria-label="Шаги ответа">{([["reactions", "Реакции"], ["questions", "Вопросы"], ["review", "Проверка"]] as const).map(([key, title]) => <li key={key} aria-current={step === key ? "step" : undefined} className={step === key ? "rounded-lg border border-rose-500 bg-rose-50 p-2 font-semibold" : "rounded-lg border border-slate-200 p-2"}>{title}</li>)}</ol>
      <p className="app-muted text-xs">Черновик остаётся в памяти этого экрана. До отправки человек его не видит.</p>
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        {step === "reactions" && <>
          <p className="text-sm" role="status">Отмечено {readiness.reacted} из {readiness.statements.length}. Для продолжения нужна реакция на каждый пункт.</p>
          {readiness.statements.map(({ section, index, text }) => { const reaction = reactions.find((item) => item.section === section && item.index === index); return <fieldset className="app-panel-soft min-w-0 p-3" key={section + index}><legend className="text-sm font-semibold">{labels[section]} · {index + 1}</legend><p>{text}</p>{section === "boundaries" && card?.boundaryDealbreakers?.[index] && <p className="mt-1 text-sm font-semibold">Непреодолимая граница</p>}<div className="mt-2 flex flex-wrap gap-2">{choices.map((choice) => <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-2 text-sm" key={choice.value}><input type="radio" name={id + section + index} checked={reaction?.reaction === choice.value} onChange={() => updateReaction(section, index, { reaction: choice.value })} />{choice.label}</label>)}</div>{reaction && <label className="mt-3 grid gap-1 text-sm">Пояснение по желанию<input className="min-w-0 w-full p-3" maxLength={280} value={reaction.note ?? ""} onChange={(event) => updateReaction(section, index, { note: event.target.value })} /></label>}</fieldset>; })}
          {readiness.conflict && <p role="alert" className="app-alert app-alert-error">Есть несовпадение с явно обозначенной непреодолимой границей. Отправка недоступна. Не меняйте искренний ответ ради продолжения.</p>}
          <button className="app-btn-primary w-full" type="button" disabled={!readiness.reactionsReady} onClick={() => setStep("questions")}>К обязательным вопросам</button>
        </>}
        {step === "questions" && <>
          <p className="text-sm" role="status">Заполнено {readiness.answered} из {questions.length}. Все вопросы обязательны.</p>
          {questions.map((question, index) => <label className="block" key={id + ":question:" + index}><span className="text-sm font-medium">{index + 1}. {question}</span><textarea className="mt-2 min-h-28 w-full p-3" maxLength={280} required value={answers[index]} onChange={(event) => { const next = [...answers] as MatchingAnswers; next[index] = event.target.value; setAnswers(next); }} /><span className="app-muted text-xs">{answers[index].length}/280</span></label>)}
          <div className="flex flex-wrap gap-2">{readiness.statements.length > 0 && <button className="app-btn-secondary" type="button" onClick={() => setStep("reactions")}>Назад к реакциям</button>}<button className="app-btn-primary" type="button" disabled={!readiness.answersReady} onClick={() => setStep("review")}>Проверить ответ</button></div>
        </>}
        {step === "review" && <>
          <section className="space-y-3" aria-label="Проверка вашего ответа">{readiness.statements.length > 0 && <details className="app-panel-soft p-3"><summary className="cursor-pointer font-semibold">Реакции: {readiness.reacted} из {readiness.statements.length}</summary><ul className="mt-3 space-y-3">{readiness.statements.map(({ section, index, text }) => { const reaction = reactions.find((item) => item.section === section && item.index === index); return <li key={section + index}><p>{text}</p><strong>{choices.find((choice) => choice.value === reaction?.reaction)?.label}</strong>{reaction?.note && <p className="whitespace-pre-wrap break-words">{reaction.note}</p>}</li>; })}</ul></details>}{questions.map((question, index) => <div className="app-panel-soft p-3" key={id + ":review:" + index}><p className="font-semibold">{question}</p><p className="mt-2 whitespace-pre-wrap break-words">{answers[index]}</p></div>)}</section>
          <fieldset className="space-y-2"><legend className="font-semibold">Ваши подтверждения</legend>{promises.map((copy, index) => <label className="flex min-h-11 items-start gap-3 py-2 text-sm" key={copy}><input className="mt-1" type="checkbox" checked={agreements[index]} onChange={(event) => setAgreements((current) => current.map((value, i) => i === index ? event.target.checked : value))} /><span>{copy}</span></label>)}</fieldset>
          {!agreements.every(Boolean) && <p className="app-muted text-sm">Для отправки прочитайте и отметьте все три подтверждения.</p>}
          <button className="app-btn-secondary" type="button" onClick={() => setStep("questions")}>Изменить ответы</button>
          <button className="app-btn-primary w-full" type="submit" disabled={!readiness.ready || pending}>{pending ? "Отправляем…" : submitError ? "Повторить отправку" : mode === "respond" ? "Ответить и начать знакомство" : "Отправить интерес"}</button>
        </>}
      </fieldset>
      {submitError && <p className="app-alert app-alert-error" role="alert">Не удалось подтвердить отправку. Черновик сохранён на этом экране. Можно повторить отправку.</p>}
    </form>}
  </section>;
}
