"use client";

import { useMemo, useState } from "react";
import type {
  MatchingCardFields,
  SaveMatchingCardRequest,
} from "@/client/api/match.api";

type MatchingCardFormProps = {
  initial: MatchingCardFields | null;
  requiredDataReady: boolean;
  missingRequiredTopics: string[];
  saving: boolean;
  onSave: (input: SaveMatchingCardRequest) => Promise<boolean>;
};

type Intent = MatchingCardFields["actual"]["relationshipIntent"];
type ChildrenIntent = MatchingCardFields["actual"]["childrenIntent"];
type OptionalActualKey =
  | "structurePreference"
  | "socialActivityPreference"
  | "cleaningPreference"
  | "repairSkill"
  | "relationshipPriority";

type FormState = {
  requirements: [string, string, string];
  give: [string, string, string];
  questions: [string, string];
  minAge: string;
  maxAge: string;
  maxDistanceKm: string;
  active: boolean;
  relationshipIntent: Intent | "";
  childrenIntent: ChildrenIntent | "";
  optionalActual: Record<OptionalActualKey, string>;
};

const initialForm = (card: MatchingCardFields | null): FormState => ({
  requirements: card?.requirements ?? ["", "", ""],
  give: card?.give ?? ["", "", ""],
  questions: card?.questions ?? ["", ""],
  minAge: String(card?.ageRange.min ?? 18),
  maxAge: String(card?.ageRange.max ?? 99),
  maxDistanceKm: String(card?.maxDistanceKm ?? 50),
  active: card?.active ?? false,
  relationshipIntent: card?.actual.relationshipIntent ?? "",
  childrenIntent: card?.actual.childrenIntent ?? "",
  optionalActual: {
    structurePreference:
      card?.actual.structurePreference === undefined
        ? ""
        : String(card.actual.structurePreference),
    socialActivityPreference:
      card?.actual.socialActivityPreference === undefined
        ? ""
        : String(card.actual.socialActivityPreference),
    cleaningPreference:
      card?.actual.cleaningPreference === undefined
        ? ""
        : String(card.actual.cleaningPreference),
    repairSkill:
      card?.actual.repairSkill === undefined
        ? ""
        : String(card.actual.repairSkill),
    relationshipPriority:
      card?.actual.relationshipPriority === undefined
        ? ""
        : String(card.actual.relationshipPriority),
  },
});

const signedOptions = [
  { value: "-1", label: "Ближе к первому варианту" },
  { value: "-0.5", label: "Скорее первый вариант" },
  { value: "0", label: "Баланс" },
  { value: "0.5", label: "Скорее второй вариант" },
  { value: "1", label: "Ближе ко второму варианту" },
];

const ratioOptions = [
  { value: "0", label: "Пока нет" },
  { value: "0.25", label: "Скорее редко" },
  { value: "0.5", label: "Иногда" },
  { value: "0.75", label: "Часто" },
  { value: "1", label: "Уверенно да" },
];

