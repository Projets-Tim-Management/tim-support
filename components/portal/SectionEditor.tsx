"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fieldRequired,
  fieldVisible,
  validateRow,
  type PortalField,
  type PortalSection,
} from "@/modules/marketing/lib/portal-sections";

/**
 * Éditeur générique d'une section du dossier de démarrage.
 *
 * Un seul composant pour les cinq sections : les champs, leurs conditions
 * d'affichage et leurs règles d'obligation viennent du registre partagé avec
 * l'API. Écrire cinq formulaires aurait garanti qu'ils divergent.
 */

type Row = Record<string, unknown> & { id?: number | string };

const fmtCell = (field: PortalField | undefined, value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (field?.options) {
    const list = Array.isArray(value) ? value : [value];
    return list
      .map((v) => field.options?.find((o) => o.value === v)?.label ?? String(v))
      .join(", ");
  }
  if (field?.type === "date") {
    const t = Date.parse(String(value));
    return Number.isNaN(t) ? String(value) : new Date(t).toLocaleDateString("fr-FR");
  }
  return String(value);
};

/** Valeur prête pour un `<input>` : les dates arrivent en ISO complet. */
const toInput = (field: PortalField, value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (field.type === "date") return String(value).slice(0, 10);
  return String(value);
};

export default function SectionEditor({
  section,
  locked: initialLocked,
}: {
  section: PortalSection;
  locked: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(initialLocked);
  const [draft, setDraft] = useState<Row | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const byName = useMemo(
    () => Object.fromEntries(section.fields.map((f) => [f.name, f])),
    [section.fields],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/dossier/${section.key}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.docs ?? []);
      setLocked(Boolean(data.locked));
    } catch {
      setFailure("Chargement impossible. Rechargez la page.");
    } finally {
      setLoading(false);
    }
  }, [section.key]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    const found = validateRow(section, draft);
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    setFailure(null);
    try {
      const res = await fetch(`/api/portal/dossier/${section.key}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json();
      if (res.status === 422) {
        setErrors(body?.errors ?? {});
        return;
      }
      if (!res.ok) throw new Error(body?.message);
      setDraft(null);
      await load();
    } catch (err) {
      setFailure(err instanceof Error && err.message ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number | string) => {
    setBusy(true);
    try {
      await fetch(`/api/portal/dossier/${section.key}?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setField = (name: string, value: unknown) =>
    setDraft((d) => ({ ...(d ?? {}), [name]: value }));

  if (loading) return <p className="text-muted">Chargement…</p>;

  return (
    <div>
      {failure && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground" role="alert">
          {failure}
        </p>
      )}

      {locked && (
        <p className="mb-4 rounded-md bg-processing-bg px-4 py-3 text-sm text-processing-text">
          Votre dossier a été transmis : il n&apos;est plus modifiable. Contactez-nous si une
          information doit changer.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr>
                {section.columns.map((c) => (
                  <th key={c} className="px-3 py-2 font-semibold text-foreground">
                    {byName[c]?.label ?? c}
                  </th>
                ))}
                {!locked && <th className="w-24 px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-t border-border">
                  {section.columns.map((c) => (
                    <td key={c} className="px-3 py-2 text-foreground">
                      {fmtCell(byName[c], row[c])}
                    </td>
                  ))}
                  {!locked && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setErrors({});
                          setDraft(row);
                        }}
                        className="text-primary hover:underline"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(row.id!)}
                        className="ml-3 text-muted hover:underline"
                      >
                        Retirer
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 0 && !draft && (
        <p className="mb-6 text-muted">Aucune ligne pour l&apos;instant.</p>
      )}

      {!locked && !draft && (
        <button
          type="button"
          onClick={() => {
            setErrors({});
            setDraft({});
          }}
          className="rounded-md bg-primary px-4 py-2 font-semibold text-white transition hover:bg-primary-dark"
        >
          Ajouter un {section.singular}
        </button>
      )}

      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="rounded-lg border border-border bg-white p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => {
              if (!fieldVisible(field, draft)) return null;
              const required = fieldRequired(field, draft);
              const error = errors[field.name];
              const cls = field.half ? "" : "sm:col-span-2";

              return (
                <div key={field.name} className={cls}>
                  {field.type === "checkbox" ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(draft[field.name])}
                        onChange={(e) => setField(field.name, e.target.checked)}
                      />
                      <span className="text-sm font-semibold text-foreground">{field.label}</span>
                    </label>
                  ) : (
                    <label className="block">
                      <span className="text-sm font-semibold text-foreground">
                        {field.label}
                        {required && <span className="text-primary"> *</span>}
                      </span>

                      {field.type === "select" ? (
                        <select
                          value={toInput(field, draft[field.name])}
                          onChange={(e) => setField(field.name, e.target.value)}
                          className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-foreground outline-none focus:border-primary"
                        >
                          <option value="">—</option>
                          {field.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "multiselect" ? (
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-border p-3">
                          {field.options?.map((o) => {
                            const list = (draft[field.name] as string[] | undefined) ?? [];
                            return (
                              <label key={o.value} className="flex items-center gap-1.5 text-sm">
                                <input
                                  type="checkbox"
                                  checked={list.includes(o.value)}
                                  onChange={(e) =>
                                    setField(
                                      field.name,
                                      e.target.checked
                                        ? [...list, o.value]
                                        : list.filter((v) => v !== o.value),
                                    )
                                  }
                                />
                                {o.label}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <input
                          type={
                            field.type === "email"
                              ? "email"
                              : field.type === "tel"
                                ? "tel"
                                : field.type === "date"
                                  ? "date"
                                  : field.type === "number"
                                    ? "number"
                                    : "text"
                          }
                          value={toInput(field, draft[field.name])}
                          placeholder={field.placeholder}
                          onChange={(e) =>
                            setField(
                              field.name,
                              field.type === "number"
                                ? e.target.value === ""
                                  ? ""
                                  : Number(e.target.value)
                                : e.target.value,
                            )
                          }
                          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground outline-none focus:border-primary"
                        />
                      )}
                    </label>
                  )}

                  {field.hint && !error && <p className="mt-1 text-xs text-muted">{field.hint}</p>}
                  {error && <p className="mt-1 text-xs font-semibold text-primary">{error}</p>}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
            >
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setErrors({});
              }}
              className="rounded-md border border-border px-4 py-2 text-foreground"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
