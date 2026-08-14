"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * Génération des accès de test depuis le dossier de démarrage.
 *
 * Le client a déjà déclaré qui utilise TIM et avec quel profil. Retaper ces
 * lignes côté TIM, c'est du temps perdu et une source d'écart entre ce qui a
 * été demandé et ce qui est créé. Le bouton crée les lignes manquantes ; il ne
 * reste qu'à créer les comptes dans l'application et à ajuster les mots de passe.
 */

type Counts = { declared: number; created: number; missing: number; incomplete: number };

export function CredentialsGenerator() {
  const { id } = useDocumentInfo();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/credentials?clientId=${id}`, { credentials: "include" });
      setCounts(res.ok ? await res.json() : null);
    } catch {
      setCounts(null);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id }),
      });
      if (!res.ok) throw new Error();
      await load();
      // Le tableau des accès est un champ `join` : il ne se rafraîchit qu'au
      // rechargement de la fiche.
      window.location.reload();
    } catch {
      setError("La génération a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  if (!id || !counts) return null;

  if (counts.declared === 0) {
    return (
      <p className="jr-prev jr-prev--off">
        Aucun utilisateur déclaré dans le dossier de démarrage. Les accès se génèrent à partir des
        salariés cochés « Accès TIM ».
      </p>
    );
  }

  return (
    <div className="jr-gen">
      <p className="jr-gen__line">
        <strong>{counts.declared}</strong> utilisateur{counts.declared > 1 ? "s" : ""} déclaré
        {counts.declared > 1 ? "s" : ""} dans le dossier ·{" "}
        <strong>{counts.created}</strong> accès créé{counts.created > 1 ? "s" : ""}
        {counts.incomplete > 0 && (
          <>
            {" "}
            · <span className="jr-gen__warn">{counts.incomplete} sans mot de passe</span>
          </>
        )}
      </p>

      {counts.missing > 0 ? (
        <>
          <p className="jr-gen__hint">
            {counts.missing} utilisateur{counts.missing > 1 ? "s" : ""} du dossier n&apos;
            {counts.missing > 1 ? "ont" : "a"} pas encore d&apos;accès. La génération reprend leur
            identité et leur profil, et propose un identifiant et un mot de passe — modifiables.
          </p>
          <button type="button" className="jr-btn" disabled={busy} onClick={() => void generate()}>
            {busy ? "Génération…" : `Générer les ${counts.missing} accès manquants`}
          </button>
        </>
      ) : (
        <p className="jr-gen__hint">
          Tous les utilisateurs déclarés ont leur accès. Complétez les mots de passe avec ceux
          réellement créés dans l&apos;application TIM. L&apos;étape « Provisionnement des accès »
          s&apos;est cochée d&apos;elle-même&nbsp;: rien à valider dans la phase de test.
        </p>
      )}

      {error && <p className="jr-gen__ko">{error}</p>}
    </div>
  );
}
