"use client";

import { useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import SectionEditor from "@/components/portal/SectionEditor";
import { PORTAL_SECTIONS } from "@/modules/marketing/lib/portal-sections";

/**
 * Le dossier du client, côté TIM — les MÊMES tableaux que dans son espace.
 *
 * Le même composant, la même validation, la même bibliothèque d'écriture : deux
 * écrans distincts auraient divergé au premier correctif, et l'un aurait accepté
 * ce que l'autre refuse. Seules changent l'adresse appelée et ses règles
 * d'accès — et une colonne réservée, le mot de passe TIM.
 *
 * Ici le dossier reste modifiable même transmis : c'est justement TIM qui
 * corrige après coup, souvent en ayant le client au téléphone.
 */
export function PreparationConsole() {
  const { id } = useDocumentInfo();
  const [busy, setBusy] = useState(false);
  // Plein écran : la vue document de Payload borne la largeur et laisse la
  // colonne de droite. Quatorze colonnes n'y tiennent pas, et l'écran sert
  // justement à recopier ligne à ligne dans un autre logiciel.
  const [fullscreen, setFullscreen] = useState(false);

  // L'état du dossier vit sur la fiche : on le lit dans le formulaire plutôt que
  // de le redemander au serveur, il est déjà là.
  const onboarding = useFormFields(([fields]) => fields.onboardingStatus?.value as string | undefined);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Incrémenté après génération : les tableaux relisent leurs lignes sans que
  // la page bouge — on reste en plein écran, le message de résultat tient.
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Le plein écran retire aussi le CHÂSSIS de l'admin — barre du haut et menu
   * latéral. Un recouvrement seul ne suffit pas : la barre du haut porte le même
   * niveau d'empilement, et selon l'ordre du DOM elle repasse devant. On pose
   * donc une classe sur `body`, que la feuille de styles utilise pour effacer le
   * châssis et bloquer le défilement de la page dessous.
   */
  useEffect(() => {
    const cls = "tim-prep-fullscreen";
    document.body.classList.toggle(cls, fullscreen);
    return () => document.body.classList.remove(cls);
  }, [fullscreen]);

  if (!id) return null;

  const query = `?clientId=${id}`;

  const generate = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/tim-access", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id }),
      });
      const body = (await res.json().catch(() => null)) as { created?: number } | null;
      if (!res.ok) throw new Error();
      setDone(
        body?.created
          ? `${body.created} accès généré${body.created > 1 ? "s" : ""}.`
          : "Tous les utilisateurs ont déjà leurs accès.",
      );
      // Le tableau lit ses lignes au montage : on le refait lire, lui seul.
      setReloadToken((n) => n + 1);
    } catch {
      setError("La génération a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={fullscreen ? "jr-prep jr-prep--full" : "jr-prep"}>
      <div className="jr-prep__bar">
        <p className="jr-prep__hint">
          Cliquez dans une case pour la sélectionner, puis copiez-la vers TIM.
        </p>
        {/* L'ÉTAT du dossier, pas le geste : celui-ci est une étape du parcours
            (« Dossier vérifié par TIM »). Un même fait validé à deux endroits
            finit toujours par diverger — on montre ici, on coche là-bas. */}
        {onboarding === "valide" ? (
          <span className="jr-prep__state jr-prep__state--ok">Dossier vérifié — verrouillé côté client</span>
        ) : (
          <span className="jr-prep__state">
            {onboarding === "transmis"
              ? "Dossier transmis — à vérifier, puis à cocher dans la phase de test"
              : "Dossier en cours de saisie par le client"}
          </span>
        )}

        <button
          type="button"
          className="jr-btn jr-btn--small"
          onClick={() => setFullscreen((v) => !v)}
        >
          {fullscreen ? "Quitter le plein écran" : "Plein écran"}
        </button>
      </div>

      <div className="jr-prep__sections">

      {PORTAL_SECTIONS.map((section) => (
        <section key={section.key} className="jr-prep__block">
          <header className="jr-prep__head">
            <h4 className="jr-prep__title">{section.label}</h4>
            <span className="jr-prep__count">{section.intro}</span>

            {/* Le bouton ne vit que sur les utilisateurs : c'est la seule
                section qui porte des accès. */}
            {section.key === "administrateur" && (
              <button type="button" className="jr-btn jr-btn--small" disabled={busy} onClick={() => void generate()}>
                {busy ? "Génération…" : "Générer les accès manquants"}
              </button>
            )}
          </header>

          <div className="jr-prep__body">
            {section.key === "administrateur" && (done || error) && (
              <p className={done ? "jr-gen__done" : "jr-gen__ko"}>{done ?? error}</p>
            )}
            <SectionEditor
              section={section}
              locked={false}
              endpoint="/api/admin/dossier"
              query={query}
              admin
              reloadToken={reloadToken}
            />
          </div>
        </section>
      ))}
      </div>
    </div>
  );
}
