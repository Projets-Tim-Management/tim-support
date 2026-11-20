"use client";

import { useEffect, useState } from "react";

/**
 * L'IMAGE PRINCIPALE D'UN ARTICLE (19/11/2026) : la direction la crée dans Claude Design.
 *  1. « Copier le prompt de l'image » : le prompt de la charte, rempli avec la catégorie (la
 *     couleur), le H1, le mot-clé et les points clés de l'article ;
 *  2. « Déposer l'image » : le WebP de Claude Design, avec son texte alternatif et sa légende.
 * Utilisé dans le tiroir et sur la fiche de l'article.
 */
type Info = { url?: string | null; alt?: string | null; width?: number | null; bytes?: number | null; mime?: string | null };

export function ImagePanel({ articleId, canUpload, image, onDone }: { articleId: number | string; canUpload: boolean; image: Info; onDone: () => void }) {
  // Routes Next (app/(frontend)/api/admin/…), pas des endpoints Payload : adresse en « /api », pas « /payload-api ».
  const [prompt, setPrompt] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ url: string; width: number; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const loadPrompt = async () => {
    const res = await fetch(`/api/admin/articles/${articleId}/image-prompt`, { credentials: "include" });
    const out = (await res.json()) as { prompt?: string; suggestions?: { alt: string; caption: string }; error?: string };
    if (!res.ok || !out.prompt) throw new Error(out.error ?? `Erreur ${res.status}`);
    setPrompt(out.prompt);
    // Ne remplace jamais ce que la direction a déjà tapé.
    if (out.suggestions) {
      setAlt((v) => v || out.suggestions!.alt);
      setCaption((v) => v || out.suggestions!.caption);
    }
    return out.prompt;
  };

  // L'aperçu du fichier choisi, et ses dimensions (pour dire s'il sera converti).
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setPreview({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | null | undefined) => {
    setMsg(null);
    if (f && !f.type.startsWith("image/")) {
      setMsg({ text: "Ce fichier n'est pas une image.", ok: false });
      return;
    }
    setFile(f ?? null);
  };

  // Texte alternatif et légende pré-remplis dès l'ouverture (19/11/2026), à corriger si besoin.
  useEffect(() => {
    loadPrompt().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, à l'ouverture
  }, [articleId]);

  const copy = async () => {
    setMsg(null);
    try {
      const p = prompt ?? (await loadPrompt());
      await navigator.clipboard.writeText(p);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    }
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("alt", alt);
      body.append("caption", caption);
      const res = await fetch(`/api/admin/articles/${articleId}/image`, { method: "POST", credentials: "include", body });
      const out = (await res.json().catch(() => ({}))) as { error?: string; scheduledAt?: string | null; converted?: boolean; pendingValidation?: boolean };
      if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`);
      if (out.pendingValidation) setMsg({ text: `Image enregistrée dans la médiathèque WordPress${out.converted ? " (convertie au format de la charte)" : ""}. Elle sera posée sur l'article quand vous validerez le texte.`, ok: true });
      else setMsg({ text: `Image envoyée dans WordPress et posée en image principale${out.converted ? " (convertie au format de la charte)" : ""}.${out.scheduledAt ? ` Publication prévue le ${new Date(out.scheduledAt).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.` : ""}`, ok: true });
      setFile(null);
      onDone();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const issues = [image.width != null && image.width < 1200 ? `${image.width} px de large (1 200 au moins)` : null, image.bytes != null && image.bytes > 200 * 1024 ? `${Math.round(image.bytes / 1024)} Ko (200 au plus)` : null, image.mime && !/webp|avif/.test(image.mime) ? `format ${image.mime.replace("image/", "")} (WebP attendu)` : null, image.url && !image.alt ? "texte alternatif vide" : null].filter(Boolean);
  const conform = Boolean(file && preview && file.type === "image/webp" && preview.width === 1920 && preview.height === 1080 && file.size < 200_000);
  const shownUrl = preview?.url ?? image.url ?? null;
  const altLen = alt.trim().length;

  return (
    <div className="imgp">
      <div className="imgp__grid">
        {/* À gauche : l'image, en 16/9. Glisser-déposer ou clic pour choisir le fichier. */}
        <div className="imgp__visual">
          <label
            className={`imgp__drop${dragging ? " is-drag" : ""}${shownUrl ? " has-img" : ""}${canUpload ? "" : " is-locked"}`}
            onDragOver={(e) => {
              if (!canUpload) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (canUpload) pick(e.dataTransfer.files?.[0]);
            }}
          >
            <input type="file" accept="image/webp,image/*" disabled={busy || !canUpload} onChange={(e) => pick(e.target.files?.[0])} hidden />
            {shownUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local ou médiathèque WordPress */}
                <img src={shownUrl} alt={alt || image.alt || ""} />
                {canUpload && <span className="imgp__change">{file ? "Changer de fichier" : "Remplacer l'image"}</span>}
              </>
            ) : (
              <span className="imgp__placeholder">
                <span className="imgp__icon" aria-hidden>
                  ⬆
                </span>
                <strong>{canUpload ? "Glissez l'image de Claude Design ici" : "Pas encore d'image"}</strong>
                <small>{canUpload ? "ou cliquez pour choisir · WebP 1920 × 1080, moins de 200 Ko" : "Le dépôt s'ouvre une fois l'article rédigé."}</small>
              </span>
            )}
          </label>
          {file && preview ? (
            <p className={`imgp__meta${conform ? " is-ok" : ""}`}>
              {file.name} · {preview.width} × {preview.height} · {Math.round(file.size / 1024)} Ko · {conform ? "✓ conforme à la charte" : "sera converti en WebP 1920 × 1080"}
            </p>
          ) : image.url ? (
            <p className="imgp__meta">{[image.mime?.replace("image/", "").toUpperCase(), image.width ? `${image.width} px` : null, image.bytes ? `${Math.round(image.bytes / 1024)} Ko` : null].filter(Boolean).join(" · ")}</p>
          ) : null}
          {!file && issues.length > 0 && <p className="imgp__issues">À revoir : {issues.join(", ")}.</p>}
        </div>

        {/* À droite : le prompt, puis ce qui accompagne l'image. */}
        <div className="imgp__side">
          <div className="imgp__prompt-box">
            <div>
              <strong>Prompt Claude Design</strong>
              <small>Catégorie, H1, mot-clé et points clés de l'article.</small>
            </div>
            <div className="imgp__prompt-actions">
              <button type="button" className="cdx-btn cdx-btn--primary cdx-btn--sm" onClick={copy}>
                {copied ? "✓ Copié" : "Copier"}
              </button>
              <button
                type="button"
                className="imgp__link"
                onClick={async () => {
                  if (!shown) await loadPrompt().catch((e) => setMsg({ text: String(e), ok: false }));
                  setShown((v) => !v);
                }}
              >
                {shown ? "Masquer" : "Voir"}
              </button>
            </div>
          </div>

          <label className="imgp__field">
            <span>
              Texte alternatif <em className={altLen > 125 ? "is-ko" : ""}>{altLen}/125</em>
            </span>
            <textarea rows={2} value={alt} maxLength={125} disabled={!canUpload} onChange={(e) => setAlt(e.target.value)} />
          </label>
          <label className="imgp__field">
            <span>Légende</span>
            <textarea rows={2} value={caption} disabled={!canUpload} onChange={(e) => setCaption(e.target.value)} />
          </label>

          {canUpload && (
            <div className="imgp__send">
              <small>{!file ? (image.url ? "Image déposée. Pour la changer, glissez un autre fichier." : "Choisissez d'abord le fichier.") : !alt.trim() ? "Le texte alternatif est obligatoire." : "Prêt à envoyer."}</small>
              <button type="button" className="cdx-btn cdx-btn--primary" disabled={!file || !alt.trim() || busy} onClick={upload}>
                {busy ? "Envoi…" : image.url ? "Remplacer dans WordPress" : "Envoyer dans WordPress"}
              </button>
            </div>
          )}
        </div>
      </div>
      {shown && prompt && <pre className="imgp__prompt">{prompt}</pre>}
      {msg && <p className={`cdx-msg${msg.ok ? " is-ok" : " is-ko"}`}>{msg.text}</p>}
    </div>
  );
}
