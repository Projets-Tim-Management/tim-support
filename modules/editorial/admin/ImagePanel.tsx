"use client";

import { useConfig } from "@payloadcms/ui";
import { useState } from "react";

import { MOTIFS } from "@/modules/editorial/lib/visual/charte";

/**
 * L'IMAGE PRINCIPALE D'UN ARTICLE (19/11/2026) : la direction la crée dans Claude Design.
 *  1. « Copier le prompt de l'image » : le prompt de la charte, bloc « À REMPLIR » rempli avec
 *     les données de l'article (motif et mots en italique forçables) ;
 *  2. « Déposer l'image » : le WebP de Claude Design, avec son texte alternatif et sa légende.
 * Utilisé dans le tiroir et sur la fiche de l'article.
 */
type Info = { url?: string | null; alt?: string | null; width?: number | null; bytes?: number | null; mime?: string | null };

export function ImagePanel({ articleId, status, canUpload, image, onDone }: { articleId: number | string; status: string; canUpload: boolean; image: Info; onDone: () => void }) {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const [motif, setMotif] = useState("");
  const [italic, setItalic] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const loadPrompt = async () => {
    const q = new URLSearchParams();
    if (motif) q.set("motif", motif);
    if (italic.trim()) q.set("italic", italic.trim());
    const res = await fetch(`${api}/admin/articles/${articleId}/image-prompt?${q}`, { credentials: "include" });
    const out = (await res.json()) as { prompt?: string; suggestions?: { alt: string; caption: string }; error?: string };
    if (!res.ok || !out.prompt) throw new Error(out.error ?? `Erreur ${res.status}`);
    setPrompt(out.prompt);
    if (!alt && out.suggestions) setAlt(out.suggestions.alt);
    if (!caption && out.suggestions) setCaption(out.suggestions.caption);
    return out.prompt;
  };

  const copy = async () => {
    setMsg(null);
    try {
      const p = await loadPrompt();
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
      const res = await fetch(`${api}/admin/articles/${articleId}/image`, { method: "POST", credentials: "include", body });
      const out = (await res.json().catch(() => ({}))) as { error?: string; scheduledAt?: string | null; converted?: boolean };
      if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`);
      setMsg({ text: `Image envoyée dans WordPress et posée en image principale${out.converted ? " (convertie au format de la charte)" : ""}.${out.scheduledAt ? ` Publication prévue le ${new Date(out.scheduledAt).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.` : ""}`, ok: true });
      setFile(null);
      onDone();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const issues = [image.width != null && image.width < 1200 ? `${image.width} px de large (1 200 au moins)` : null, image.bytes != null && image.bytes > 200 * 1024 ? `${Math.round(image.bytes / 1024)} Ko (200 au plus)` : null, image.mime && !/webp|avif/.test(image.mime) ? `format ${image.mime.replace("image/", "")} (WebP attendu)` : null, image.url && !image.alt ? "texte alternatif vide" : null].filter(Boolean);

  return (
    <div className="imgp">
      {image.url ? (
        <div className="imgp__current">
          {/* eslint-disable-next-line @next/next/no-img-element -- aperçu de la médiathèque WordPress */}
          <img src={image.url} alt={image.alt ?? ""} />
          <p className="imgp__meta">
            {[image.mime?.replace("image/", "").toUpperCase(), image.width ? `${image.width} px` : null, image.bytes ? `${Math.round(image.bytes / 1024)} Ko` : null].filter(Boolean).join(" · ")}
            {image.alt ? ` · alt : « ${image.alt} »` : ""}
          </p>
          {issues.length > 0 && <p className="imgp__issues">À revoir : {issues.join(", ")}.</p>}
        </div>
      ) : (
        <p className="imgp__empty">Pas encore d'image principale.</p>
      )}

      <div className="imgp__step">
        <strong>1. Créer l'image dans Claude Design</strong>
        <div className="imgp__row">
          <label>
            <span>Motif</span>
            <select value={motif} onChange={(e) => setMotif(e.target.value)}>
              <option value="">Auto (règle de la charte)</option>
              {MOTIFS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Mots en italique</span>
            <input value={italic} placeholder="Passage exact du titre, sinon le mot-clé" onChange={(e) => setItalic(e.target.value)} />
          </label>
        </div>
        <div className="imgp__row">
          <button type="button" className="cdx-btn cdx-btn--primary cdx-btn--sm" onClick={copy}>
            {copied ? "✓ Prompt copié" : "📋 Copier le prompt de l'image"}
          </button>
          <button
            type="button"
            className="cdx-btn cdx-btn--ghost cdx-btn--sm"
            onClick={async () => {
              if (!shown) await loadPrompt().catch((e) => setMsg({ text: String(e), ok: false }));
              setShown((v) => !v);
            }}
          >
            {shown ? "Masquer" : "Voir le prompt"}
          </button>
        </div>
        {shown && prompt && <pre className="imgp__prompt">{prompt}</pre>}
      </div>

      <div className="imgp__step">
        <strong>2. Déposer l'image</strong>
        {canUpload ? (
          <>
            <label className="imgp__field">
              <span>Fichier WebP de Claude Design</span>
              <input type="file" accept="image/webp,image/*" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <label className="imgp__field">
              <span>Texte alternatif ({alt.trim().length}/125)</span>
              <input value={alt} maxLength={125} placeholder="Celui que donne Claude Design" onChange={(e) => setAlt(e.target.value)} />
            </label>
            <label className="imgp__field">
              <span>Légende</span>
              <input value={caption} placeholder="Celle que donne Claude Design" onChange={(e) => setCaption(e.target.value)} />
            </label>
            <button type="button" className="cdx-btn cdx-btn--primary cdx-btn--sm" disabled={!file || !alt.trim() || busy} onClick={upload}>
              {busy ? "Envoi…" : image.url ? "Remplacer l'image dans WordPress" : "Envoyer l'image dans WordPress"}
            </button>
          </>
        ) : (
          <p className="imgp__empty">{status === "a-relire" ? "Le dépôt s'ouvre après « Valider le texte » (le brouillon WordPress doit exister)." : "Le dépôt s'ouvre une fois le texte validé."}</p>
        )}
      </div>
      {msg && <p className={`cdx-msg${msg.ok ? " is-ok" : " is-ko"}`}>{msg.text}</p>}
    </div>
  );
}
