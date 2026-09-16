"use client";

import { toast } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { MonthValidation } from "@/modules/partner/lib/billing-validation";

/**
 * La case « Conforme » d'une ligne du rapprochement : signer le mois visé.
 *
 * Le clic EST le geste (route /api/admin/billing-validate) : il écrit la
 * ligne d'historique du mois — la configuration de la fiche, le tampon
 * Pennylane, qui a signé et quand. C'est ce que les statistiques et la liste
 * « à valider » liront.
 *
 * La case n'est active que si rien ne bloque : un écart de licences ou de
 * prix la grise, et la ligne dit quoi corriger. La règle est de toute façon
 * revérifiée côté serveur — une case n'est qu'un affichage.
 *
 * Trois lectures possibles : « Octobre · facture le 4 » à signer, « Validé le
 * 16/09 » signé, « À revalider » quand la fiche a bougé depuis.
 */
const moisLong = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const jour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const jourCourt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

export function ValidateMonth({ clientId, initial }: { clientId: number | string; initial: MonthValidation }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);

  const signed = v.state === "valide" || v.state === "a-revalider";
  const disabled = busy || v.state === "ecart" || v.state === "indisponible";

  const toggle = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/billing-validate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, validated: !signed }),
      });
      const data = (await res.json().catch(() => ({}))) as { validation?: MonthValidation; error?: string };
      if (!res.ok || !data.validation) throw new Error(data.error || String(res.status));
      setV(data.validation);
      // Les tuiles et le filtre en tête de page comptent : on les rafraîchit.
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "La validation n'a pas pu être enregistrée.");
    } finally {
      setBusy(false);
    }
  };

  const titre =
    v.state === "indisponible"
      ? "Aucun abonnement vivant : rien à valider."
      : v.state === "ecart"
        ? `À corriger avant de valider : ${v.blockers.map((b) => b.label).join(" · ")}`
        : v.state === "a-revalider"
          ? "La fiche a changé depuis la signature — vérifiez l'abonnement Pennylane, puis signez à nouveau."
          : signed
            ? "Retirer la validation"
            : "Signer : la fiche et l'abonnement Pennylane sont alignés pour cette facture.";

  return (
    <span className={`bil-validate bil-validate--${v.state}`} title={titre} onClick={(e) => e.stopPropagation()}>
      <span className="bil-validate__month">
        {v.state === "indisponible" ? (
          <span className="bil-muted">—</span>
        ) : (
          <>
            <span className="bil-validate__label">{moisLong(v.month)}</span>
            {v.invoiceDate && <span className="bil-validate__invoice">facture le {jour(v.invoiceDate)}</span>}
          </>
        )}
      </span>
      <label className={`bil-validate__box${disabled ? " bil-validate__box--off" : ""}`}>
        <input
          type="checkbox"
          checked={signed}
          disabled={disabled}
          aria-label={titre}
          onChange={() => void toggle()}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="bil-validate__text">
          {v.state === "valide" && v.validatedAt ? `Validé le ${jourCourt(v.validatedAt)}` : v.state === "a-revalider" ? "À revalider" : "Conforme"}
        </span>
      </label>
    </span>
  );
}
