"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * Dépôt du logo de l'entreprise, depuis l'espace client.
 *
 * Placé dans l'en-tête de l'accueil, à côté du nom de la société : c'est là que
 * le client s'attend à voir sa marque, et là que son absence se remarque. Sans
 * logo, un cadre discret invite à le déposer ; avec, l'image s'affiche et un
 * clic dessus suffit à la remplacer — l'infobulle le dit, un lien « Remplacer »
 * en dessous ne faisait que répéter ce que la vignette permet déjà.
 *
 * Le fichier part vers /api/portal/logo, qui refait tous les contrôles : ni le
 * `accept` ni la taille testée ici ne sont des garanties, ils ne font qu'éviter
 * un aller-retour inutile.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export default function LogoUpload({ url, companyName }: { url?: string | null; companyName?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (file: File) => {
    setError(null);
    if (!TYPES.includes(file.type)) {
      setError("Format accepté : PNG, JPEG, WebP ou SVG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Fichier trop lourd (5 Mo maximum).");
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/portal/logo", { method: "POST", body });
      if (!res.ok) throw new Error();
      // Le logo est lu par la page (Server Component) : c'est elle qu'il faut
      // refaire, pas un état local qui divergerait au prochain chargement.
      router.refresh();
    } catch {
      setError("Le dépôt a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        title={url ? "Remplacer le logo" : "Ajouter votre logo"}
        className={
          url
            ? // Avec un logo : aucun cadre, aucun fond. La boîte épouse l'image
              // au lieu de l'enfermer — c'est la marque du client qu'on montre,
              // pas une vignette de galerie.
              "flex items-center transition hover:opacity-70 disabled:opacity-50"
            : // Sans logo, il faut bien QUELQUE CHOSE à viser : le trait
              // pointillé est ce qui rend la zone cliquable évidente.
              "flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-border bg-white transition hover:border-primary disabled:opacity-50"
        }
      >
        {url ? (
          // Ni hauteur ni largeur imposées : seulement des MAXIMA. Un logo large
          // (le cas courant : 4:1, 5:1) est borné par la largeur et garde sa
          // hauteur ; un logo haut ou carré est borné par la hauteur. Aucun des
          // deux n'est déformé, et aucun ne devient minuscule pour tenir dans un
          // carré qui ne lui allait pas.
          //
          // Balise native et non `next/image` : le fichier vient d'un dépôt
          // client, ses dimensions et son domaine sont inconnus à la compilation.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Logo ${companyName ?? "de l'entreprise"}`}
            className="max-h-24 max-w-[15rem] object-contain"
          />
        ) : (
          <span className="px-2 text-center text-xs font-semibold leading-tight text-muted">
            {busy ? "Envoi…" : "Ajouter votre logo"}
          </span>
        )}
      </button>

      <input
        ref={input}
        type="file"
        accept={TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // On vide le champ : sans ça, redéposer le MÊME fichier après un échec
          // ne déclenche aucun `change` et le bouton semble mort.
          e.target.value = "";
          if (file) void send(file);
        }}
      />

      {error && <p className="max-w-[10rem] text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
