"use client";
import Link from "next/link";
import { useState } from "react";
import { usePair } from "@/client/hooks/usePair";
import { useSharedLife } from "@/client/hooks/useSharedLife";
import { useRefreshOnReturn } from "@/client/hooks/useRefreshOnReturn";
import type {
  SharedLifeEntryInput,
  SharedLifeSettings,
} from "@/lib/contracts/sharedLife";
import type { SharedLifeEntryDTO } from "@/lib/dto/sharedLife.dto";
import ErrorView from "@/components/ui/ErrorView";
import SharedLifeEntryForm, { SHARED_LIFE_LABELS } from "./SharedLifeEntryForm";

export default function SharedLifePage() {
  const pair = usePair();
  const flow = useSharedLife(pair.pairId);
  const [filter, setFilter] = useState<SharedLifeEntryInput["kind"]>("EVENT");
  const [draft, setEditing] = useState<{
    id: string;
    pairId: string;
    entry?: SharedLifeEntryDTO;
    revision: number;
  } | null>(null);
  const editing = draft?.pairId === pair.pairId ? draft : null;
  const [deleteSelection, setDeleteSelection] = useState<{ id: string; pairId: string } | null>(null);
  const deleteId = deleteSelection?.pairId === pair.pairId ? deleteSelection.id : null;
  const setDeleteId = (id: string | null) => setDeleteSelection(id && pair.pairId ? { id, pairId: pair.pairId } : null);
  const pairAccessLost = pair.error && [401, 403, 404].includes(pair.error.status);
  const data = pairAccessLost ? null : flow.data;
  const roleLabel = (role: string) =>
    role === "BOTH" ? "вместе" : role === data?.myRole ? "я" : "партнёр";
  const save = (entryId: string, next: SharedLifeEntryInput) =>
    data
      ? flow.update({
          action: "SAVE",
          expectedRevision: editing?.id === entryId ? editing.revision : data.revision,
          entryId,
          data: next,
        })
      : Promise.resolve(false);
  const settings = (next: SharedLifeSettings) =>
    data &&
    flow.update({
      action: "SETTINGS",
      expectedRevision: data.revision,
      settings: next,
    });
  const money = (minor: number, currency: string) =>
    new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(
      minor / 100,
    );
  const refresh = async () => { await Promise.all([pair.refetch(), flow.reload()]); };
  useRefreshOnReturn(refresh, !flow.busy && !flow.loading && !editing && !deleteId);
  return (
    <main className="app-shell py-5">
      <nav className="mb-5 flex flex-wrap gap-3">
        <Link href="/main-menu" className="app-btn-secondary px-3 py-2">
          На главную
        </Link>
        {pair.pairId && (
          <Link
            href={`/pair/${pair.pairId}`}
            className="app-btn-secondary px-3 py-2"
          >
            Наша пара
          </Link>
        )}
        <Link href="/development" className="app-btn-secondary px-3 py-2">
          Занятия и отдых
        </Link>
      </nav>
      <section className="app-panel app-panel-solid p-5">
        <h1 className="text-2xl font-semibold">Наша общая жизнь</h1>
        <p className="app-muted mt-2">
          Даты, забота о доме, желания и планы. Оба участника могут изменять
          общие записи; личные ответы из тестов сюда не попадают.
        </p>
        <button className="app-btn-secondary mt-3 px-3 py-2" disabled={flow.busy || flow.loading} onClick={() => void refresh()}>Обновить общие записи</button>
        <p className="app-muted mt-2 text-sm">После действия партнёра обновите записи. Открытый черновик сохранится на этом экране; при конфликте сначала сравните версии.</p>
      </section>
      {(pair.loading || flow.loading) && (
        <p role="status" className="mt-4">
          Загружаем пространство…
        </p>
      )}
      {(pair.error || flow.error) && (
        <div className="mt-4">
          <ErrorView
            error={pair.error ?? flow.error}
            onRetry={() => {
              void refresh();
            }}
          />
        </div>
      )}
      {!pair.loading && !pair.pairId && (
        <section className="app-panel mt-5 p-5">
          <p>Общее пространство появится после подтверждения пары.</p>
          <Link
            href="/invite"
            className="app-btn-primary mt-3 inline-block px-4 py-2"
          >
            Связать партнёра
          </Link>
        </section>
      )}
      {data && (
        <>
          {data.readOnly && (
            <p className="app-alert mt-4 p-3">
              Пара на паузе. Записи доступны для просмотра; изменения — после
              возобновления.
            </p>
          )}
          <section className="app-panel app-panel-solid mt-4 p-4">
            <h2 className="font-semibold">Ближайшие поводы</h2>
            <p className="app-muted mt-1 text-xs">
              Напоминания отображаются внутри приложения, по календарной дате
              вашего устройства. Внешних уведомлений пока нет.
            </p>
            <div className="mt-3 space-y-2">
              {[
                ...data.occasions,
                ...data.entries
                  .filter(
                    (entry) =>
                      entry.nextDate &&
                      (entry.data.kind === "EVENT" ||
                        entry.data.kind === "TASK") &&
                      (!("status" in entry.data) ||
                        entry.data.status !== "DONE"),
                  )
                  .map((entry) => ({
                    id: entry.id,
                    title: entry.data.title,
                    date: entry.nextDate!,
                    source: "OWN",
                  })),
              ]
                .filter((item) => item.date >= data.today)
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(0, 8)
                .map((item) => (
                  <p key={item.id} className="text-sm">
                    <time>{item.date}</time> · {item.title}
                    {item.source === "AUTHOR" ? " · предложение авторов" : ""}
                    {Date.parse(`${item.date}T12:00:00Z`) -
                      Date.parse(`${data.today}T12:00:00Z`) <=
                    data.settings.reminderLeadDays * 86400000
                      ? " · скоро"
                      : ""}
                  </p>
                ))}
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm">
                Памятные даты и напоминания
              </summary>
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  Дата начала отношений
                  <input
                    type="date"
                    value={data.settings.relationshipStartDate ?? ""}
                    disabled={flow.busy || data.readOnly}
                    onChange={(event) => {
                      const rest = { ...data.settings };
                      delete rest.relationshipStartDate;
                      void settings({
                        ...rest,
                        ...(event.target.value
                          ? { relationshipStartDate: event.target.value }
                          : {}),
                      });
                    }}
                    className="app-input ml-2"
                  />
                </label>
                <label className="block text-sm">
                  <input
                    type="checkbox"
                    checked={data.settings.holidaysEnabled}
                    disabled={flow.busy || data.readOnly}
                    onChange={(event) =>
                      void settings({
                        ...data.settings,
                        holidaysEnabled: event.target.checked,
                      })
                    }
                  />{" "}
                  Предлагать календарные поводы
                </label>
                <label className="block text-sm">
                  <input
                    type="checkbox"
                    checked={data.settings.authorEventsEnabled}
                    disabled={flow.busy || data.readOnly}
                    onChange={(event) =>
                      void settings({
                        ...data.settings,
                        authorEventsEnabled: event.target.checked,
                      })
                    }
                  />{" "}
                  Показывать отдельно отмеченные предложения авторов
                </label>
                <label className="block text-sm">
                  Выделять события за{" "}
                  <select
                    disabled={flow.busy || data.readOnly}
                    value={data.settings.reminderLeadDays}
                    onChange={(event) =>
                      void settings({
                        ...data.settings,
                        reminderLeadDays: Number(event.target.value),
                      })
                    }
                    className="app-input mx-2"
                  >
                    {[0, 1, 3, 7, 14, 30].map((days) => (
                      <option key={days}>{days}</option>
                    ))}
                  </select>{" "}
                  дней
                </label>
              </div>
            </details>
          </section>
          <nav
            aria-label="Разделы общей жизни"
            className="mt-5 flex flex-wrap gap-2"
          >
            {Object.entries(SHARED_LIFE_LABELS).map(([key, title]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                className={`${filter === key ? "app-btn-primary" : "app-btn-secondary"} px-3 py-2 text-sm`}
                onClick={() => setFilter(key as SharedLifeEntryInput["kind"])}
              >
                {title}
              </button>
            ))}
          </nav>
          <button
            className="app-btn-primary mt-4 px-4 py-2"
            disabled={data.readOnly || flow.busy || !!editing}
            onClick={() => setEditing({ id: crypto.randomUUID(), pairId: data.pairId, revision: data.revision })}
          >
            Добавить запись
          </button>
          {editing && editing.revision !== data.revision && <section className="app-alert mt-4 p-4" role="status">
            <p>Общие записи изменились после открытия черновика. Актуальная версия показана ниже; черновик ещё не сохранён.</p>
            <button className="app-btn-secondary mt-3 px-3 py-2" disabled={flow.busy || data.readOnly} onClick={() => setEditing({ ...editing, revision: data.revision })}>Я сравнил(а) версии — сохранить свой вариант следующим действием</button>
            <button className="ml-3 mt-3 underline" onClick={() => setEditing(null)}>Закрыть черновик и оставить актуальную запись</button>
          </section>}
          {editing && !data.readOnly && (
            <SharedLifeEntryForm
              key={`${editing.pairId}:${editing.id}`}
              entry={editing.entry}
              initialKind={editing.entry?.data.kind ?? filter}
              myRole={data.myRole}
              currency={data.settings.defaultCurrency}
              busy={flow.busy}
              saveDisabled={editing.revision !== data.revision}
              onClose={() => setEditing(null)}
              onSave={(next) => save(editing.id, next)}
            />
          )}
          {filter === "TASK" && (
            <section className="app-panel mt-4 p-4">
              <h2 className="font-semibold">Запланированная нагрузка</h2>
              <p className="app-muted text-xs">
                Оценка времени вводится вами, включая организацию. Это не оценка
                справедливости или вклада человека.
              </p>
              <div className="mt-2 flex flex-wrap gap-5">
                {data.taskLoad.map((row) => (
                  <p key={row.role} className="text-sm">
                    {roleLabel(row.role)}: {row.openTasks} дел ·{" "}
                    {row.plannedMinutes} мин
                  </p>
                ))}
              </div>
            </section>
          )}
          {filter === "BUDGET" && (
            <section className="app-panel mt-4 p-4">
              <h2 className="font-semibold">По всем внесённым записям</h2>
              <p className="app-muted text-xs">
                Доходы + взносы − расходы. Валюты считаются отдельно; это ручной
                список без банковского подключения.
              </p>
              {data.budget.map((row) => (
                <p key={row.currency} className="mt-2 text-sm">
                  {row.currency}: доход {money(row.incomeMinor, row.currency)},
                  взносы {money(row.contributionMinor, row.currency)}, расходы{" "}
                  {money(row.expenseMinor, row.currency)}. Остаток{" "}
                  {money(row.balanceMinor, row.currency)}.
                </p>
              ))}
            </section>
          )}
          <section className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.entries
              .filter((entry) => entry.data.kind === filter)
              .sort((a, b) =>
                filter === "MEMORY"
                  ? (b.nextDate ?? "").localeCompare(a.nextDate ?? "")
                  : (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999"),
              )
              .map((entry) => {
                const item = entry.data;
                return (
                  <article
                    className="app-panel app-panel-solid p-4"
                    key={entry.id}
                  >
                    <h2 className="font-semibold">{item.title}</h2>
                    {entry.nextDate && (
                      <p className="app-muted mt-1 text-sm">
                        {entry.nextDate}
                        {entry.nextDate < data.today &&
                        (item.kind === "TASK" || item.kind === "EVENT") &&
                        item.status === "OPEN"
                          ? " · дата прошла"
                          : ""}
                      </p>
                    )}
                    {item.note && (
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        {item.note}
                      </p>
                    )}
                    {"place" in item && item.place && (
                      <p className="app-muted mt-2 text-sm">
                        Место: {item.place}
                      </p>
                    )}
                    {"assignee" in item && (
                      <p className="app-muted mt-2 text-sm">
                        Ответственность: {roleLabel(item.assignee)}
                      </p>
                    )}
                    {item.kind === "BUDGET" && (
                      <p className="mt-2 font-semibold">
                        {item.direction === "EXPENSE"
                          ? "Расход"
                          : item.direction === "INCOME"
                            ? "Доход"
                            : "Взнос"}{" "}
                        · {money(item.amountMinor, item.currency)}
                      </p>
                    )}
                    {item.kind === "MEMORY" && item.photoLink && (
                      <a
                        className="mt-2 block text-sm underline"
                        href={item.photoLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Открыть фото на внешнем сервисе
                      </a>
                    )}
                    {item.kind === "SHOPPING" && (
                      <div className="mt-2 text-sm">
                        <p>Количество / вариант: {item.quantity}</p>
                        <p>
                          Кто берёт на себя:{" "}
                          {item.reservedBy === "NONE"
                            ? "пока никто"
                            : roleLabel(item.reservedBy)}
                        </p>
                        <button
                          disabled={
                            flow.busy ||
                            data.readOnly ||
                            (item.reservedBy !== "NONE" &&
                              item.reservedBy !== data.myRole)
                          }
                          onClick={() =>
                            void save(entry.id, {
                              ...item,
                              reservedBy:
                                item.reservedBy === data.myRole
                                  ? "NONE"
                                  : data.myRole,
                            })
                          }
                          className="app-btn-secondary mt-2 px-3 py-2"
                        >
                          {item.reservedBy === data.myRole
                            ? "Освободить желание"
                            : "Беру на себя"}
                        </button>
                      </div>
                    )}
                    {item.kind === "GOAL" && (
                      <div className="mt-3 space-y-2">
                        {item.milestones.map((step, i) => (
                          <label
                            key={`${i}:${step.title}`}
                            className="block text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={step.done}
                              disabled={flow.busy || data.readOnly}
                              onChange={(event) => {
                                const milestones = item.milestones.map(
                                  (current, index) =>
                                    index === i
                                      ? {
                                          ...current,
                                          done: event.target.checked,
                                        }
                                      : current,
                                );
                                void save(entry.id, {
                                  ...item,
                                  milestones,
                                  status: milestones.every(
                                    (current) => current.done,
                                  )
                                    ? "DONE"
                                    : "OPEN",
                                });
                              }}
                            />{" "}
                            {step.title}
                          </label>
                        ))}
                      </div>
                    )}
                    {"status" in item && (
                      <p className="mt-3 text-sm">
                        {item.status === "DONE" ? "Завершено" : "В планах"}
                      </p>
                    )}
                    <p className="app-muted mt-3 text-xs">
                      Последняя правка: {roleLabel(entry.updatedBy)},{" "}
                      {new Date(entry.updatedAt).toLocaleString("ru-RU")}
                    </p>
                    {!data.readOnly && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          disabled={flow.busy || !!editing}
                          onClick={() => setEditing({ id: entry.id, pairId: data.pairId, entry, revision: data.revision })}
                          className="app-btn-secondary px-3 py-2 text-sm"
                        >
                          Изменить
                        </button>
                        {"status" in item && item.kind !== "GOAL" && (
                          <button
                            disabled={flow.busy}
                            onClick={() =>
                              void save(
                                entry.id,
                                (item.kind === "EVENT" ||
                                  item.kind === "TASK") &&
                                  item.repeat !== "NONE" &&
                                  entry.nextDate
                                  ? {
                                      ...item,
                                      status: "OPEN",
                                      lastCompletedDate: entry.nextDate,
                                    }
                                  : {
                                      ...item,
                                      status:
                                        item.status === "DONE"
                                          ? "OPEN"
                                          : "DONE",
                                    },
                              )
                            }
                            className="app-btn-secondary px-3 py-2 text-sm"
                          >
                            {item.status === "DONE"
                              ? "Вернуть в план"
                              : "Готово"}
                          </button>
                        )}
                        <button
                          disabled={flow.busy}
                          onClick={() => setDeleteId(entry.id)}
                          className="app-btn-secondary px-3 py-2 text-sm"
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                    {deleteId === entry.id && (
                      <div className="app-alert mt-3 p-3 text-sm">
                        <p>Удалить общую запись для обоих участников?</p>
                        <button
                          className="mt-2 underline"
                          disabled={flow.busy}
                          onClick={() =>
                            void flow
                              .update({
                                action: "DELETE",
                                expectedRevision: data.revision,
                                entryId: entry.id,
                              })
                              .then((saved) => {
                                if (saved) setDeleteId(null);
                              })
                          }
                        >
                          Удалить запись
                        </button>
                        <button
                          className="ml-4 underline"
                          onClick={() => setDeleteId(null)}
                        >
                          Оставить
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
          </section>
          {!data.entries.some((entry) => entry.data.kind === filter) && (
            <p className="app-muted mt-5">
              В этом разделе пока нет записей. Добавьте первую общую
              договорённость.
            </p>
          )}
          <details className="app-panel mt-5 p-4">
            <summary className="cursor-pointer text-sm">
              Последние изменения
            </summary>
            {[...data.changes]
              .reverse()
              .slice(0, 12)
              .map((change) => (
                <p key={change.revision} className="app-muted mt-2 text-xs">
                  Версия {change.revision} · {roleLabel(change.actor)} ·{" "}
                  {change.action === "DELETE"
                    ? "удаление записи"
                    : change.action === "SETTINGS"
                      ? "настройки"
                      : "сохранение записи"}{" "}
                  · {new Date(change.at).toLocaleString("ru-RU")}
                </p>
              ))}
          </details>
        </>
      )}
    </main>
  );
}
