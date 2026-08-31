"use client";

import {
  Drawer,
  PopupList,
  toast,
  useDocumentInfo,
  useDrawerSlug,
  useModal,
} from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Entrées « JSON » du menu ⋮ d'une fiche feature.
 *
 * Trois gestes autour du même format — celui que l'import relit :
 *   - COPIER, pour coller le JSON dans une conversation ;
 *   - TÉLÉCHARGER, pour en garder le fichier ;
 *   - METTRE À JOUR, pour remettre un JSON retravaillé dans CETTE fiche.
 *
 * Dans le menu plutôt qu'en boutons : ce sont des gestes occasionnels, et deux
 * boutons de plus à côté de « Publier » déplacent l'attention loin de ce qu'on
 * vient faire sur cette page.
 *
 * La mise à jour n'écrase que ce que le JSON contient — les visuels attachés
 * aux parties survivent (voir featureMerge). Elle écrit un BROUILLON : rien ne
 * part en ligne sans relecture.
 */
export function FeatureJsonMenu() {
  const { id } = useDocumentInfo();
  const slug = useDrawerSlug("feature-json");
  const { closeModal, openModal } = useModal();
  const router = useRouter();

  const [colle, setColle] = useState("");
  const [envoi, setEnvoi] = useState(false);

  // Fiche pas encore enregistrée : il n'y a rien à exporter ni à mettre à jour.
  if (id == null) return null;

  const recuperer = async (): Promise<{ json: string; filename: string } | null> => {
    try {
      const res = await fetch(`/payload-api/features/${id}/export`, { credentials: "include" });
      const corps = await res.json().catch(() => null);
      if (!res.ok || typeof corps?.json !== "string") {
        toast.error(corps?.error ?? `Export impossible (erreur ${res.status}).`);
        return null;
      }
      return corps as { json: string; filename: string };
    } catch {
      toast.error("Export impossible : le serveur n'a pas répondu.");
      return null;
    }
  };

  const copier = async () => {
    const out = await recuperer();
    if (!out) return;
    try {
      await navigator.clipboard.writeText(out.json);
      toast.success("JSON copié dans le presse-papier.");
    } catch {
      // Presse-papier refusé (permission, contexte non sécurisé) : on ne laisse
      // pas sans recours.
      toast.error("Copie refusée par le navigateur — utilisez « Télécharger ».");
    }
  };

  const telecharger = async () => {
    const out = await recuperer();
    if (!out) return;
    const url = URL.createObjectURL(new Blob([out.json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = out.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const mettreAJour = async () => {
    const texte = colle.trim();
    if (!texte) return;
    let corps: unknown;
    try {
      corps = JSON.parse(texte);
    } catch {
      // Vérifié ICI plutôt qu'au retour du serveur : l'erreur de collage est la
      // plus fréquente, et la signaler sans aller-retour est plus clair.
      toast.error("Ce n'est pas du JSON valide — vérifiez les accolades.");
      return;
    }

    setEnvoi(true);
    try {
      const res = await fetch(`/payload-api/features/${id}/merge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const rep = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(rep?.error ?? `Mise à jour impossible (erreur ${res.status}).`);
        return;
      }
      const champs = Array.isArray(rep?.champs) ? rep.champs.join(", ") : "";
      toast.success(`Brouillon mis à jour${champs ? ` — ${champs}` : ""}.`);
      setColle("");
      closeModal(slug);
      // La fiche à l'écran porte encore l'ancien contenu : on la relit.
      router.refresh();
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <PopupList.Button onClick={copier}>Copier le JSON</PopupList.Button>
      <PopupList.Button onClick={telecharger}>Télécharger le JSON</PopupList.Button>
      <PopupList.Button onClick={() => openModal(slug)}>
        Mettre à jour depuis un JSON…
      </PopupList.Button>

      <Drawer slug={slug} title="Mettre à jour depuis un JSON">
        <div className="feat-json">
          <p className="feat-json__intro">
            Collez un JSON au format de l&apos;import. <strong>Seuls les champs présents
            sont remplacés</strong> — les visuels déjà attachés aux parties sont conservés,
            et rien n&apos;est supprimé. La fiche est enregistrée en brouillon.
          </p>
          <textarea
            className="feat-json__textarea"
            value={colle}
            onChange={(e) => setColle(e.target.value)}
            placeholder='{ "shortDescription": "…", "parties": [ … ] }'
            spellCheck={false}
            rows={16}
          />
          <div className="feat-json__actions">
            <button
              type="button"
              className="feat-import__copy"
              onClick={mettreAJour}
              disabled={envoi || colle.trim() === ""}
            >
              {envoi ? "Mise à jour…" : "Mettre à jour le brouillon"}
            </button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
