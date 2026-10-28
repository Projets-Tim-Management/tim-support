"use client";

import { useConfig } from "@payloadcms/ui";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useEscape } from "@/core/admin/useEscape";
import { isVideoMedia } from "@/core/lib/media-upload";
import type { ReusedMedia } from "@/modules/editorial/lib/feature-writer";

/**
 * Reprendre une vidéo (ou un GIF, une image) déjà dans la médiathèque, pour
 * illustrer une partie sans redéposer la capture.
 *
 * La recherche porte sur le nom du fichier : les vidéos converties ici portent
 * le nom de leur feature, taper « pointage » retrouve celles de la fiche
 * Pointage. Le ménage à la publication ne supprime jamais un média qu'une
 * autre feature utilise encore (voir hooks/purgeReplacedMedia).
 */

const PAGE = 24;


export function MediaPicker({ onPick, onCancel }: { onPick: (m: ReusedMedia) => void; onCancel: () => void }) {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<ReusedMedia[] | null>(null);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);

  // Les plus récents d'abord ; la frappe relance la recherche après une courte pause.
  useEffect(() => {
    const params = new URLSearchParams({
      limit: String(PAGE),
      page: String(page),
      depth: "0",
      sort: "-createdAt",
      "where[and][0][or][0][mimeType][like]": "video/",
      "where[and][0][or][1][mimeType][like]": "image/",
    });
    if (q.trim()) params.set("where[and][1][filename][like]", q.trim());
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`${api}/media?${params}`, { credentials: "include", signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { docs: [] }))
        .then((res: { docs?: ReusedMedia[]; hasNextPage?: boolean }) => {
          const list = (res.docs ?? []).map(({ id, url, filename, mimeType }) => ({ id, url, filename, mimeType }));
          setDocs((prev) => (page > 1 && prev ? [...prev, ...list] : list));
          setMore(Boolean(res.hasNextPage));
        })
        .catch(() => {});
    }, q ? 250 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [api, q, page]);

  // Échap ferme le choix SEUL, sans atteindre la fenêtre « Rédiger avec Claude ».
  useEscape(onCancel, { top: true });

  return createPortal(
    <div className="vt-overlay">
      <div className="vt" role="dialog" aria-modal="true" aria-label="Reprendre une vidéo existante">
        <header className="vt__head">
          <div>
            <p className="vt__eyebrow">Médiathèque</p>
            <h2 className="vt__title">Reprendre une vidéo existante</h2>
          </div>
          <button type="button" className="ctr-btn ctr-btn--ghost" onClick={onCancel}>
            Annuler
          </button>
        </header>

        <div className="vt__body">
          <input
            className="ctr-input mp__search"
            autoFocus
            value={q}
            placeholder="Nom de la feature ou du fichier (ex. : pointage)"
            aria-label="Rechercher dans la médiathèque"
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          {docs === null ? (
            <p className="vt__help">Chargement…</p>
          ) : docs.length === 0 ? (
            <p className="vt__help">Aucun média ne correspond{q.trim() ? ` à « ${q.trim()} »` : ""}.</p>
          ) : (
            <div className="mp__grid">
              {docs.map((m) => (
                <button key={m.id} type="button" className="mp__tile" onClick={() => onPick(m)} title={m.filename}>
                  <span className="mp__media">
                    {isVideoMedia(m) ? (
                      // Première image seulement ; la vidéo se lit au survol. Toutes
                      // en lecture, la grille téléchargerait chaque vidéo en entier.
                      <video
                        src={m.url ? `${m.url}#t=0.1` : undefined}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                        onMouseLeave={(e) => e.currentTarget.pause()}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt="" loading="lazy" />
                    )}
                  </span>
                  <span className="mp__name">{m.filename}</span>
                </button>
              ))}
            </div>
          )}
          {more && (
            <button type="button" className="ctr-btn mp__more" onClick={() => setPage((p) => p + 1)}>
              Voir plus
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
