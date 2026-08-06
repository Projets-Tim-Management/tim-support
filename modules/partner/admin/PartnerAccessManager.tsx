"use client";

import { useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useEffect, useState } from "react";

/**
 * Accès back-office d'un partenaire, dans l'onglet « Accès ».
 *
 * - L'identifiant de connexion est FORCÉ sur le champ « Email » de la fiche
 *   (affiché en lecture seule) → ici on ne définit que le MOT DE PASSE.
 * - À la validation → crée/met à jour le compte `Users` lié via
 *   /api/partner/access. Le RÔLE découle du type de la fiche (métier ou
 *   utilisateur) ; le mot de passe n'est jamais stocké sur la fiche.
 * - N'apparaît qu'une fois la fiche enregistrée (id requis pour rattacher).
 */
export function PartnerAccessManager() {
  const { id } = useDocumentInfo();
  const ficheEmail = useFormFields(
    ([f]) => ((f?.email?.value as string | undefined) ?? "").trim(),
  );

  const [linkedEmail, setLinkedEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/partner/access?partnerId=${id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.linked) setLinkedEmail(d.email ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <div className="tim-access">
        <h4 className="tim-access__title">Accès back-office</h4>
        <p className="tim-access__hint">
          Enregistrez d'abord la fiche partenaire pour lui créer un accès (compte + mot de passe).
        </p>
      </div>
    );
  }

  const submit = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/partner/access", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: id, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: "err", text: d?.message || "Échec de la création de l'accès." });
      } else {
        setMsg({ type: "ok", text: d.created ? "Accès créé." : "Accès mis à jour." });
        setLinkedEmail(d.email ?? ficheEmail);
        setPassword("");
      }
    } catch {
      setMsg({ type: "err", text: "Erreur réseau." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tim-access">
      <h4 className="tim-access__title">Accès back-office</h4>
      <p className="tim-access__hint">
        {linkedEmail
          ? `Compte lié : ${linkedEmail}. Définis un nouveau mot de passe pour le changer.`
          : "Aucun compte pour l'instant. Définis un mot de passe pour créer l'accès — le rôle suit le type de la fiche."}
      </p>

      <div className="tim-access__row">
        <div className="tim-access__field">
          Email de connexion
          <div className="tim-access__readonly">
            {ficheEmail || "— ajoute un email sur la fiche (onglet Contact)"}
          </div>
        </div>
        <label className="tim-access__field">
          Mot de passe
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder={linkedEmail ? "Laisser vide pour ne pas changer" : "8 caractères minimum"}
          />
        </label>
      </div>

      <button
        type="button"
        className="tim-access__btn"
        disabled={loading || !ficheEmail || (!linkedEmail && password.length < 8)}
        onClick={submit}
      >
        {loading ? "…" : linkedEmail ? "Mettre à jour le mot de passe" : "Créer l'accès"}
      </button>

      {msg && <p className={`tim-access__msg tim-access__msg--${msg.type}`}>{msg.text}</p>}
    </div>
  );
}
