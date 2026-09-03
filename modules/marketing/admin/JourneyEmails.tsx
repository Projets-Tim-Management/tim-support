"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { EmailPreview } from "@/modules/marketing/admin/EmailPreview";
import type { EnvoiCroise, EvenementBrevo, Sort } from "@/modules/marketing/lib/journey-mail-status";

/**
 * Onglet « E-mails » d'une phase de test.
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

type Reponse = {
  configured: boolean;
  error: string | null;
  adresse: string | null;
  envois: EnvoiCroise[];
  autres: EvenementBrevo[];
};

export function JourneyEmails() {
  const { id } = useDocumentInfo();
  const [data, setData] = useState<Reponse | null>(null);
  const [echec, setEchec] = useState(false);
  const [apercu, setApercu] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let annule = false;
    fetch(`/api/marketing/journey-emails?run=${id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => !annule && setData(j as Reponse))
      .catch(() => !annule && setEchec(true));
    return () => {
      annule = true;
    };
  }, [id]);

  // Phase de test pas encore enregistrée : il n'y a pas d'envoi à montrer.
  if (id == null) return null;
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
      <p className="jmail__intro">
        Ce que la séquence prévoit, et ce que le destinataire en a réellement fait.
        {data.adresse && (
          <>
            {" "}
            Adresse suivie : <strong>{data.adresse}</strong>.
          </>
        )}
        {data.error && <span className="jmail__warn"> Brevo : {data.error}</span>}
      </p>

      <ul className="jmail__list">
        {data.envois.map((e) => {
          const m = META[e.sort] ?? META["non-programme"];
          return (
            <li key={e.key} className="jmail__row">
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
        <>
          {/* Un code de connexion porte un objet variable (« 004851 — votre
              code… ») : il ne correspondra jamais à une ligne de la séquence,
              mais le client l'a bien reçu et c'est souvent ce qu'on cherche. */}
          <p className="jmail__autres-titre">Autres messages reçus à cette adresse</p>
          <ul className="jmail__list">
            {data.autres.map((e, i) => (
              <li key={`${e.messageId ?? e.date}-${i}`} className="jmail__row jmail__row--autre">
                <span className="jmail__body">
                  <span className="jmail__subject">{e.subject || "(sans objet)"}</span>
                  <span className="jmail__meta">
                    {quand(e.date)} · {e.event}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Même aperçu que la barre d'étapes : un seul rendu à maintenir, et le
          message affiché est bien celui que les fonctions d'envoi produisent. */}
      {apercu && (
        <EmailPreview runId={id} emailKey={apercu} onClose={() => setApercu(null)} />
      )}
    </div>
  );
}
