"use client";

import { useState } from "react";
import type {
  MatchingPreferenceDTO,
  SaveMatchingPreferencesRequest,
} from "@/client/api/match.api";
import {
  flexibilityLabel,
  importanceLabel,
  matchingPreferenceLabel,
  matchingPreferencesForSave,
} from "@/client/viewmodels/matching";

type MatchingPreferencesFormProps = {
  revision: number;
  initial: MatchingPreferenceDTO[];
  saving: boolean;
  onSave: (input: SaveMatchingPreferencesRequest) => Promise<boolean>;
};

export default function MatchingPreferencesForm({
  revision,
  initial,
  saving,
  onSave,
}: MatchingPreferencesFormProps) {
  const [preferences, setPreferences] =
    useState<MatchingPreferenceDTO[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (
    factorKey: string,
    updater: (current: MatchingPreferenceDTO) => MatchingPreferenceDTO,
  ): void => {
    setPreferences((current) =>
      current.map((preference) =>
        preference.factorKey === factorKey ? updater(preference) : preference,
      ),
    );
    setDirty(true);
    setSaved(false);
  };

  const submit = async (): Promise<void> => {
    const ok = await onSave({
      revision,
      preferences: matchingPreferencesForSave(preferences),
    });
    if (ok) {
      setDirty(false);
      setSaved(true);
    }
  };

  return (
    <section
      className="app-panel p-4 sm:p-6"
      aria-labelledby="preferences-title"
    >
      <h2 id="preferences-title" className="text-xl font-semibold">
        Предпочтения партнёра
      </h2>
      <p className="app-muted mt-1 text-sm">
        Для каждого пункта отдельно выберите важность, гибкость и разрешение на
        использование в подборе.
      </p>

      {preferences.length === 0 ? (
        <div className="app-panel-soft mt-4 p-4 text-sm">
          Доступные критерии появятся после подготовки каталога подбора.
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {preferences.map((preference) => (
            <article className="app-panel-soft p-4" key={preference.factorKey}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {matchingPreferenceLabel(preference)}
                  </h3>
                  <p className="app-muted mt-1 text-xs">
                    Настройка видна только вам и отправится после явного
                    разрешения.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={preference.useAllowed}
                    onChange={(event) =>
                      update(preference.factorKey, (current) => ({
                        ...current,
                        useAllowed: event.target.checked,
                      }))
                    }
                  />
                  Использовать в подборе
                </label>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <TargetControl
                  preference={preference}
                  disabled={!preference.useAllowed}
                  onChange={(target) =>
                    update(preference.factorKey, (current) => ({
                      ...current,
                      target,
                    }))
                  }
                />
                <label className="text-sm">
                  Важность
                  <select
                    className="mt-1 w-full"
                    disabled={!preference.useAllowed}
                    value={preference.importance}
                    onChange={(event) =>
                      update(preference.factorKey, (current) => ({
                        ...current,
                        importance: event.target
                          .value as MatchingPreferenceDTO["importance"],
                      }))
                    }
                  >
                    {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map(
                      (value) => (
                        <option value={value} key={value}>
                          {importanceLabel(value)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="text-sm">
                  Гибкость
                  <select
                    className="mt-1 w-full"
                    disabled={!preference.useAllowed}
                    value={preference.flexibility}
                    onChange={(event) =>
                      update(preference.factorKey, (current) => ({
                        ...current,
                        flexibility: event.target
                          .value as MatchingPreferenceDTO["flexibility"],
                      }))
                    }
                  >
                    {(
                      [
                        "FLEXIBLE",
                        "PREFER",
                        "IMPORTANT",
                        "NON_NEGOTIABLE",
                      ] as const
                    ).map((value) => (
                      <option value={value} key={value}>
                        {flexibilityLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-3 block text-sm">
                Как учитывать границу
                <select
                  className="mt-1 w-full sm:max-w-xs"
                  disabled={!preference.useAllowed}
                  value={preference.constraintMode}
                  onChange={(event) =>
                    update(preference.factorKey, (current) => ({
                      ...current,
                      constraintMode: event.target
                        .value as MatchingPreferenceDTO["constraintMode"],
                    }))
                  }
                >
                  <option value="NONE">Не ограничивать</option>
                  <option value="SOFT">Мягкое предпочтение</option>
                  {preference.hardAllowed && (
                    <option value="HARD">Обязательное условие</option>
                  )}
                </select>
              </label>
            </article>
          ))}
        </div>
      )}

      {saved && (
        <p className="mt-4 text-sm font-medium text-emerald-700" role="status">
          Предпочтения сохранены.
        </p>
      )}
      <button
        className="app-btn-primary mt-5 w-full sm:w-auto"
        type="button"
        disabled={!dirty || saving || preferences.length === 0}
        onClick={() => void submit()}
      >
        {saving ? "Сохраняем…" : "Сохранить предпочтения"}
      </button>
    </section>
  );
}

function TargetControl({
  preference,
  disabled,
  onChange,
}: {
  preference: MatchingPreferenceDTO;
  disabled: boolean;
  onChange: (target: MatchingPreferenceDTO["target"]) => void;
}) {
  const target = preference.target;
  if (target.kind === "SCALAR_RANGE") {
    return (
      <fieldset className="text-sm">
        <legend>Желаемый диапазон</legend>
        <div className="mt-1 flex gap-2">
          <input
            className="min-w-0 flex-1"
            type="number"
            step="any"
            disabled={disabled}
            aria-label="Минимум"
            value={target.minimum}
            onChange={(event) =>
              onChange({ ...target, minimum: Number(event.target.value) })
            }
          />
          <input
            className="min-w-0 flex-1"
            type="number"
            step="any"
            disabled={disabled}
            aria-label="Максимум"
            value={target.maximum}
            onChange={(event) =>
              onChange({ ...target, maximum: Number(event.target.value) })
            }
          />
        </div>
      </fieldset>
    );
  }

  if (target.kind === "ROLE_TARGET") {
    return (
      <fieldset className="text-sm">
        <legend>Желаемый диапазон роли</legend>
        <div className="mt-1 flex gap-2">
          <input
            className="min-w-0 flex-1"
            type="number"
            step="any"
            disabled={disabled}
            aria-label="Минимум роли"
            value={target.desiredPreferenceMinimum}
            onChange={(event) =>
              onChange({
                ...target,
                desiredPreferenceMinimum: Number(event.target.value),
              })
            }
          />
          <input
            className="min-w-0 flex-1"
            type="number"
            step="any"
            disabled={disabled}
            aria-label="Максимум роли"
            value={target.desiredPreferenceMaximum}
            onChange={(event) =>
              onChange({
                ...target,
                desiredPreferenceMaximum: Number(event.target.value),
              })
            }
          />
        </div>
      </fieldset>
    );
  }

  return (
    <label className="text-sm">
      Подходящие варианты
      <input
        className="mt-1 w-full"
        disabled={disabled}
        value={target.allowedValues.join(", ")}
        onChange={(event) =>
          onChange({
            ...target,
            allowedValues: event.target.value
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          })
        }
      />
    </label>
  );
}
