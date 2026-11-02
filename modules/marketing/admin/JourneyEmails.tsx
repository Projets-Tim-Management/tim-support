"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { EmailPreview } from "@/modules/marketing/admin/EmailPreview";
import type { EnvoiCroise, Sort } from "@/modules/marketing/lib/journey-mail-status";

/**
 * Onglet « E-mails » d'un parcours (phase de test ou mise en production) — et,
 * pour la mise en production, le même historique dans l'onglet « Signature »
 * de la fiche, avec le conseil de relance (voir signing-advice).
 *
 * Ce que la séquence a PRÉVU, face à ce que Brevo a réellement fait de chaque
 * message. La barre d'étapes dit « envoyé » : c'est l'état du logiciel, pas
 * celui de la boîte aux lettres. Un message rejeté y figure comme envoyé, et
 * personne ne l'apprend — il a fallu interroger Brevo à la main pour savoir si
 * SOCOM avait bien reçu son invitation.
 *
 * La lecture Brevo se fait côté serveur (`/api/marketing/journey-emails`) :
 * la clé API ne transite jamais par le navigateur.
 *
 * Chaque ligne ouvre l'APERÇU du message — le même que celui de la barre
 * d'étapes, fabriqué par les fonctions d'envoi elles-mêmes. Savoir qu'un
 * message a été rejeté ne suffit pas : la question suivante est toujours
 * « qu'est-ce qu'il disait ? », et elle se posait jusqu'ici en changeant
 * d'onglet pour retrouver la ligne à la main.
 */

const META: Record<Sort, { label: string; color: string; bg: string }> = {
  "a-venir": { label: "À venir", color: "var(--tim-gray)", bg: "var(--tim-gray-bg)" },
  // Le signal qu'aucun autre écran ne donne : l'heure est passée, rien n'est parti.
  "non-parti": { label: "Non parti", color: "var(--tim-red)", bg: "var(--tim-red-bg)" },
  // L'heure est passée mais le cron n'est pas repassé : rien d'anormal.
  "en-attente": { label: "En attente", color: "var(--tim-amber)", bg: "var(--tim-amber-bg)" },
  "non-programme": { label: "Sur évènement", color: "var(--tim-gray)", bg: "var(--tim-gray-bg)" },
  // Ni une alerte, ni une attente : le client a fait ce qu'on lui demandait.
  "sans-objet": { label: "Sans objet", color: "var(--tim-gray)", bg: "var(--tim-gray-bg)" },
  envoye: { label: "Envoyé", color: "var(--tim-slate)", bg: "var(--tim-slate-bg)" },
  remis: { label: "Remis", color: "var(--tim-blue)", bg: "var(--tim-blue-bg)" },
  ouvert: { label: "Ouvert", color: "var(--tim-green)", bg: "var(--tim-green-bg)" },
  clique: { label: "Cliqué", color: "var(--tim-purple)", bg: "var(--tim-purple-bg)" },
  echec: { label: "Échec", color: "var(--tim-red)", bg: "var(--tim-red-bg)" },
};

const AUDIENCE: Record<string, string> = {
  client: "au client",
  partenaire: "au partenaire",
  tim: "à TIM",
};

const quand = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Heure seule : « part à 11:00 » se lit mieux que la date répétée. */
const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });

type Conseil = { tone: "ok" | "info" | "warn" | "bad"; text: string };

type Reponse = {
  runId: number | string;
  configured: boolean;
  error: string | null;
  adresse: string | null;
  conseil: Conseil | null;
  envois: EnvoiCroise[];
  /** Les autres messages reçus à l'adresse, un par message (pas un par évènement). */
  autres: { subject: string; date: string; sort: Sort; clics: number }[];
};

const CONSEIL_TONE: Record<Conseil["tone"], { color: string; bg: string }> = {
  ok: { color: "var(--tim-green)", bg: "var(--tim-green-bg)" },
  info: { color: "var(--tim-blue)", bg: "var(--tim-blue-bg)" },
  warn: { color: "var(--tim-amber)", bg: "var(--tim-amber-bg)" },
  bad: { color: "var(--tim-red)", bg: "var(--tim-red-bg)" },
};

/** Onglet « E-mails » du parcours ouvert. */
export function JourneyEmails() {
  const { id } = useDocumentInfo();
  // Parcours pas encore enregistré : il n'y a pas d'envoi à montrer.
  return id == null ? null : <EmailsPanel query={`run=${id}`} />;
}

/** Onglet « Signature » de la fiche : les e-mails de son parcours de mise en production. */
export function ClientSigningEmails() {
  const { id } = useDocumentInfo();
  return id == null ? null : (
    <EmailsPanel query={`client=${id}`} compact missing="Pas encore de parcours de mise en production : il démarre quand la fiche passe « En signature »." />
  );
}

/**
 * `compact` (onglet « Signature » de la fiche) : le conseil et les e-mails de
 * signature d'abord ; les autres messages repliés — la fiche n'est pas une
 * boîte de réception.
 */
