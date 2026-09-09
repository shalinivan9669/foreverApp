"use client";
import { useState } from "react";
import {
  CURRENCIES,
  sharedLifeEntrySchema,
  type SharedLifeEntryInput,
} from "@/lib/contracts/sharedLife";
import type { SharedLifeEntryDTO } from "@/lib/dto/sharedLife.dto";

export const SHARED_LIFE_LABELS = {
  EVENT: "Даты и события",
  TASK: "Быт и задачи",
  SHOPPING: "Покупки и желания",
  GOAL: "Цели",
  BUDGET: "Реальный бюджет",
  MEMORY: "Воспоминания",
};
const REPEAT_LABELS = {
  NONE: "Не повторять",
  WEEKLY: "Каждую неделю",
  MONTHLY: "Каждый месяц",
  YEARLY: "Каждый год",
};
type Props = {
  entry?: SharedLifeEntryDTO;
  initialKind: SharedLifeEntryInput["kind"];
  myRole: "A" | "B";
  currency: string;
  busy: boolean;
  saveDisabled?: boolean;
  onSave: (data: SharedLifeEntryInput) => Promise<boolean>;
  onClose: () => void;
  onCancel?: () => void;
  onDirty?: () => void;
  preservedState?: SharedLifeEntryInput;
};
export default function SharedLifeEntryForm({
  entry,
  initialKind,
  myRole,
  currency,
  busy,
  saveDisabled = false,
  onSave,
  onClose,
  onCancel = onClose,
  onDirty,
  preservedState,
}: Props) {
  const kind = initialKind;
  const [error, setError] = useState("");
  const data = entry?.data;
  const stateData = preservedState?.kind === data?.kind ? preservedState : data;
  const field = (key: string): string => {
    const source = ["status", "reservedBy", "lastCompletedDate"].includes(key) ? stateData : data;
    return source && key in source ? String(Reflect.get(source, key) ?? "") : "";
  };
  return (
    <form
      className="space-y-4"
      onChange={onDirty}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || saveDisabled) return;
        const form = new FormData(event.currentTarget);
        const text = (key: string) => String(form.get(key) ?? "").trim();
        const common = { title: text("title"), note: text("note") };
        const date = text("date");
        let candidate;
        if (kind === "EVENT")
          candidate = {
            ...common,
            kind,
            date,
            repeat: text("repeat"),
            ...(field("lastCompletedDate")
              ? { lastCompletedDate: field("lastCompletedDate") }
              : {}),
            place: text("place"),
            status: field("status") || "OPEN",
          };
        else if (kind === "TASK")
          candidate = {
            ...common,
            kind,
            ...(date ? { date } : {}),
            repeat: text("repeat"),
            ...(field("lastCompletedDate")
              ? { lastCompletedDate: field("lastCompletedDate") }
              : {}),
            assignee: text("assignee"),
            effortMinutes: Number(text("effortMinutes")),
            status: field("status") || "OPEN",
          };
        else if (kind === "SHOPPING")
          candidate = {
            ...common,
            kind,
            quantity: text("quantity"),
            reservedBy: field("reservedBy") || "NONE",
            status: field("status") || "OPEN",
          };
        else if (kind === "GOAL")
          candidate = {
            ...common,
            kind,
            ...(date ? { date } : {}),
            assignee: text("assignee"),
            milestones: text("milestones")
              .split("\n")
              .map((title) => title.trim())
              .filter(Boolean)
              .map((title) => ({
                title,
                done:
                  stateData?.kind === "GOAL"
                    ? (stateData.milestones.find((step) => step.title === title)
                        ?.done ?? false)
                    : false,
              })),
            status: field("status") || "OPEN",
          };
        else if (kind === "BUDGET")
          candidate = {
            ...common,
            kind,
            date,
            direction: text("direction"),
            amountMinor: Math.round(Number(text("amount")) * 100),
            currency: text("currency"),
            assignee: text("assignee"),
          };
        else
          candidate = {
            ...common,
            kind,
            date,
            place: text("place"),
            ...(text("photoLink") ? { photoLink: text("photoLink") } : {}),
          };
        const parsed = sharedLifeEntrySchema.safeParse(candidate);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Проверьте поля.");
          return;
        }
        setError("");
        void onSave(parsed.data).then((saved) => {
          if (saved) onClose();
        });
      }}
    >
      <fieldset disabled={busy} className="space-y-4">
      <h2 className="text-lg font-semibold">
        Ваш черновик
      </h2>
      <p className="app-muted text-sm">{SHARED_LIFE_LABELS[kind]}. Ввод остаётся на этом экране до сохранения.</p>
      {preservedState && <p className="app-panel-soft p-3 text-sm">Отметки выполнения и взятая на себя покупка сохранятся из актуальной версии. Остальные поля будут сохранены из вашего черновика.</p>}
      <label className="block text-sm">
        Название
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={data?.title}
          className="app-input mt-1 w-full"
        />
      </label>
      {kind !== "SHOPPING" && (
        <label className="block text-sm">
          Дата{kind === "TASK" || kind === "GOAL" ? ", необязательно" : ""}
          <input
            name="date"
            type="date"
            min="1900-01-01"
            max="2200-12-31"
            required={["EVENT", "BUDGET", "MEMORY"].includes(kind)}
            defaultValue={field("date")}
            className="app-input mt-1 w-full"
          />
        </label>
      )}
      {(kind === "EVENT" || kind === "TASK") && (
        <label className="block text-sm">
          Повторение
          <select
            name="repeat"
            defaultValue={field("repeat") || "NONE"}
            className="app-input mt-1 w-full"
          >
            {Object.entries(REPEAT_LABELS).map(([key, title]) => (
              <option key={key} value={key}>
                {title}
              </option>
            ))}
          </select>
        </label>
      )}
      {["TASK", "GOAL", "BUDGET"].includes(kind) && (
        <label className="block text-sm">
          {kind === "BUDGET" ? "Чей вклад / расход" : "Ответственный"}
          <select
            name="assignee"
            defaultValue={field("assignee") || "BOTH"}
            className="app-input mt-1 w-full"
          >
            <option value="BOTH">Вместе</option>
            <option value={myRole}>Я</option>
            <option value={myRole === "A" ? "B" : "A"}>Партнёр</option>
          </select>
        </label>
      )}
      {kind === "TASK" && (
        <label className="block text-sm">
          Планируемые минуты, включая организацию
          <input
            name="effortMinutes"
            type="number"
            min={0}
            max={1440}
            defaultValue={field("effortMinutes") || 15}
            className="app-input mt-1 w-full"
          />
        </label>
      )}
      {kind === "SHOPPING" && (
        <label className="block text-sm">
          Количество / вариант
          <input
            name="quantity"
            maxLength={100}
            defaultValue={field("quantity") || "1"}
            className="app-input mt-1 w-full"
          />
        </label>
      )}
      {kind === "GOAL" && (
        <label className="block text-sm">
          Этапы, каждый с новой строки, до 20
          <textarea
            name="milestones"
            required
            rows={4}
            maxLength={3200}
            defaultValue={
              data?.kind === "GOAL"
                ? data.milestones.map((step) => step.title).join("\n")
                : ""
            }
            className="app-input mt-1 w-full"
          />
        </label>
      )}
      {kind === "BUDGET" && (
        <>
          <p className="app-muted text-sm">
            Добровольные общие записи. Внутренняя валюта приложения здесь не
            используется.
          </p>
          <label className="block text-sm">
            Тип
            <select
              name="direction"
              defaultValue={field("direction") || "EXPENSE"}
              className="app-input mt-1 w-full"
            >
              <option value="EXPENSE">Общий расход</option>
              <option value="INCOME">Общий доход</option>
              <option value="CONTRIBUTION">Взнос в общий бюджет</option>
            </select>
          </label>
          <label className="block text-sm">
            Сумма
            <input
              name="amount"
              type="number"
              min="0.01"
              max="1000000000"
              step="0.01"
              required
              defaultValue={
                data?.kind === "BUDGET" ? data.amountMinor / 100 : ""
              }
              className="app-input mt-1 w-full"
            />
          </label>
          <label className="block text-sm">
            Валюта
            <select
              name="currency"
              defaultValue={field("currency") || currency}
              className="app-input mt-1 w-full"
            >
              {CURRENCIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {(kind === "EVENT" || kind === "MEMORY") && (
        <label className="block text-sm">
          Место, необязательно
          <input
            name="place"
            maxLength={200}
            defaultValue={field("place")}
            className="app-input mt-1 w-full"
          />
        </label>
      )}
      {kind === "MEMORY" && (
        <label className="block text-sm">
          Ссылка на фото, необязательно
          <input
            name="photoLink"
            type="url"
            maxLength={2000}
            placeholder="https://…"
            defaultValue={field("photoLink")}
            className="app-input mt-1 w-full"
          />
          <span className="app-muted mt-1 block text-xs">
            Фото остаётся на исходном сервисе; доступ к нему определяется его
            настройками. Ссылка видна обоим.
          </span>
        </label>
      )}
      <label className="block text-sm">
        Общая заметка
        <textarea
          name="note"
          rows={3}
          maxLength={2000}
          defaultValue={data?.note}
          className="app-input mt-1 w-full"
        />
      </label>
      <p className="app-muted text-sm">
        Запись и изменения видны обоим участникам текущей пары.
      </p>
      {error && (
        <p role="alert" className="app-alert app-alert-error p-3">
          {error}
        </p>
      )}
      {saveDisabled && <p className="app-alert p-3 text-sm" role="status">Сначала сравните актуальную запись и разрешите сохранение черновика выше.</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy || saveDisabled} className="app-btn-primary px-4 py-2">
          {busy ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="app-btn-secondary px-4 py-2"
        >
          Отмена
        </button>
      </div>
      </fieldset>
    </form>
  );
}
