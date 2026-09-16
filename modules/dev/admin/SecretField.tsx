"use client";

import { FieldLabel, toast, useDocumentInfo, useField } from "@payloadcms/ui";
import { useState } from "react";

import { PASSWORD_MASK } from "@/modules/marketing/lib/credential-secrets";

/**
 * Un mot de passe qu'on peut RÉVÉLER d'un clic — celui d'un compte démo chez
 * un éditeur, sur une fiche réservée aux admins.
 *
 * La valeur du formulaire est le masque (le serveur masque à la lecture) ; on
 * ne montre le clair qu'à la demande, via une route qui vérifie le rôle, et on
 * ne le garde qu'à l'écran. Saisir un nouveau mot de passe remplace le masque
 * dans le formulaire ; il sera chiffré à l'enregistrement. Enregistrer sans y
 * toucher ne change rien : le masque revient intact (voir credential-secrets).
 */
type Props = { path: string; field: { label?: string | Record<string, string>; admin?: { description?: string } } };

export function SecretField({ path, field }: Props) {
  const { value, setValue } = useField<string>({ path });
  const { id } = useDocumentInfo();
  const [clear, setClear] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const stored = Boolean(value) && value === PASSWORD_MASK;
  const label = typeof field.label === "string" ? field.label : "Mot de passe";

  const reveal = async () => {
    if (id == null) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/integration-secret?id=${encodeURIComponent(String(id))}`, { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { password?: string | null; error?: string };
      if (!res.ok) throw new Error(data.error || String(res.status));
      setClear(data.password ?? "");
    } catch (e) {
      toast.error((e as Error).message || "Impossible de lire le mot de passe.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (clear == null) return;
    try {
      await navigator.clipboard.writeText(clear);
      toast.success("Mot de passe copié.");
    } catch {
      toast.error("Copie impossible — sélectionnez-le à la main.");
    }
  };

  return (
    <div className="field-type text dev-secret">
      <FieldLabel htmlFor={`field-${path}`} label={label} />
      {editing || !stored ? (
        // Saisie : un mot de passe neuf (ou le premier). Le clair part chiffré.
        <input
          id={`field-${path}`}
          type="text"
          autoComplete="off"
          className="dev-secret__input"
          value={stored && !editing ? "" : (value ?? "")}
          placeholder="Nouveau mot de passe"
          onChange={(e) => {
            setEditing(true);
            setValue(e.target.value);
          }}
        />
      ) : (
        <div className="dev-secret__row">
          <code className="dev-secret__value">{clear ?? PASSWORD_MASK}</code>
          {clear == null ? (
            <button type="button" className="tim-btn" disabled={busy || id == null} onClick={() => void reveal()}>
              Révéler
            </button>
          ) : (
            <>
              <button type="button" className="tim-btn" onClick={() => void copy()}>
                Copier
              </button>
              <button type="button" className="tim-btn" onClick={() => setClear(null)}>
                Masquer
              </button>
            </>
          )}
          <button
            type="button"
            className="tim-btn"
            onClick={() => {
              setEditing(true);
              setValue("");
            }}
          >
            Changer
          </button>
        </div>
      )}
      {field.admin?.description && <p className="field-description">{field.admin.description}</p>}
    </div>
  );
}
