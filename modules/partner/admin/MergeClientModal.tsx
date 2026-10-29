"use client";

import { toast, useConfig, useDocumentInfo, useModal } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Slug partagé entre le menu 3-points et ce panneau. */
export const MERGE_MODAL_SLUG = "tim-merge-client";

/**
 * « Fusionner dans une fiche existante » — le doublon d'un lead absorbé par la
 * fiche de la même entreprise (voir la route clients/[id]/merge).
 *
 * Monté en `beforeDocumentControls`, comme l'archivage : ouvert depuis le menu
 * 3-points, il doit survivre à sa fermeture.
 *
 * Trois temps, dans un seul panneau : choisir la fiche à garder (les mêmes
 * coordonnées d'abord, puis par nom), voir ce qui va passer d'une fiche à
 * l'autre et ce qui l'empêcherait, confirmer. Le récapitulatif EST la
 * confirmation — pas de boîte « Êtes-vous sûr ? » par-dessus.
 */

type Candidate = {
  id: number | string;
  companyName: string;
  status: string;
  partner: string | null;
  email: string | null;
  suggested: boolean;
};
type Summary = {
  target: { id: number | string; companyName: string; partner: string | null } | null;
  contacts: { move: number; alreadyKnown: number } | null;
  moving: { label: string; n: number }[];
  developments: number;
  blockers: string[];
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function MergeClientModal() {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig();
  const { id } = useDocumentInfo();
  const { closeModal, isModalOpen } = useModal();
  const router = useRouter();
  const open = id != null && isModalOpen(MERGE_MODAL_SLUG);

  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // Recherche, au fil de la frappe (léger délai) ; sans saisie, les suggestions.
  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const t = window.setTimeout(() => {
      fetch(`/api/admin/clients/${id}/merge?q=${encodeURIComponent(q)}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { candidates: Candidate[] }) => n === seq.current && setCandidates(d.candidates))
        .catch(() => n === seq.current && setCandidates([]));
    }, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [open, id, q]);

  // Le récapitulatif de la fiche choisie.
  useEffect(() => {
    setSummary(null);
    if (!open || !picked) return;
    let cancelled = false;
    fetch(`/api/admin/clients/${id}/merge`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: picked.id, preview: true }),
    })
      .then((r) => r.json())
      .then((d: Summary) => !cancelled && setSummary(d))
      .catch(() => !cancelled && toast.error("Le récapitulatif n'a pas pu être calculé."));
    return () => {
      cancelled = true;
    };
  }, [open, id, picked]);

  if (!open) return null;

  const close = () => {
    if (busy) return;
    setQ("");
    setPicked(null);
    setSummary(null);
    setCandidates(null);
    closeModal(MERGE_MODAL_SLUG);
  };

  const merge = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${id}/merge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: picked.id }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string; blockers?: string[] } | null;
      if (!res.ok) throw new Error(data?.message || data?.blockers?.join(" ") || "La fusion a échoué.");
      toast.success(`Fusionnée dans « ${picked.companyName} ».`);
      // Direction la fiche gardée : c'est là que tout se trouve désormais.
      closeModal(MERGE_MODAL_SLUG);
      router.push(`${adminRoute}/collections/partner-clients/${picked.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  const ready = summary && summary.blockers.length === 0;

  return createPortal(
    <div className="ctr-drawer" onClick={close}>
      <div
        className="ctr-drawer__panel mrg"
        role="dialog"
        aria-modal="true"
        aria-label="Fusionner dans une fiche existante"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ctr-drawer__head">
          <h2>Fusionner dans une fiche existante</h2>
          <div className="ctr-drawer__actions">
            <button type="button" className="ctr-btn" onClick={close} disabled={busy}>
              Fermer
            </button>
          </div>
        </header>

        <div className="mrg__body">
          <p className="mrg__intro">
            Cette fiche est un doublon ? Choisissez celle à <strong>garder</strong> : les contacts, l&apos;historique et
            la demande y passeront, puis celle-ci sera archivée.
          </p>

          <label className="ctr-field">
            <span className="ctr-field__label">Chercher une fiche par nom</span>
            <input
              className="ctr-input"
              value={q}
              autoFocus
              placeholder="Laurin…"
              onChange={(e) => {
                setQ(e.target.value);
                setPicked(null);
              }}
            />
          </label>

          <ul className="mrg__list">
            {candidates === null ? (
              <li className="mrg__empty">Recherche…</li>
            ) : candidates.length === 0 ? (
              <li className="mrg__empty">Aucune fiche trouvée{q ? ` pour « ${q} »` : ""}.</li>
            ) : (
              candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`mrg__item${picked?.id === c.id ? " is-picked" : ""}`}
                    onClick={() => setPicked(c)}
                  >
                    <span className="mrg__name">
                      {c.companyName}
                      {c.suggested && <em className="ctr-tag ctr-tag--amber">Même e-mail ou téléphone</em>}
                    </span>
                    <span className="mrg__meta">
                      {[c.status, c.partner, c.email].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          {picked && (
            <section className={`mrg__summary${summary?.blockers.length ? " mrg__summary--ko" : ""}`}>
              {!summary ? (
                <p className="ctr-muted">Calcul de ce qui va passer…</p>
              ) : summary.blockers.length ? (
                <>
                  <p className="mrg__summary-title">Fusion impossible</p>
                  <ul>
                    {summary.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="mrg__summary-title">
                    Passeront sur « {summary.target?.companyName} »
                    {summary.target?.partner ? ` (${summary.target.partner})` : ""} :
                  </p>
                  <ul>
                    {summary.contacts && summary.contacts.move > 0 && (
                      <li>{plural(summary.contacts.move, "contact", "contacts")}</li>
                    )}
                    {summary.moving.map((m) => (
                      <li key={m.label}>
                        {m.n} — {m.label}
                      </li>
                    ))}
                    {summary.developments > 0 && (
                      <li>{plural(summary.developments, "développement demandé", "développements demandés")}</li>
                    )}
                    <li>la demande d&apos;origine et les coordonnées de cette fiche, recopiées dans son historique</li>
                  </ul>
                  {summary.contacts && summary.contacts.alreadyKnown > 0 && (
                    <p className="ctr-muted">
                      {plural(summary.contacts.alreadyKnown, "contact déjà connu", "contacts déjà connus")} de la fiche
                      gardée (même e-mail ou téléphone) : {summary.contacts.alreadyKnown > 1 ? "ils restent" : "il reste"}{" "}
                      ici.
                    </p>
                  )}
                  <p className="ctr-muted">
                    Cette fiche sera ensuite archivée (motif « Autre » — doublon), pas supprimée.
                  </p>
                </>
              )}
            </section>
          )}
        </div>

        <footer className="sig-remind__foot">
          <span className="ctr-muted">Réservé à TIM.</span>
          <button type="button" className="ctr-btn ctr-btn--primary" onClick={merge} disabled={!ready || busy}>
            {busy ? "Fusion…" : "Fusionner et archiver ce doublon"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