function EmailsPanel({ query, missing, compact = false }: { query: string; missing?: string; compact?: boolean }) {
  const [data, setData] = useState<Reponse | null>(null);
  const [echec, setEchec] = useState<"absent" | "erreur" | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/marketing/journey-emails?${query}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => !annule && setData(j as Reponse))
      .catch((e: Error) => !annule && setEchec(e.message === "404" ? "absent" : "erreur"));
    return () => {
      annule = true;
    };
  }, [query]);

  if (echec === "absent" && missing) return <p className="jmail__vide">{missing}</p>;
  if (echec) return <p className="jmail__vide">Historique indisponible pour le moment.</p>;
  if (!data) return <p className="jmail__vide">Chargement…</p>;

  if (!data.configured) {
    return (
      <p className="jmail__vide">
        Le suivi des envois demande la clé API Brevo (<code>BREVO_API_KEY</code>). Sans elle,
        seule la date d&apos;envoi enregistrée par le parcours est connue.
      </p>
    );
  }

  return (
    <div className="jmail">
      {data.conseil && (
        <p className="jmail__conseil" style={{ color: CONSEIL_TONE[data.conseil.tone].color, background: CONSEIL_TONE[data.conseil.tone].bg }}>
          <strong>Relance :</strong> {data.conseil.text}
        </p>
      )}
      {compact && <h3 className="jmail__titre">E-mails de signature</h3>}
      <p className="jmail__intro">
        {compact ? "Ce qui partira, après quel geste, et ce que le client a fait de ce qui est parti." : "Ce que la séquence prévoit, et ce que le destinataire en a réellement fait."}
        {data.adresse && (
          <>
            {" "}
            Adresse suivie : <strong>{data.adresse}</strong>.
          </>
        )}
        {data.error && <span className="jmail__warn"> Brevo : {data.error}</span>}
      </p>

      <ul className="jmail__list">
        {data.envois.map((e, i) => {
          const m = META[e.sort] ?? META["non-programme"];
          return (
            // Une relance peut partir deux fois : la clé seule ne suffit pas.
            <li key={`${e.key}-${i}`} className="jmail__row">
              {/* Toute la ligne est la cible : c'est l'objet du message qu'on
                  vise du regard, pas un lien posé à côté. */}
              <button
                type="button"
                className="jmail__open"
                onClick={() => setApercu(e.key)}
                title="Voir le message tel qu'il part"
              >
                <span className="jmail__badge" style={{ color: m.color, background: m.bg }}>
                  {m.label}
                </span>
                <span className="jmail__body">
                  <span className="jmail__subject">{e.subject}</span>
                  <span className="jmail__meta">
                    {/* Une date seule se lit « ça partira ». Pour un envoi
                        annulé, elle dirait le contraire de la vérité. */}
                    {e.sort === "sans-objet"
                      ? `Ne partira pas — était prévu le ${quand(e.date)}`
                      : e.sort === "en-attente" && e.partA
                        ? // Le cron passe à l'heure pile : dire QUAND il part
                          // évite de chercher une panne là où il n'y a qu'une
                          // demi-heure d'attente.
                          `Prévu ${quand(e.date)} — part à ${heure(e.partA)}`
                        : quand(e.date)}{" "}
                    · {AUDIENCE[e.audience] ?? e.audience}
                    {e.clics > 0 && ` · ${e.clics} clic${e.clics > 1 ? "s" : ""}`}
                    {e.raison && ` · ${e.raison}`}
                  </span>
                </span>
                <span className="jmail__apercu" aria-hidden="true">
                  Aperçu
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {data.autres.length > 0 && (
        // Les autres messages reçus à cette adresse — codes de connexion, rappels
        // de la phase de test… — utiles pour répondre à « je n'ai rien reçu »,
        // mais repliés : ce n'est pas ce qu'on vient lire.
        <details className="jmail__autres" open={!compact && data.autres.length <= 6}>
          <summary className="jmail__autres-titre">
            Autres messages reçus à cette adresse ({data.autres.length}){compact ? " depuis le début de la signature" : ""}
          </summary>
          <ul className="jmail__list">
            {data.autres.map((e, i) => {
              const m = META[e.sort] ?? META.envoye;
              return (
                <li key={`${e.date}-${i}`} className="jmail__row jmail__row--autre">
                  <span className="jmail__badge" style={{ color: m.color, background: m.bg }}>
                    {m.label}
                  </span>
                  <span className="jmail__body">
                    <span className="jmail__subject">{e.subject || "(sans objet)"}</span>
                    <span className="jmail__meta">
                      {quand(e.date)}
                      {e.clics > 0 && ` · ${e.clics} clic${e.clics > 1 ? "s" : ""}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* Même aperçu que la barre d'étapes : un seul rendu à maintenir, et le
          message affiché est bien celui que les fonctions d'envoi produisent. */}
      {apercu && (
        <EmailPreview runId={data.runId} emailKey={apercu} onClose={() => setApercu(null)} />
      )}
    </div>
  );
}
