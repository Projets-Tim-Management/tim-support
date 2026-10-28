"use client";

import { toast, useConfig, useDocumentInfo } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useEscape } from "@/core/admin/useEscape";
import { formatOctets, isVideoMedia, uploadFile } from "@/core/lib/media-upload";
import { convertToLoop, extractFrames, imageToFrame, isVideoFile, type LoopFormat } from "@/core/lib/video-loop";
import {
  MAX_FRAMES,
  assignVideo,
  framesPerStep,
  keepReused,
  reuseMedia,
  withoutReused,
  type ReusedMedia,
  type WrittenFeature,
} from "@/modules/editorial/lib/feature-writer";
import { MediaPicker } from "@/modules/editorial/admin/MediaPicker";
import { ProfilePills } from "@/modules/editorial/admin/ProfilesField";
import { extOf, featureMediaName } from "@/modules/editorial/lib/media-name";
import { VideoTrimmer } from "@/admin/fields/VideoTrimmer";
import type { Range } from "@/core/lib/video-trim";

/**
 * « Rédiger avec Claude » — une fiche neuve ou mise à jour, en quatre temps :
 *
 *   1. Indications : ce qu'est la fonctionnalité (ou ce qui a changé), où elle
 *      se range, pour qui ;
 *   2. Vidéos : une capture par étape, convertie ici en courte vidéo en boucle ;
 *   3. Rédaction : Claude regarde quelques images de chaque vidéo (15 en tout)
 *      et écrit la fiche ;
 *   4. Vérification : tout se relit et se corrige ; valider enregistre la fiche
 *      EN BROUILLON avec ses vidéos, rien n'est publié.
 *
 * Remplace l'aller-retour par Claude Desktop. Les vidéos ne partent sur le CDN
 * qu'à la validation : abandonner en route ne laisse aucun fichier orphelin.
 */

type Opt = { id: number | string; label: string };
type Step = {
  key: string;
  caption: string;
  original: File;
  /** La vidéo convertie (MP4 en boucle) ; une image déposée part telle quelle. */
  output: File | null;
  format: LoopFormat | null;
  status: string | null;
  /** Conversion ou chargement en cours : on attend avant de rédiger. */
  busy?: boolean;
  /** Les images déjà montrées à Claude, par nombre demandé : une réécriture les réutilise telles quelles. */
  frames?: { per: number; list: string[] };
  error: string | null;
  preview: string | null;
  /** Les images retirées à la retouche, pour rouvrir l'éditeur là où on l'a laissé. */
  removed: Set<number>;
  /** Reprise de la médiathèque : déjà sur le CDN, rien à renvoyer (tant qu'on ne la retouche pas). */
  existing?: ReusedMedia;
};

const STEPS = ["Indications", "Vidéos", "Rédaction", "Vérification"] as const;
let seq = 0;
const key = () => `s${(seq += 1)}`;

