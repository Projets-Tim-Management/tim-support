"use client";

import { useEffect, useState } from "react";

/**
 * Mise en conformité de l'adresse d'expédition d'un partenaire.
 *
 * S'affiche À LA PLACE du composeur tant que l'e-mail ne peut pas partir de son
 * adresse. Deux étapes, dans l'ordre où Brevo les exige :
 *  1. inscrire l'adresse (un lien de confirmation arrive dans sa boîte) ;
 *  2. authentifier le DOMAINE — trois enregistrements DNS à donner à son
 *     hébergeur. C'est cette étape qui fait qu'un message expédié depuis
 *     « untel@son-domaine.fr » est signé par son domaine, et non traité comme
 *     une usurpation par les messageries.
 *
 * Le troisième chemin est écrit noir sur blanc : ne rien configurer et écrire
 * depuis sa propre messagerie. Cacher cette option ferait perdre du temps à
 * quelqu'un qui n'a aucune envie de toucher à ses DNS.
 */

type Record = { key: string; host: string; type: string; value: string; ok: boolean };
type State = {
  email: string;
  senderVerified: boolean;
  domain: string;
  domainAuthenticated: boolean;
  records: Record[];
};

const LABELS: globalThis.Record<string, string> = {
  brevo_code: "Propriété du domaine",
  dkim_record: "Signature DKIM",
  dmarc_record: "Politique DMARC",
};

export function SenderSetup({ onReady }: { onReady?: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/partner/sender", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as State;
      setState(json);
      // Même condition que le serveur (voir `resolveSender`) : adresse inscrite
      // ET domaine authentifié. Deux verdicts différents laissaient le composeur
      // s'ouvrir sur un envoi que le serveur refusait — ou l'inverse.
      if (json.senderVerified && json.domainAuthenticated) onReady?.();
    } catch {
      /* l'écran reste en l'état ; rien n'est envoyé pour autant */
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (action: "sender" | "domain") => {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/partner/sender", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Demande impossible.");
      if (action === "sender") {
        setMsg(
          json.status === "already"
            ? "Adresse déjà inscrite : ouvrez l'e-mail de Brevo et cliquez le lien de confirmation."
            : `Un e-mail de confirmation vient de partir à ${json.email}. Cliquez le lien qu'il contient.`,
        );
      }
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!state) return <p className="tim-setup__loading">Vérification de votre adresse…</p>;

  const done = state.senderVerified && state.domainAuthenticated;
  if (done) return null;

  return (
    <div className="tim-setup">
      <h3 className="tim-setup__title">Vos e-mails ne peuvent pas encore partir de {state.email}</h3>
      <p className="tim-setup__intro">
        Un message doit partir de <strong>votre</strong> adresse : c&apos;est vous que le client
        connaît, et c&apos;est à vous qu&apos;il doit répondre. Deux étapes, une seule fois.
      </p>

      {/* Étape 1 — l'adresse */}
      <div className={`tim-setup__step${state.senderVerified ? " is-done" : ""}`}>
        <span className="tim-setup__num">{state.senderVerified ? "✓" : "1"}</span>
        <div className="tim-setup__body">
          <p className="tim-setup__step-title">Confirmer l&apos;adresse {state.email}</p>
          {state.senderVerified ? (
            <p className="tim-setup__hint">Adresse confirmée.</p>
          ) : (
            <>
              <p className="tim-setup__hint">
                Brevo vous envoie un lien de confirmation. C&apos;est ce clic qui prouve que
                l&apos;adresse est bien la vôtre.
              </p>
              <button
                type="button"
                className="tim-setup__btn"
                disabled={busy === "sender"}
                onClick={() => void act("sender")}
              >
                {busy === "sender" ? "Envoi…" : "M'envoyer le lien de confirmation"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Étape 2 — le domaine */}
      <div className={`tim-setup__step${state.domainAuthenticated ? " is-done" : ""}`}>
        <span className="tim-setup__num">{state.domainAuthenticated ? "✓" : "2"}</span>
        <div className="tim-setup__body">
          <p className="tim-setup__step-title">Authentifier le domaine {state.domain}</p>
          {state.domainAuthenticated ? (
            <p className="tim-setup__hint">Domaine authentifié.</p>
          ) : (
            <>
              <p className="tim-setup__hint">
                Trois enregistrements à ajouter chez l&apos;hébergeur du domaine (OVH, Gandi,
                Cloudflare…). Sans eux, vos messages ne sont signés par personne et finissent en
                indésirables — ce qui est pire que de ne pas les envoyer.
              </p>
              {state.records.length === 0 ? (
                <button
                  type="button"
                  className="tim-setup__btn"
                  disabled={busy === "domain"}
                  onClick={() => void act("domain")}
                >
                  {busy === "domain" ? "Préparation…" : "Obtenir les enregistrements DNS"}
                </button>
              ) : (
                <table className="tim-setup__dns">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Nom</th>
                      <th>Valeur</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.records.map((r) => (
                      <tr key={r.key} className={r.ok ? "is-ok" : ""}>
                        <td>
                          <span className="tim-setup__rec">{r.type}</span>
                          <span className="tim-setup__rec-label">{LABELS[r.key] ?? r.key}</span>
                        </td>
                        <td className="tim-setup__mono">{r.host}</td>
                        <td className="tim-setup__mono tim-setup__value">{r.value}</td>
                        <td>
                          {r.ok ? (
                            <span className="tim-setup__ok">en place</span>
                          ) : (
                            <button
                              type="button"
                              className="tim-setup__copy"
                              onClick={() => {
                                void navigator.clipboard?.writeText(r.value);
                                setCopied(r.key);
                              }}
                            >
                              {copied === r.key ? "copié" : "copier"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {state.records.length > 0 && (
                <button
                  type="button"
                  className="tim-setup__btn"
                  disabled={busy === "domain"}
                  onClick={() => void act("domain")}
                >
                  {busy === "domain" ? "Vérification…" : "J'ai ajouté les enregistrements, vérifier"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {msg && <p className="tim-setup__msg">{msg}</p>}

      <p className="tim-setup__alt">
        Vous ne souhaitez pas toucher à vos DNS ? Écrivez à ce client{" "}
        <strong>depuis votre messagerie habituelle</strong> — c&apos;est parfaitement valable. Seul
        l&apos;envoi depuis cet écran demande cette configuration.
      </p>
    </div>
  );
}
