"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Les informations de l'entreprise, depuis l'espace client (étape 1 de la
 * signature).
 *
 * Six champs, les mêmes que l'onglet « Facturation client » de la fiche : ce
 * que le partenaire y a déjà saisi arrive pré-rempli, le client corrige ou
 * complète. SIREN OU SIRET suffit — on ne demande pas deux fois la même
 * chose sous deux formes.
 *
 * Les contrôles (9 et 14 chiffres) sont refaits par la route : ici, ils ne font
 * qu'éviter un aller-retour.
 */

export type CompanyInfo = {
  raisonSociale: string;
  siren: string;
  siret: string;
  vatNumber: string;
  billingAddress: string;
  billingAddressComplement: string;
};

const FIELDS: { key: keyof CompanyInfo; label: string; placeholder?: string; required?: boolean; half?: boolean }[] = [
  { key: "raisonSociale", label: "Raison sociale", required: true },
  { key: "siren", label: "SIREN", placeholder: "9 chiffres", half: true },
  { key: "siret", label: "SIRET", placeholder: "14 chiffres", half: true },
  { key: "vatNumber", label: "Numéro de TVA intracommunautaire", placeholder: "FR + 11 chiffres" },
  { key: "billingAddress", label: "Adresse de facturation", placeholder: "N°, rue, code postal, ville", required: true },
  { key: "billingAddressComplement", label: "Complément d'adresse" },
];

const digits = (v: string) => v.replace(/\s+/g, "");

export default function SigningCompanyForm({ initial, locked }: { initial: CompanyInfo; locked: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<CompanyInfo>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (key: keyof CompanyInfo, v: string) => {
    setSaved(false);
    setValues((cur) => ({ ...cur, [key]: v }));
  };

  const check = (): string | null => {
    if (!values.raisonSociale.trim()) return "Indiquez la raison sociale.";
    if (!values.siren.trim() && !values.siret.trim()) return "Indiquez le SIREN ou le SIRET.";
    if (values.siren.trim() && !/^\d{9}$/.test(digits(values.siren))) return "Le SIREN compte 9 chiffres.";
    if (values.siret.trim() && !/^\d{14}$/.test(digits(values.siret))) return "Le SIRET compte 14 chiffres.";
    if (!values.billingAddress.trim()) return "Indiquez l'adresse de facturation.";
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = check();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/signature/entreprise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(data?.message || "L'enregistrement a échoué. Réessayez.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-2">
      {FIELDS.map((f) => (
        <label key={f.key} className={`block ${f.half ? "" : "sm:col-span-2"}`}>
          <span className="text-sm font-semibold text-foreground">
            {f.label}
            {f.required && <span className="text-primary"> *</span>}
          </span>
          <input
            type="text"
            value={values[f.key]}
            onChange={(e) => set(f.key, e.target.value)}
            placeholder={f.placeholder}
            disabled={locked}
            className="mt-1.5 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary disabled:bg-surface"
          />
        </label>
      ))}
      <p className="text-xs text-muted sm:col-span-2">SIREN ou SIRET : l&apos;un des deux suffit.</p>

      {!locked && (
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
          {saved && <span className="text-sm font-medium text-success-text">Enregistré.</span>}
        </div>
      )}
      {error && (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground sm:col-span-2">{error}</p>
      )}
    </form>
  );
}
