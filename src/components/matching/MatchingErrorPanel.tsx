"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRecheckMatchingAccess } from "./MatchingAccessGate";
import type { UiErrorState } from "@/client/api/errors";

type MatchingErrorPanelProps = {
  error: UiErrorState | null;
  onRetry?: () => void;
};

const copyForError = (error: UiErrorState): { title: string; body: string } => {
  if (error.code === "MATCHING_CONNECTION_LIMIT") return { title: "Три знакомства уже открыты", body: "Пауза тоже занимает место. Завершите одно из знакомств, чтобы принять новый интерес." };
  if (error.code === "MATCHING_LOCATION_REQUIRED") return { title: "Нужен город для поиска", body: "Выберите город в профиле входа. Личное развитие доступно и без поиска." };
  if (error.code === "MATCHING_SOLO_REQUIRED") return { title: "Доступность знакомств изменилась", body: "Поиск новых партнёров недоступен, если вы указали отношения или у вас есть активная либо приостановленная пара. Проверяем текущий маршрут." };
  if (error.code === "MATCHING_DEALBREAKER_CONFLICT") return { title: "Несовпадение с границей", body: "Вы выбрали «против» для явно обозначенной непреодолимой границы." };
  if (error.kind === "auth_required") {
    return {
      title: "Нужно войти снова",
      body: "Откройте приложение из Discord и повторите действие.",
    };
  }
  if (error.kind === "rate_limited") {
    return {
      title: "Слишком много запросов",
      body: "Подождите немного перед следующей попыткой.",
    };
  }
  if (error.kind === "state_conflict") {
    return {
      title: "Состояние уже изменилось",
      body: "Обновите данные — возможно, другой участник уже ответил.",
    };
  }
  if (error.kind === "access_denied" || error.kind === "not_found") {
    return {
      title: "Данные недоступны",
      body: "Ссылка могла устареть или доступ к этому знакомству закрыт.",
    };
  }
  if (error.kind === "validation") {
    return {
      title: "Проверьте заполнение",
      body: "Исправьте отмеченные данные и отправьте форму ещё раз.",
    };
  }
  return {
    title: "Не удалось загрузить данные",
    body: "Проверьте соединение и попробуйте ещё раз.",
  };
};

export default function MatchingErrorPanel({
  error,
  onRetry,
}: MatchingErrorPanelProps) {
  const recheck = useRecheckMatchingAccess();
  const code = error?.code;
  useEffect(() => {
    if (code === "MATCHING_SOLO_REQUIRED" && recheck) void recheck();
  }, [code, recheck]);
  if (!error) return null;
  const copy = copyForError(error);
  return (
    <div className="app-alert app-alert-error" role="alert">
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      <p className="mt-1 text-sm">{copy.body}</p>
      {error.code === "MATCHING_LOCATION_REQUIRED" && <Link className="app-btn-secondary mt-3" href="/entry?intent=matching">Указать город для поиска</Link>}
      {error.code === "MATCHING_SOLO_REQUIRED" && <Link className="app-btn-secondary mt-3" href="/main-menu">Вернуться к своему маршруту</Link>}
      {error.kind === "auth_required" && <Link className="app-btn-secondary mt-3" href="/">Войти снова</Link>}
      {onRetry && (
        <button
          className="app-btn-secondary mt-3"
          type="button"
          onClick={onRetry}
        >
          Повторить
        </button>
      )}
    </div>
  );
}
