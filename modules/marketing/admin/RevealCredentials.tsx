"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useCallback, useState } from "react";

/**
 * Affichage des mots de passe d'accès, derrière un code envoyé par e-mail.
 *
 * Trois états, un seul chemin : demander → saisir → voir. Le bouton dit ce qui
 * va se passer (« un code vous sera envoyé ») plutôt que « Révéler » tout court —
 * un utilisateur qui ne s'attend pas à recevoir un e-mail croit à un bug.
 */

type Ligne = { id: number | string; name: string; username?: string; password?: string | null };

export function RevealCredentials() {
  const { id: clientId } = useDocumentInfo();
  const [etape, setEtape] = useState<"repos" | "code" | "affiche">("repos");
  const [code, setCode] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [envoyeA, setEnvoyeA] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/credentials/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ clientId, ...body }),
      });
      return { res, data: await res.json().catch(() => ({})) };
    },
    [clientId],
  );

  const demander = useCallback(async () => {
    setOccupe(true);
    setErreur(null);
    const { res, data } = await post({});
    setOccupe(false);
    if (!res.ok) return setErreur("Impossible d'envoyer le code.");
    setEnvoyeA(data.to ?? null);
    setEtape("code");
  }, [post]);

  const confirmer = useCallback(async () => {
    setOccupe(true);
    setErreur(null);
    const { res, data } = await post({ code });
    setOccupe(false);
    if (!res.ok) {
      // Chaque refus a sa cause : un message unique obligerait à deviner s'il
      // faut retaper, redemander un code, ou attendre.
      const messages: Record<string, string> = {
        bad_code: "Code incorrect.",
        expired: "Ce code a expiré — demandez-en un nouveau.",
        too_many_attempts: "Trop d'essais. Demandez un nouveau code.",
        no_request: "Aucune demande en cours. Recommencez.",
      };
      return setErreur(messages[data?.error] ?? "Vérification impossible.");
    }
    setLignes(data.credentials ?? []);
    setEtape("affiche");
  }, [post, code]);

  if (etape === "affiche") {
    return (
      <div className="jr-reveal">
        <p className="jr-reveal__note">
          Consultation enregistrée à votre nom. Fermez cet écran une fois les accès relevés.
        </p>
        <table className="jr-reveal__table">
          <thead>
            <tr>
              <th>Personne</th>
              <th>Identifiant</th>
              <th>Mot de passe</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id}>
                <td>{l.name || "—"}</td>
                <td className="jr-reveal__mono">{l.username || "—"}</td>
                <td className="jr-reveal__mono">{l.password || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="jr-btn jr-btn--ghost" onClick={() => { setLignes([]); setEtape("repos"); setCode(""); }}>
          Masquer
        </button>
      </div>
    );
  }

  return (
    <div className="jr-reveal">
      {etape === "repos" ? (
        <>
          <p className="jr-reveal__note">
            Les mots de passe sont chiffrés. Pour les afficher, un code de confirmation vous sera
            envoyé par e-mail, et la consultation sera enregistrée à votre nom.
          </p>
          <button type="button" className="jr-btn" disabled={occupe} onClick={demander}>
            {occupe ? "Envoi…" : "Recevoir un code par e-mail"}
          </button>
        </>
      ) : (
        <>
          <p className="jr-reveal__note">
            Code envoyé{envoyeA ? ` à ${envoyeA}` : ""}. Valable 10 minutes.
          </p>
          <div className="jr-reveal__row">
            <input
              className="jr-reveal__input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && confirmer()}
            />
            <button type="button" className="jr-btn" disabled={occupe || code.length !== 6} onClick={confirmer}>
              Afficher
            </button>
            <button type="button" className="jr-btn jr-btn--ghost" disabled={occupe} onClick={demander}>
              Renvoyer
            </button>
          </div>
        </>
      )}
      {erreur && <p className="jr-reveal__error">{erreur}</p>}
    </div>
  );
}
