import type { UiErrorState } from "@/client/api/errors";

type MatchingErrorPanelProps = {
  error: UiErrorState | null;
  onRetry?: () => void;
};

const copyForError = (error: UiErrorState): { title: string; body: string } => {
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
  if (!error) return null;
  const copy = copyForError(error);
  return (
    <div className="app-alert app-alert-error" role="alert">
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      <p className="mt-1 text-sm">{copy.body}</p>
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