export default function MatchingCardForm({
  initial,
  requiredDataReady,
  missingRequiredTopics,
  saving,
  onSave,
}: MatchingCardFormProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(initial));
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const formComplete = useMemo(() => {
    const minAge = Number(form.minAge);
    const maxAge = Number(form.maxAge);
    const distance = Number(form.maxDistanceKm);
    return (
      [...form.requirements, ...form.give, ...form.questions].every(
        (value) => value.trim().length > 0,
      ) &&
      Boolean(form.relationshipIntent) &&
      Boolean(form.childrenIntent) &&
      Number.isInteger(minAge) &&
      Number.isInteger(maxAge) &&
      minAge >= 18 &&
      maxAge <= 99 &&
      minAge <= maxAge &&
      Number.isInteger(distance) &&
      distance >= 1 &&
      distance <= 500
    );
  }, [form]);

  const setTextTuple = (
    key: "requirements" | "give" | "questions",
    index: number,
    value: string,
  ): void => {
    setForm((current) => {
      if (key === "questions") {
        const next: [string, string] = [...current.questions];
        next[index] = value;
        return { ...current, questions: next };
      }
      const next: [string, string, string] = [...current[key]];
      next[index] = value;
      return { ...current, [key]: next };
    });
    setDirty(true);
    setSaved(false);
  };

  const updateOptional = (key: OptionalActualKey, value: string): void => {
    setForm((current) => ({
      ...current,
      optionalActual: { ...current.optionalActual, [key]: value },
    }));
    setDirty(true);
    setSaved(false);
  };

  const submit = async (): Promise<void> => {
    if (!formComplete || !form.relationshipIntent || !form.childrenIntent)
      return;
    const optionalEntries = Object.entries(form.optionalActual)
      .filter((entry): entry is [OptionalActualKey, string] => entry[1] !== "")
      .map(([key, value]) => [key, Number(value)] as const);
    const ok = await onSave({
      requirements: form.requirements.map((item) => item.trim()) as [
        string,
        string,
        string,
      ],
      give: form.give.map((item) => item.trim()) as [string, string, string],
      questions: form.questions.map((item) => item.trim()) as [string, string],
      ageRange: { min: Number(form.minAge), max: Number(form.maxAge) },
      maxDistanceKm: Number(form.maxDistanceKm),
      active: form.active,
      actual: {
        relationshipIntent: form.relationshipIntent,
        childrenIntent: form.childrenIntent,
        ...Object.fromEntries(optionalEntries),
      },
    });
    if (ok) {
      setDirty(false);
      setSaved(true);
    }
  };

  return (
    <section
      className="app-panel p-4 sm:p-6"
      aria-labelledby="matching-card-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="matching-card-title" className="text-xl font-semibold">
            Публичная карточка
          </h2>
          <p className="app-muted mt-1 text-sm">
            Эти формулировки увидят люди в ленте знакомств.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            form.active
              ? "bg-emerald-100 text-emerald-900"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          {form.active ? "Активна" : "На паузе"}
        </span>
      </div>

      <div className="mt-5 grid gap-5">
        <fieldset>
          <legend className="font-semibold">Что для меня важно</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {form.requirements.map((value, index) => (
              <input
                key={index}
                aria-label={`Важное качество ${index + 1}`}
                maxLength={80}
                required
                value={value}
                onChange={(event) =>
                  setTextTuple("requirements", index, event.target.value)
                }
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-semibold">Что я готов(а) дать</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {form.give.map((value, index) => (
              <input
                key={index}
                aria-label={`Мой вклад ${index + 1}`}
                maxLength={80}
                required
                value={value}
                onChange={(event) =>
                  setTextTuple("give", index, event.target.value)
                }
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-semibold">Два вопроса для знакомства</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {form.questions.map((value, index) => (
              <textarea
                className="min-h-24 p-3"
                key={index}
                aria-label={`Вопрос ${index + 1}`}
                maxLength={120}
                required
                value={value}
                onChange={(event) =>
                  setTextTuple("questions", index, event.target.value)
                }
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-semibold">Фильтры поиска</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              Возраст от
              <input
                className="mt-1 w-full"
                type="number"
                min={18}
                max={99}
                value={form.minAge}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    minAge: event.target.value,
                  }));
                  setDirty(true);
                  setSaved(false);
                }}
              />
            </label>
            <label className="text-sm">
              Возраст до
              <input
                className="mt-1 w-full"
                type="number"
                min={18}
                max={99}
                value={form.maxAge}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    maxAge: event.target.value,
                  }));
                  setDirty(true);
                  setSaved(false);
                }}
              />
            </label>
            <label className="text-sm">
              Расстояние, км
              <input
                className="mt-1 w-full"
                type="number"
                min={1}
                max={500}
                value={form.maxDistanceKm}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    maxDistanceKm: event.target.value,
                  }));
                  setDirty(true);
                  setSaved(false);
                }}
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-semibold">О ваших планах</legend>
          <p className="app-muted mt-1 text-sm">
            Эти ответы используются для подбора и не показываются другим
            напрямую.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Формат знакомства
              <select
                className="mt-1 w-full"
                required
                value={form.relationshipIntent}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    relationshipIntent: event.target.value as Intent | "",
                  }));
                  setDirty(true);
                  setSaved(false);
                }}
              >
                <option value="">Выберите осознанно</option>
                <option value="GETTING_TO_KNOW">
                  Хочу сначала познакомиться
                </option>
                <option value="OPEN_TO_RELATIONSHIP">
                  Открыт(а) к отношениям
                </option>
                <option value="LOOKING_FOR_LONG_TERM">
                  Ищу долгосрочные отношения
                </option>
              </select>
            </label>
            <label className="text-sm">
              Отношение к детям
              <select
                className="mt-1 w-full"
                required
                value={form.childrenIntent}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    childrenIntent: event.target.value as ChildrenIntent | "",
                  }));
                  setDirty(true);
                  setSaved(false);
                }}
              >
                <option value="">Выберите осознанно</option>
                <option value="YES">Хочу детей</option>
                <option value="NO">Не планирую детей</option>
                <option value="UNSURE">Пока не уверен(а)</option>
              </select>
            </label>
          </div>
        </fieldset>

        <details className="app-panel-soft p-4">
          <summary className="cursor-pointer font-semibold">
            Дополнительные ответы — по желанию
          </summary>
          <p className="app-muted mt-2 text-sm">
            Не выбранные пункты не отправляются и не считаются вашим ответом.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <OptionalSelect
              label="Спонтанность — планирование"
              value={form.optionalActual.structurePreference}
              options={signedOptions}
              onChange={(value) => updateOptional("structurePreference", value)}
            />
            <OptionalSelect
              label="Тихий досуг — активная социальная жизнь"
              value={form.optionalActual.socialActivityPreference}
              options={signedOptions}
              onChange={(value) =>
                updateOptional("socialActivityPreference", value)
              }
            />
            <OptionalSelect
              label="Готовность брать бытовые задачи"
              value={form.optionalActual.cleaningPreference}
              options={ratioOptions}
              onChange={(value) => updateOptional("cleaningPreference", value)}
            />
            <OptionalSelect
              label="Навык восстанавливать контакт после конфликта"
              value={form.optionalActual.repairSkill}
              options={ratioOptions}
              onChange={(value) => updateOptional("repairSkill", value)}
            />
            <OptionalSelect
              label="Приоритет отношений сейчас"
              value={form.optionalActual.relationshipPriority}
              options={ratioOptions}
              onChange={(value) =>
                updateOptional("relationshipPriority", value)
              }
            />
          </div>
        </details>

        <label className="app-panel-soft flex items-start gap-3 p-4">
          <input
            className="mt-1"
            type="checkbox"
            checked={form.active}
            disabled={!formComplete}
            onChange={(event) => {
              setForm((current) => ({
                ...current,
                active: event.target.checked,
              }));
              setDirty(true);
              setSaved(false);
            }}
          />
          <span>
            <span className="block font-semibold">Показывать меня в ленте</span>
            <span className="app-muted mt-1 block text-sm">
              Активация доступна после заполнения обязательных полей.
            </span>
          </span>
        </label>

        {!requiredDataReady && missingRequiredTopics.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            После сохранения мы перепроверим данные для подбора. Сейчас не
            хватает: {missingRequiredTopics.join(", ")}.
          </div>
        )}

        {saved && (
          <p className="text-sm font-medium text-emerald-700" role="status">
            Карточка сохранена.
          </p>
        )}

        <button
          className="app-btn-primary w-full sm:w-auto"
          type="button"
          disabled={!dirty || !formComplete || saving}
          onClick={() => void submit()}
        >
          {saving ? "Сохраняем…" : "Сохранить карточку"}
        </button>
      </div>
    </section>
  );
}

function OptionalSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm">
      {label}
      <select
        className="mt-1 w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Не указывать</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