export function FeatureWriter({
  mode: initialMode,
  featureId: initialFeatureId,
  onClose,
}: {
  mode: "new" | "update";
  featureId?: number | string | null;
  onClose: () => void;
}) {
  const {
    config: {
      routes: { api, admin },
    },
  } = useConfig();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState(initialMode);
  const [featureId, setFeatureId] = useState<number | string | null>(initialFeatureId ?? null);
  const [features, setFeatures] = useState<Opt[]>([]);
  const [platforms, setPlatforms] = useState<Opt[]>([]);
  const [sections, setSections] = useState<Opt[]>([]);

  const [notes, setNotes] = useState("");
  const [platformIds, setPlatformIds] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [profiles, setProfiles] = useState<string[]>([]);
  const [videos, setVideos] = useState<Step[]>([]);

  const [writing, setWriting] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [draft, setDraft] = useState<WrittenFeature | null>(null);
  const [cost, setCost] = useState<number>(0);
  /** Mise à jour : nombre de parties déjà sur la fiche (celles-là ne se retirent pas d'ici). */
  const [existingParts, setExistingParts] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  /** La partie pour laquelle on choisit une vidéo dans la médiathèque. */
  const [picking, setPicking] = useState<number | null>(null);
  /** Le choix d'une vidéo de la médiathèque comme étape (écran « Vidéos »). */
  const [pickingStep, setPickingStep] = useState(false);
  /** La retouche en cours : la capture, les images déjà retirées, et la promesse qui attend le choix. */
  const [trimming, setTrimming] = useState<{
    file: File;
    removed: Set<number>;
    resolve: (r: { keep: Range[]; removed: Set<number> } | null) => void;
  } | null>(null);
  const askTrim = (file: File, removed: Set<number>) =>
    new Promise<{ keep: Range[]; removed: Set<number> } | null>((resolve) => setTrimming({ file, removed, resolve }));
  const videosRef = useRef<Step[]>([]);
  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);
  // Les aperçus (URL locales) libérés à la fermeture.
  useEffect(() => () => videosRef.current.forEach((v) => v.preview && URL.revokeObjectURL(v.preview)), []);

  // Listes : plateformes, sections (sans les racines Web / Mobile), features.
  useEffect(() => {
    const get = (path: string) =>
      fetch(`${api}${path}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : { docs: [] }));
    void Promise.all([
      get("/platforms?limit=50&depth=0"),
      get("/feature-categories?limit=1000&depth=0&sort=sortKey&where[parent][exists]=true"),
      get("/features?limit=1000&depth=0&sort=title&draft=true&select[title]=true"),
    ]).then(([p, c, f]) => {
      setPlatforms((p.docs ?? []).map((d: { id: number; name: string }) => ({ id: d.id, label: d.name })));
      setSections(
        (c.docs ?? []).map((d: { id: number; pathTitle?: string; name: string }) => ({
          id: d.id,
          label: d.pathTitle || d.name,
        })),
      );
      setFeatures((f.docs ?? []).map((d: { id: number; title: string }) => ({ id: d.id, label: d.title })));
    });
  }, [api]);

  // Mise à jour : le classement actuel de la fiche, prérempli.
  useEffect(() => {
    if (mode !== "update" || featureId == null) return;
    fetch(`${api}/features/${featureId}?depth=0&draft=true`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { platforms?: unknown[]; categories?: unknown[]; profiles?: string[] } | null) => {
        if (!d) return;
        const idOf = (v: unknown) => String(v && typeof v === "object" ? (v as { id: unknown }).id : v);
        setPlatformIds((d.platforms ?? []).map(idOf));
        setCategoryId(d.categories?.length ? idOf(d.categories[d.categories.length - 1]) : "");
        setProfiles(d.profiles ?? []);
      })
      .catch(() => undefined);
  }, [api, mode, featureId]);

  // ── Étape 2 : les vidéos ───────────────────────────────────────────────────
  const patch = (k: string, p: Partial<Step>) => setVideos((list) => list.map((v) => (v.key === k ? { ...v, ...p } : v)));

  /** Convertit la capture d'une étape, avec les passages gardés à la retouche. */
  const convert = async (k: string, file: File, keep: Range[], removed: Set<number>) => {
    try {
      patch(k, { status: "Conversion… 0 %", busy: true, error: null, removed });
      const out = await convertToLoop(file, (x) => patch(k, { status: `Conversion… ${Math.round(x * 100)} %` }), keep);
      const mp4 = new File([out.blob], "capture.mp4", { type: "video/mp4" });
      setVideos((list) =>
        list.map((v) => {
          if (v.key !== k) return v;
          if (v.preview) URL.revokeObjectURL(v.preview);
          return {
            ...v,
            // Retouchée, la vidéo reprise devient une vidéo neuve : elle sera envoyée.
            existing: undefined,
            frames: undefined,
            busy: false,
            output: mp4,
            format: out.format,
            preview: URL.createObjectURL(out.blob),
            status: `Vidéo ${out.format} ${out.width} × ${out.height} · ${formatOctets(out.blob.size)}${
              removed.size ? ` · ${removed.size} image${removed.size > 1 ? "s" : ""} retirée${removed.size > 1 ? "s" : ""}` : ""
            }`,
          };
        }),
      );
    } catch (e) {
      patch(k, { status: null, busy: false, error: (e as Error).message });
    }
  };

  const addFiles = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      const s: Step = {
        key: key(),
        caption: "",
        original: file,
        output: null,
        format: null,
        status: null,
        error: null,
        preview: null,
        removed: new Set(),
      };
      if (!isVideoFile(file)) {
        // Image ou GIF : déposé tel quel, Claude en voit la première image.
        setVideos((list) => [...list, { ...s, output: file, preview: URL.createObjectURL(file) }]);
        continue;
      }
      // D'abord la retouche ; « Annuler » n'ajoute pas l'étape.
      const trim = await askTrim(file, s.removed);
      if (!trim) continue;
      setVideos((list) => [...list, s]);
      await convert(s.key, file, trim.keep, trim.removed);
    }
  };

  /**
   * Une vidéo déjà dans la médiathèque, prise comme étape : téléchargée ici pour
   * que Claude en voie des images, puis posée telle quelle à la validation.
   */
  const addExisting = async (m: ReusedMedia) => {
    const s: Step = {
      key: key(),
      caption: "",
      original: new File([], m.filename ?? "media"),
      output: null,
      format: null,
      status: "Chargement depuis la médiathèque…",
      busy: true,
      error: null,
      preview: null,
      removed: new Set(),
      existing: m,
    };
    setVideos((list) => [...list, s]);
    try {
      if (!m.url) throw new Error("adresse inconnue");
      // Cookies seulement vers le site lui-même : le CDN répond
      // « Access-Control-Allow-Origin: * », qui refuse une requête avec cookies.
      const r = await fetch(m.url, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`erreur ${r.status}`);
      const blob = await r.blob();
      const file = new File([blob], m.filename ?? "media", { type: m.mimeType || blob.type });
      setVideos((list) =>
        list.map((v) =>
          v.key === s.key
            ? {
                ...v,
                original: file,
                output: file,
                preview: URL.createObjectURL(file),
                status: `Reprise de la médiathèque · ${formatOctets(blob.size)}`,
                busy: false,
              }
            : v,
        ),
      );
    } catch (e) {
      patch(s.key, { status: null, busy: false, error: `Vidéo illisible depuis la médiathèque (${(e as Error).message}).` });
    }
  };

  /** Rouvrir la retouche d'une étape déjà convertie. */
  const retouch = async (v: Step) => {
    const trim = await askTrim(v.original, v.removed);
    if (trim) await convert(v.key, v.original, trim.keep, trim.removed);
  };

  const move = (k: string, d: -1 | 1) =>
    setVideos((list) => {
      const i = list.findIndex((v) => v.key === k);
      const j = i + d;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // ── Étape 3 : la rédaction ─────────────────────────────────────────────────
  const write = async (previous?: WrittenFeature | null) => {
    setWriting("Préparation des images…");
    setWriteError(null);
    try {
      const ready = videos.filter((v) => v.output);
      const per = framesPerStep(ready.length);
      const steps = [];
      for (const [i, v] of ready.entries()) {
        // Déjà lues pour ce nombre d'images : une réécriture ne relit pas les vidéos.
        let frames = v.frames?.per === per ? v.frames.list : null;
        if (!frames) {
          setWriting(`Lecture de la vidéo ${i + 1} sur ${ready.length}…`);
          frames = isVideoFile(v.original) ? await extractFrames(v.output!, per) : [await imageToFrame(v.original)];
          patch(v.key, { frames: { per, list: frames } });
        }
        steps.push({ caption: v.caption, frames });
      }
      setWriting("Claude rédige la fiche… (une vingtaine de secondes)");
      const res = await fetch("/api/admin/features/write", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          featureId,
          notes,
          platformIds,
          categoryIds: categoryId ? [categoryId] : [],
          profiles,
          steps,
          previous: previous ? withoutReused(previous) : undefined,
          instruction: previous ? instruction : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        feature?: WrittenFeature;
        costEur?: number;
        existingParts?: number;
        error?: string;
      } | null;
      if (!res.ok || !data?.feature) throw new Error(data?.error || "La rédaction a échoué.");
      // Une vidéo par partie : déjà garanti par le serveur (oneVideoPerPart).
      const parties = data.feature.parties;
      setDraft({ ...data.feature, parties: previous ? keepReused(parties, previous.parties) : parties });
      setExistingParts(mode === "update" ? (data.existingParts ?? 0) : 0);
      setCost((c) => c + (data.costEur ?? 0));
      setInstruction("");
      setStep(3);
    } catch (e) {
      setWriteError((e as Error).message);
    } finally {
      setWriting(null);
    }
  };

  // ── Étape 4 : la validation ────────────────────────────────────────────────
  const editPart = (i: number, p: Partial<WrittenFeature["parties"][number]>) =>
    setDraft((d) => (d ? { ...d, parties: d.parties.map((x, j) => (j === i ? { ...x, ...p } : x)) } : d));

  const save = async () => {
    if (!draft) return;
    setSaving("Envoi des vidéos…");
    try {
      const ready = videos.filter((v) => v.output);
      const uploaded = new Map<number, number | string>();
      const media: { part: number; mediaId: number | string }[] = [];
      for (const [i, part] of draft.parties.entries()) {
        if (part.existing) {
          // Repris de la médiathèque : déjà sur le CDN, rien à envoyer.
          media.push({ part: i, mediaId: part.existing.id });
          continue;
        }
        const n = part.video;
        const v = n > 0 ? ready[n - 1] : null;
        if (!v?.output) continue;
        if (v.existing) uploaded.set(n, v.existing.id);
        if (!uploaded.has(n)) {
          setSaving(`Envoi de la vidéo ${n}…`);
          const ext = v.output.type === "video/mp4" ? "mp4" : extOf(v.output.name) || "png";
          const name = featureMediaName({ title: draft.title, path: `doc.${i}.mediaDoc.0.image`, ext, format: v.format });
          const envoi = await uploadFile(new File([v.output], name, { type: v.output.type }));
          if (!envoi.ok) throw new Error(`Vidéo ${n} : ${envoi.message}`);
          uploaded.set(n, envoi.doc.id);
        }
        media.push({ part: i, mediaId: uploaded.get(n)! });
      }
      setSaving("Enregistrement de la fiche…");
      const res = await fetch("/api/admin/features/write/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          featureId,
          feature: draft,
          platformIds,
          categoryIds: categoryId ? [categoryId] : [],
          profiles,
          media,
        }),
      });
      const data = (await res.json().catch(() => null)) as { id?: number | string; error?: string } | null;
      if (!res.ok || data?.id == null) throw new Error(data?.error || "Enregistrement impossible.");
      toast.success("Fiche enregistrée en brouillon : relisez-la, puis publiez.");
      onClose();
      const url = `${admin}/collections/features/${data.id}`;
      if (mode === "update" && String(data.id) === String(initialFeatureId)) window.location.reload();
      else router.push(url);
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(null);
    }
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  // Une conversion ou un chargement depuis la médiathèque en cours : on attend avant de rédiger.
  const converting = videos.some((v) => v.busy);
  const canNext =
    step === 0
      ? (mode === "new" || featureId != null) && notes.trim().length > 0
      : step === 1
        ? !converting
        : false;

  const go = (next: number) => {
    if (next === 2) {
      setStep(2);
      void write();
      return;
    }
    setStep(next);
  };

  const close = () => {
    if ((draft || videos.length) && !saving && !window.confirm("Fermer sans enregistrer ? La rédaction sera perdue.")) return;
    onClose();
  };

  const ready = videos.filter((v) => v.output);
  const busy = Boolean(writing || saving);
  useEscape(close);

  // Une FENÊTRE au-dessus de la liste ou de la fiche, pas une page entière : on
  // garde sous les yeux l'endroit d'où l'on vient. Le fond ne ferme pas (un clic
  // à côté perdrait la rédaction) ; Échap et « Fermer » demandent confirmation.
  return createPortal(
    <div className="fw-overlay">
    <div className="ctr-editor fw" role="dialog" aria-modal="true" aria-label="Rédiger avec Claude">
      <header className="ctr-editor__head">
        <div className="ctr-editor__who">
          <p className="ctr-editor__eyebrow">Rédiger avec Claude</p>
          <h2 className="ctr-editor__title">
            {mode === "new" ? "Nouvelle feature" : (features.find((f) => String(f.id) === String(featureId))?.label ?? "Mise à jour d'une feature")}
          </h2>
        </div>
        <ol className="ctr-stepper">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                className={`ctr-stepper__step${i === step ? " is-current" : ""}${i < step ? " is-done" : ""}`}
                // On revient en arrière librement ; on n'avance que par « Suivant ».
                disabled={busy || i > step || (i === 2 && !draft)}
                onClick={() => setStep(i === 2 ? 3 : i)}
              >
                <span className="ctr-stepper__num">{i < step ? "✓" : i + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
        <div className="ctr-editor__actions">
          {cost > 0 && <span className="fw-cost">Coût : {cost.toFixed(2).replace(".", ",")} €</span>}
          <button type="button" className="ctr-btn ctr-btn--ghost" onClick={close} disabled={Boolean(saving)}>
            Fermer
          </button>
        </div>
      </header>

      <div className="ctr-editor__scroll">
        <div className="ctr-step fw-step">
          {step === 0 && (
            <>
              {initialMode === "new" && (
                <div className="fw-mode" role="group" aria-label="Nouvelle feature ou mise à jour">
                  <button type="button" className={`fw-mode__btn${mode === "new" ? " is-active" : ""}`} onClick={() => setMode("new")}>
                    <strong>Nouvelle feature</strong>
                    <span>Une fonctionnalité qui n'a pas encore de fiche.</span>
                  </button>
                  <button type="button" className={`fw-mode__btn${mode === "update" ? " is-active" : ""}`} onClick={() => setMode("update")}>
                    <strong>Mise à jour</strong>
                    <span>Une fiche existante à compléter ou corriger.</span>
                  </button>
                </div>
              )}
              {initialMode === "new" && mode === "new" && (
                <p className="fw-manual">
                  Vous préférez tout écrire vous-même ?{" "}
                  {/* `data-manual` : ce lien-ci n'est pas détourné vers la fenêtre (voir FeatureWriterLauncher). */}
                  <a href={`${admin}/collections/features/create`} data-manual="">
                    Créer la fiche à la main, sans Claude
                  </a>
                </p>
              )}
              <section className="ctr-card">
                {mode === "update" && initialMode === "new" && (
                  <label className="ctr-field">
                    <span className="ctr-field__label">Quelle fiche ?</span>
                    <select className="ctr-input" value={featureId ?? ""} onChange={(e) => setFeatureId(e.target.value || null)}>
                      <option value="">Choisir une feature…</option>
                      {features.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="ctr-field fw-notes">
                  <span className="ctr-field__label">
                    {mode === "new" ? "Ce qu'est la nouvelle fonctionnalité" : "Ce qui a changé"}
                  </span>
                  <textarea
                    className="ctr-input"
                    rows={5}
                    autoFocus
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      mode === "new"
                        ? "Ex. : Le compagnon peut désormais pointer plusieurs chantiers dans la même journée depuis l'app mobile. On choisit le chantier, puis l'heure d'arrivée."
                        : "Ex. : Le bouton « Valider » s'appelle maintenant « Envoyer », et on peut ajouter une photo avant d'envoyer."
                    }
                  />
                  <span className="ctr-field__hint">Une ou deux phrases suffisent : les vidéos montreront le reste.</span>
                </label>
              </section>
              <section className="ctr-card">
                <h3 className="ctr-card__title">Classement</h3>
                <div className="ctr-grid">
                  <div className="ctr-field">
                    <span className="ctr-field__label">Plateformes</span>
                    <div className="fw-checks">
                      {platforms.map((p) => (
                        <label key={p.id} className="ctr-check">
                          <input
                            type="checkbox"
                            checked={platformIds.includes(String(p.id))}
                            onChange={(e) =>
                              setPlatformIds((l) => (e.target.checked ? [...l, String(p.id)] : l.filter((x) => x !== String(p.id))))
                            }
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="ctr-field">
                    <span className="ctr-field__label">Section</span>
                    <select className="ctr-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                      <option value="">Choisir une section…</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="ctr-field fw-profiles">
                  <span className="ctr-field__label">Pour qui ? (rien coché = tout le monde)</span>
                  <ProfilePills value={profiles} onChange={setProfiles} />
                </div>
              </section>
            </>
          )}

          {step === 1 && (
            <>
              <p className="ctr-intro">
                Une capture par étape, dans l&apos;ordre. Chacune est convertie ici en courte vidéo en boucle et posée dans
                sa partie de la fiche. Claude en regarde {ready.length ? framesPerStep(ready.length) : MAX_FRAMES} image
                {framesPerStep(Math.max(1, ready.length)) > 1 ? "s" : ""} chacune ({MAX_FRAMES} au total).
              </p>
              {videos.map((v, i) => (
                <section key={v.key} className="ctr-card fw-video">
                  <div className="fw-video__media">
                    {v.preview ? (
                      isVideoFile(v.original) ? (
                        <video src={v.preview} muted autoPlay loop playsInline />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.preview} alt="" />
                      )
                    ) : (
                      <span className="fw-video__wait">{v.error ? "⚠️" : "…"}</span>
                    )}
                  </div>
                  <div className="fw-video__body">
                    <p className="fw-video__title">Vidéo {i + 1} — ce qu&apos;on y fait</p>
                    <input
                      className={`ctr-input${v.caption.trim() ? "" : " fw-caption--empty"}`}
                      value={v.caption}
                      placeholder="Ex. : choisir le chantier, puis valider l'heure d'arrivée"
                      onChange={(e) => patch(v.key, { caption: e.target.value })}
                    />
                    {ready.length > 1 && !v.caption.trim() && (
                      <p className="fw-video__hint">Précisez-le : c&apos;est ce qui place la vidéo dans la bonne étape de la fiche.</p>
                    )}
                    <p className={`fw-video__state${v.error ? " is-error" : ""}`}>{v.error ?? v.status ?? v.original.name}</p>
                  </div>
                  <div className="fw-video__tools">
                    {isVideoFile(v.original) && (
                      <button
                        type="button"
                        className="ctr-link"
                        disabled={!v.output || v.busy}
                        onClick={() => void retouch(v)}
                      >
                        ✂️ Retoucher
                      </button>
                    )}
                    <button type="button" className="ctr-link" onClick={() => move(v.key, -1)} disabled={i === 0} aria-label="Monter">
                      ↑
                    </button>
                    <button type="button" className="ctr-link" onClick={() => move(v.key, 1)} disabled={i === videos.length - 1} aria-label="Descendre">
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ctr-link ctr-link--danger"
                      onClick={() => setVideos((l) => l.filter((x) => x.key !== v.key))}
                    >
                      Retirer
                    </button>
                  </div>
                </section>
              ))}
              <label className="fw-drop">
                <input
                  type="file"
                  accept="video/*,.mov,image/*"
                  multiple
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <strong>{videos.length ? "+ Ajouter une étape" : "Déposer les captures vidéo"}</strong>
                <span>.mov, .mp4 — ou une image / un GIF. Plusieurs à la fois si besoin, dans l&apos;ordre des étapes.</span>
              </label>
              <button type="button" className="ctr-link fw-pick" onClick={() => setPickingStep(true)}>
                Ou reprendre une vidéo déjà dans la médiathèque…
              </button>
              {!videos.length && (
                <p className="ctr-muted">Pas de vidéo ? Passez à la suite : Claude rédigera à partir de vos indications seules.</p>
              )}
            </>
          )}

          {step === 2 && (
            <div className="fw-writing">
              {writing ? (
                <p className="fw-writing__state">{writing}</p>
              ) : writeError ? (
                <>
                  <p className="fw-writing__error">{writeError}</p>
                  <button type="button" className="ctr-btn ctr-btn--primary" onClick={() => void write()}>
                    Relancer la rédaction
                  </button>
                </>
              ) : null}
            </div>
          )}

          {step === 3 && draft && (
            <>
              {(() => {
                // Les vidéos qui ne sont placées nulle part : à rattacher, ou volontairement laissées.
                const unused = ready
                  .map((v, n) => ({ v, n: n + 1 }))
                  .filter(({ n }) => !draft.parties.some((p) => p.video === n));
                return unused.length ? (
                  <p className="fw-unused">
                    {unused.length === 1 ? "Une vidéo n'est rattachée" : `${unused.length} vidéos ne sont rattachées`} à
                    aucune partie :{" "}
                    {unused.map(({ v, n }) => `vidéo ${n}${v.caption.trim() ? ` (${v.caption.trim()})` : ""}`).join(", ")}.
                    Choisissez sa partie ci-dessous, ou laissez-la de côté : elle ne sera pas envoyée.
                  </p>
                ) : null;
              })()}
              <section className="ctr-card">
                <div className="ctr-grid">
                  <label className="ctr-field">
                    <span className="ctr-field__label">Titre</span>
                    <input className="ctr-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                  </label>
                  <label className="ctr-field">
                    <span className="ctr-field__label">Mots-clés (séparés par des virgules)</span>
                    <input
                      className="ctr-input"
                      value={draft.keywords.join(", ")}
                      onChange={(e) => setDraft({ ...draft, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
                    />
                  </label>
                </div>
                <label className="ctr-field fw-notes">
                  <span className="ctr-field__label">Résumé</span>
                  <textarea
                    className="ctr-input"
                    rows={2}
                    value={draft.shortDescription}
                    onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })}
                  />
                </label>
                <label className="ctr-field fw-notes">
                  <span className="ctr-field__label">Introduction</span>
                  <textarea className="ctr-input" rows={4} value={draft.intro} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} />
                </label>
              </section>

              {draft.parties.map((p, i) => {
                const v = p.video > 0 ? ready[p.video - 1] : null;
                const reused = p.existing;
                return (
                  <section key={i} className="ctr-card fw-part">
                    <div className="fw-part__text">
                      <div className="fw-part__head">
                        <span className="ctr-field__label">
                          Partie {i + 1}
                          {mode === "update" && i >= existingParts && <em className="ctr-tag ctr-tag--amber">Nouvelle</em>}
                        </span>
                        {i >= existingParts ? (
                          <button
                            type="button"
                            className="ctr-link ctr-link--danger"
                            onClick={() => setDraft({ ...draft, parties: draft.parties.filter((_, j) => j !== i) })}
                          >
                            Supprimer cette partie
                          </button>
                        ) : (
                          // Une partie déjà sur la fiche : la retirer d'ici décalerait la fusion
                          // (rapprochement par rang). Elle se supprime dans la fiche elle-même.
                          <span className="fw-part__keep" title="Pour la supprimer : dans la fiche, menu ⋯ de la partie → Supprimer.">
                            Partie existante
                          </span>
                        )}
                      </div>
                      <input
                        className="ctr-input"
                        aria-label={`Titre de la partie ${i + 1}`}
                        value={p.titre}
                        onChange={(e) => editPart(i, { titre: e.target.value })}
                      />
                      <textarea
                        className="ctr-input fw-part__desc"
                        rows={7}
                        value={p.description}
                        onChange={(e) => editPart(i, { description: e.target.value })}
                      />
                    </div>
                    <div className="fw-part__media">
                      {reused ? (
                        isVideoMedia(reused) ? (
                          <video src={reused.url} muted autoPlay loop playsInline />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={reused.url} alt="" />
                        )
                      ) : v?.preview ? (
                        isVideoFile(v.original) ? (
                          <video src={v.preview} muted autoPlay loop playsInline />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.preview} alt="" />
                        )
                      ) : (
                        <span className="fw-video__wait">Sans visuel</span>
                      )}
                      {reused && (
                        <p className="fw-part__reused" title={reused.filename}>
                          Reprise de la médiathèque : {reused.filename}
                        </p>
                      )}
                      <select
                        className="ctr-input"
                        value={reused ? -1 : p.video}
                        aria-label={`Vidéo de la partie ${i + 1}`}
                        // Choisir une vidéo déjà placée la DÉPLACE ici : une vidéo n'illustre qu'une partie.
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (n < 0) return;
                          const parties = n === 0 ? reuseMedia(draft.parties, i, null) : draft.parties;
                          setDraft({ ...draft, parties: assignVideo(parties, i, n) });
                        }}
                      >
                        {reused && <option value={-1}>Vidéo de la médiathèque</option>}
                        <option value={0}>Aucune vidéo</option>
                        {ready.map((rv, n) => {
                          const elsewhere = draft.parties.findIndex((x, j) => j !== i && x.video === n + 1);
                          return (
                            <option key={n} value={n + 1}>
                              Vidéo {n + 1}
                              {rv.caption.trim() ? ` — ${rv.caption.trim()}` : ""}
                              {elsewhere >= 0 ? ` (partie ${elsewhere + 1})` : ""}
                            </option>
                          );
                        })}
                      </select>
                      <div className="fw-part__links">
                        <button type="button" className="ctr-link" onClick={() => setPicking(i)}>
                          {reused ? "Choisir une autre vidéo existante…" : "Reprendre une vidéo existante…"}
                        </button>
                        {(p.video > 0 || reused) && (
                          <button
                            type="button"
                            className="ctr-link"
                            onClick={() =>
                              setDraft({ ...draft, parties: assignVideo(reuseMedia(draft.parties, i, null), i, 0) })
                            }
                          >
                            Retirer la vidéo de cette partie
                          </button>
                        )}
                      </div>
                      <select
                        className="ctr-input"
                        value={p.mediaPosition}
                        onChange={(e) => editPart(i, { mediaPosition: e.target.value as "droite" | "gauche" })}
                      >
                        <option value="droite">Visuel à droite</option>
                        <option value="gauche">Visuel à gauche</option>
                      </select>
                    </div>
                  </section>
                );
              })}

              <section className="ctr-card fw-redo">
                <label className="ctr-field">
                  <span className="ctr-field__label">Demander une correction à Claude</span>
                  <input
                    className="ctr-input"
                    value={instruction}
                    placeholder="Ex. : plus court, et précise qu'il faut être chef d'équipe pour valider"
                    onChange={(e) => setInstruction(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="ctr-btn"
                  disabled={!instruction.trim() || busy}
                  onClick={() => {
                    setStep(2);
                    void write(draft);
                  }}
                >
                  Réécrire
                </button>
              </section>
            </>
          )}
        </div>
      </div>

      {pickingStep && (
        <MediaPicker
          onCancel={() => setPickingStep(false)}
          onPick={(m) => {
            setPickingStep(false);
            void addExisting(m);
          }}
        />
      )}

      {picking !== null && draft && (
        <MediaPicker
          onCancel={() => setPicking(null)}
          onPick={(m) => {
            setDraft({ ...draft, parties: reuseMedia(draft.parties, picking, m) });
            setPicking(null);
          }}
        />
      )}

      {trimming && (
        <VideoTrimmer
          file={trimming.file}
          initialRemoved={trimming.removed}
          onCancel={() => {
            trimming.resolve(null);
            setTrimming(null);
          }}
          onDone={(r) => {
            trimming.resolve(r);
            setTrimming(null);
          }}
        />
      )}

      <footer className="ctr-editor__foot">
        {step > 0 && step !== 2 ? (
          <button type="button" className="ctr-btn ctr-btn--ghost" onClick={() => setStep(step === 3 ? 1 : step - 1)} disabled={busy}>
            ← {step === 3 ? "Vidéos" : STEPS[step - 1]}
          </button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <button type="button" className="ctr-btn ctr-btn--primary" onClick={() => go(step + 1)} disabled={!canNext || busy}>
            {step === 1 ? "Rédiger avec Claude →" : `Suivant : ${STEPS[step + 1]} →`}
          </button>
        ) : step === 3 ? (
          <button type="button" className="ctr-btn ctr-btn--primary" onClick={() => void save()} disabled={busy || !draft?.title.trim()}>
            {saving ?? "Valider et enregistrer en brouillon"}
          </button>
        ) : (
          <span />
        )}
      </footer>
    </div>
    </div>,
    document.body,
  );
}

/** Le bouton de la liste des features : nouvelle fiche, ou mise à jour d'une existante. */
export function FeatureWriterLauncher() {
  const [open, setOpen] = useState(false);

  /**
   * Le bouton « Ajouter » de Payload, en haut de la liste, ouvre lui aussi la
   * fenêtre : c'est le geste qu'on fait d'instinct pour créer une fiche, et il
   * menait au formulaire vide. Écouté en phase de capture, avant la navigation
   * de Payload. Le formulaire vide reste accessible depuis la fenêtre (lien
   * marqué `data-manual`), et un clic avec Cmd / Ctrl ouvre toujours un onglet.
   */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!link || link.hasAttribute("data-manual")) return;
      if (!/\/collections\/features\/create(\?|$)/.test(link.getAttribute("href") ?? "")) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <>
      <button type="button" className="ctr-btn ctr-btn--primary fw-launch" onClick={() => setOpen(true)}>
        ✨ Rédiger une feature avec Claude
      </button>
      {open && <FeatureWriter mode="new" onClose={() => setOpen(false)} />}
    </>
  );
}

/** Le bouton d'une fiche ouverte : la mettre à jour avec Claude. */
export function FeatureWriterEditButton() {
  const { id } = useDocumentInfo();
  const [open, setOpen] = useState(false);
  if (id == null) return null;
  return (
    <>
      <button type="button" className="ctr-btn fw-launch fw-launch--edit" onClick={() => setOpen(true)}>
        ✨ Mettre à jour avec Claude
      </button>
      {open && <FeatureWriter mode="update" featureId={id} onClose={() => setOpen(false)} />}
    </>
  );
}
