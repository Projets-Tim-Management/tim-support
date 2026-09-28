"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LEGAL_FORMS } from "@/modules/partner/lib/legal-forms";

/**
 * Les informations de l'entreprise, depuis l'espace client (étape 1 de la
 * signature).
 *
 * Deux blocs : l'ENTREPRISE (ce qui figure sur les factures et en tête du
 * contrat) et son REPRÉSENTANT LÉGAL (qui s'engage). Les mêmes champs que la
 * fiche (onglet « Facturation client ») : ce que TIM, le partenaire ou l'INSEE
 * y ont déjà mis arrive prérempli, le client corrige ou complète.
 *
 * SIREN OU SIRET suffit. Capital et ville du RCS sont facultatifs : une
 * entreprise individuelle n'en a pas.
 *
 * Les contrôles (9 et 14 chiffres, forme de la liste) sont refaits par la
 * route : ici, ils ne font qu'éviter un aller-retour.
 */

export type CompanyInfo = {
  raisonSociale: string;
  legalForm: string;
  shareCapital: string;
  siren: string;
  siret: string;
  rcsCity: string;
  vatNumber: string;
  billingAddress: string;
  billingAddressComplement: string;
  representativeFirstName: string;
  representativeLastName: string;
  representativeRole: string;
};

type Field = {
  key: keyof CompanyInfo;
  label: string;
  placeholder?: string;
  required?: boolean;
  /** Largeur sur deux colonnes (défaut : pleine largeur). */
  half?: boolean;
  select?: boolean;
  inputMode?: "numeric" | "decimal";
};

const COMPANY: Field[] = [
  { key: "raisonSociale", label: "Raison sociale", required: true },
  { key: "legalForm", label: "Forme sociale", required: true, half: true, select: true },
  { key: "shareCapital", label: "Capital social (€)", placeholder: "10 000", half: true, inputMode: "decimal" },
  { key: "siren", label: "SIREN", placeholder: "9 chiffres", half: true, inputMode: "numeric" },
  { key: "siret", label: "SIRET", placeholder: "14 chiffres", half: true, inputMode: "numeric" },
  { key: "rcsCity", label: "Ville du RCS", placeholder: "Lyon", half: true },
  { key: "vatNumber", label: "N° de TVA intracommunautaire", placeholder: "FR + 11 chiffres", half: true },
  { key: "billingAddress", label: "Adresse du siège (facturation)", placeholder: "N°, rue, code postal, ville", required: true },
  { key: "billingAddressComplement", label: "Complément d'adresse" },
];

const REPRESENTATIVE: Field[] = [
  { key: "representativeFirstName", label: "Prénom", required: true, half: true },
  { key: "representativeLastName", label: "Nom", required: true, half: true },
  { key: "representativeRole", label: "Qualité", placeholder: "Gérant, Président…", required: true },
];

const digits = (v: string) => v.replace(/\s+/g, "");

export default function SigningCompanyForm({
  initial,
  locked,
  submitLabel = "Enregistrer",
}: {
  initial: CompanyInfo;
  locked: boolean;
  /** « Valider et continuer » en première saisie : le bouton dit ce qu'il fait. */
  submitLabel?: string;
}) {
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
    if (!values.legalForm) return "Choisissez la forme sociale.";
    if (!values.siren.trim() && !values.siret.trim()) return "Indiquez le SIREN ou le SIRET.";
    if (values.siren.trim() && !/^\d{9}$/.test(digits(values.siren))) return "Le SIREN compte 9 chiffres.";
    if (values.siret.trim() && !/^\d{14}$/.test(digits(values.siret))) return "Le SIRET compte 14 chiffres.";
    if (!values.billingAddress.trim()) return "Indiquez l'adresse du siège.";
    if (!values.representativeFirstName.trim() || !values.representativeLastName.trim())
      return "Indiquez le prénom et le nom du représentant légal.";
    if (!values.representativeRole.trim()) return "Indiquez la qualité du représentant (gérant, président…).";
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

  const input =
    "mt-1.5 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary disabled:bg-surface";

  const renderField = (f: Field) => (
    <label key={f.key} className={`block ${f.half ? "" : "sm:col-span-2"}`}>
      <span className="text-sm font-semibold text-foreground">
        {f.label}
        {f.required && <span className="text-primary"> *</span>}
      </span>
      {f.select ? (
        <select value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} disabled={locked} className={input}>
          <option value="">Choisir…</option>
          {LEGAL_FORMS.map((lf) => (
            <option key={lf.value} value={lf.value}>
              {lf.short} — {lf.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={values[f.key]}
          onChange={(e) => set(f.key, e.target.value)}
          placeholder={f.placeholder}
          inputMode={f.inputMode}
          disabled={locked}
          className={input}
        />
      )}
    </label>
  );

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted sm:col-span-2">
          L&apos;entreprise
        </legend>
        {COMPANY.map(renderField)}
        <p className="text-xs text-muted sm:col-span-2">
          SIREN ou SIRET : l&apos;un des deux suffit. Capital et ville du RCS : si l&apos;entreprise est
          immatriculée au RCS.
        </p>
      </fieldset>

      <fieldset className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted sm:col-span-2">
          Représentant légal
        </legend>
        {REPRESENTATIVE.map(renderField)}
        <p className="text-xs text-muted sm:col-span-2">
          La personne habilitée à engager l&apos;entreprise : elle figure en tête du contrat.
        </p>
      </fieldset>

      {!locked && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? "Enregistrement…" : submitLabel}
          </button>
          {saved && <span className="text-sm font-medium text-success-text">Enregistré.</span>}
        </div>
      )}
      {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground">{error}</p>}
    </form>
  );
}
