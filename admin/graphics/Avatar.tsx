"use client";

import { useAuth } from "@payloadcms/ui";
import { useEffect, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Résout l'URL de la photo de profil de l'utilisateur connecté (champ `avatar`
 * → media). Gère les deux cas : avatar déjà peuplé ({ url }) ou simple id (on
 * récupère alors le média via l'API REST). Retourne null si pas de photo.
 */
export function useAvatarUrl(): string | null {
  const { user } = useAuth();
  const avatar = (user as any)?.avatar;
  const [url, setUrl] = useState<string | null>(
    avatar && typeof avatar === "object" ? (avatar.url ?? null) : null,
  );

  useEffect(() => {
    if (!avatar) {
      setUrl(null);
      return;
    }
    if (typeof avatar === "object") {
      setUrl(avatar.url ?? null);
      return;
    }
    let cancelled = false;
    fetch(`/payload-api/media/${avatar}?depth=0`, { credentials: "include" })
      .then((r) => r.json())
      .then((m) => {
        if (!cancelled) setUrl((m?.url as string) ?? null);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [avatar]);

  return url;
}

/** Avatar auto-contenu (cercle) — branché sur `admin.avatar` de Payload.
 *  Affiche la photo de profil si présente, sinon l'initiale du nom/email. */
export default function Avatar() {
  const { user } = useAuth();
  const url = useAvatarUrl();
  const label = ((user as any)?.name || (user as any)?.email || "?") as string;

  return (
    <span className="tim-avatar">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="tim-avatar__img" src={url} alt="" />
      ) : (
        <span className="tim-avatar__initial">{label.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}
