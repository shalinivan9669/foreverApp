"use client";

import { useState } from "react";
import type { MatchPublicCardDTO } from "@/client/api/match.api";
import type { MatchingAnswers, MatchingStatementReaction, MatchingStatementSection } from "@/lib/contracts/matchingProduct";

type Props = {
  questions: MatchingAnswers;
  card?: MatchPublicCardDTO;
  loading: boolean;
  mode?: "create" | "respond";
  onSubmit: (input: { agreements: [true, true, true]; answers: MatchingAnswers; reactions: MatchingStatementReaction[] }) => Promise<boolean>;
};
const sections: Array<{ key: MatchingStatementSection; label: string }> = [
  { key: "give", label: "Что человек готов дать" },
  { key: "requirements", label: "Чего человек ожидает" },
  { key: "boundaries", label: "Чего человек не принимает" },
];
const choices = [{ value: "AGREE", label: "Согласен" }, { value: "NEUTRAL", label: "Нейтрально" }, { value: "AGAINST", label: "Против" }] as const;
const promises = ["Я отвечаю искренне и уважительно.", "Я понимаю, что интерес не обязывает другого человека отвечать.", "Я не буду передавать личные ответы другим без согласия."];

export default function LikeComposer({ questions, card, loading, mode = "create", onSubmit }: Props) {
  const [answers, setAnswers] = useState<MatchingAnswers>(() => questions.map(() => "") as MatchingAnswers);
  const [reactions, setReactions] = useState<MatchingStatementReaction[]>([]);
  const [agreements, setAgreements] = useState([false, false, false]);
  const [submitted, setSubmitted] = useState(false);
  const statements = card ? sections.flatMap(({ key, label }) => (card[key] ?? []).map((text, index) => ({ section: key, label, text, index }))) : [];
  const dealbreakerConflict = reactions.some((item) => item.section === "boundaries" && item.reaction === "AGAINST" && card?.boundaryDealbreakers?.[item.index]);
  const ready = agreements.every(Boolean) && answers.every((answer) => answer.trim().length > 0) && (statements.length === 0 || reactions.length === statements.length) && !dealbreakerConflict;
  const updateReaction = (section: MatchingStatementSection, index: number, patch: Partial<MatchingStatementReaction>) => {
    setReactions((current) => {
      const existing = current.find((item) => item.section === section && item.index === index);
      if (!existing && !patch.reaction) return current;
      return [...current.filter((item) => item.section !== section || item.index !== index), { section, index, reaction: existing?.reaction ?? "NEUTRAL", ...existing, ...patch }].sort((a, b) => `${a.section}:${a.index}`.localeCompare(`${b.section}:${b.index}`));
    });
  };
  if (submitted) return <p className="app-panel-soft p-4" role="status">{mode === "respond" ? "Знакомство началось. Откройте темы и готовность ниже." : "Интерес отправлен. Его можно отозвать до ответа; срок ожидания — семь дней."}</p>;
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (ready && !loading) void onSubmit({ agreements: [true, true, true], answers: answers.map((answer) => answer.trim()) as MatchingAnswers, reactions }).then(setSubmitted); }}>
    {statements.length > 0 && <fieldset className="space-y-3"><legend className="font-semibold">Ваша реакция на конкретные пункты</legend>{statements.map(({ section, index, text, label }) => {
      const reaction = reactions.find((item) => item.section === section && item.index === index);
      return <div className="app-panel-soft p-3" key={`${section}:${index}`}><p className="app-muted text-xs">{label}{section === "boundaries" && card?.boundaryDealbreakers?.[index] ? " · непреодолимая граница" : ""}</p><p className="mt-1">{text}</p><div className="mt-2 flex flex-wrap gap-3">{choices.map((choice) => <label className="flex gap-1 text-sm" key={choice.value}><input type="radio" name={`${section}:${index}`} checked={reaction?.reaction === choice.value} onChange={() => updateReaction(section, index, { reaction: choice.value })} />{choice.label}</label>)}</div>{reaction && <input className="mt-2" aria-label={`Пояснение к пункту ${text}`} placeholder="Пояснение по желанию" maxLength={280} value={reaction.note ?? ""} onChange={(event) => updateReaction(section, index, { note: event.target.value })} />}</div>;
    })}</fieldset>}
    {dealbreakerConflict && <p role="alert">Есть несовпадение с явно обозначенной непреодолимой границей. Отправка недоступна.</p>}
    <h3 className="text-lg font-semibold">Ответьте на вопросы</h3>
    <p className="app-muted text-sm">Эти ответы и реакции увидит только этот человек сразу после отправки. {mode === "respond" ? "Отправляя ответ, вы соглашаетесь начать знакомство. Пара создаётся отдельным согласием обоих." : "Знакомство начнётся, если получатель ответит и примет интерес."}</p>
    {questions.map((question, index) => <label className="block" key={index}><span className="text-sm font-medium">{question}</span><textarea className="mt-2 min-h-24 w-full p-3" maxLength={280} required value={answers[index]} onChange={(event) => { const next = [...answers] as MatchingAnswers; next[index] = event.target.value; setAnswers(next); }} /></label>)}
    <fieldset className="space-y-2"><legend className="font-semibold">Перед отправкой</legend>{promises.map((copy, index) => <label className="flex items-start gap-2 text-sm" key={copy}><input type="checkbox" checked={agreements[index]} onChange={(event) => setAgreements((current) => current.map((value, i) => i === index ? event.target.checked : value))} /><span>{copy}</span></label>)}</fieldset>
    <button className="app-btn-primary w-full" type="submit" disabled={!ready || loading}>{loading ? "Отправляем…" : mode === "respond" ? "Ответить и начать знакомство" : "Отправить интерес"}</button>
  </form>;
}
