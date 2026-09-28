"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { frDate } from "@/core/lib/dates";
import { isActionField, type SignField, type SignPlan } from "@/modules/partner/lib/sign-fields";

import styles from "./pdf-signer.module.css";

/**
 * Signer comme sur DocuSign : le document page après page, et par-dessus, aux
 * endroits exacts, des étiquettes « Parapher » / « Signer ». Un clic sur
 * l'étiquette appose les initiales ou la signature (un second clic l'annule).
 *
 * Le guidage reprend DocuSign : une barre en haut dit ce qu'il faut faire et
 * combien il en reste ; un DRAPEAU jaune, accroché dans la marge du champ en
 * cours, montre où cliquer (« Parapher ici ») ; « Champ suivant » ne fait que
 * déplacer — c'est le clic sur l'étiquette qui signe, et la barre le dit ;
 * « Terminer » reste grisé tant qu'un champ manque.
 *
 * Partagé par l'espace client (signature) et l'admin (contresignature TIM).
 * Les pages sont dessinées par pdf.js, à la demande (quand elles approchent de
 * l'écran). Ce composant ne décide de rien : il remonte les clics, le serveur
 * vérifie.
 */

type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas?: HTMLCanvasElement }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
};
type PdfDoc = { getPage: (n: number) => Promise<PdfPage> };

export function PdfSigner({
  url,
  mime = "application/pdf",
  plan,
  clicked,
  onToggle,
  onFinish,
  finishLabel = "Terminer",
  initials,
  fullName,
  role,
  fontClass,
  focus,
}: {
  /** Aller à un champ depuis l'extérieur (la liste de suivi) ; `n` change à chaque demande. */
  focus?: { id: string; n: number } | null;
  url: string;
  mime?: string;
  plan: SignPlan;
  /** Champs remplis → horodatage du clic. */
  clicked: Record<string, string>;
  onToggle: (id: string) => void;
  onFinish: () => void;
  finishLabel?: string;
  initials: string;
  fullName: string;
  role?: string;
  /** Classe de la police de signature choisie. */
  fontClass: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // Le document chargé, rattaché à SON adresse : quand `url` change, l'ancien
  // (détruit au nettoyage) n'est plus jamais servi aux pages.
  const [loaded, setLoaded] = useState<{ url: string; doc: PdfDoc } | null>(null);
  const doc = loaded?.url === url ? loaded.doc : null;
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const actions = useMemo(
    () => plan.fields.filter(isActionField).sort((a, b) => a.page - b.page || b.y - a.y),
    [plan.fields],
  );
  const done = actions.filter((f) => clicked[f.id]).length;
  const allDone = actions.length > 0 && done === actions.length;
  const left = actions.length - done;

  // Dès l'ouverture, le drapeau se pose sur le premier champ à remplir.
  useEffect(() => {
    if (active === null) {
      const first = actions.find((f) => !clicked[f.id]);
      if (first) setActive(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  // Largeur disponible : les pages s'y ajustent (sans dépasser 1,6 fois leur taille).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 32));
    ro.observe(el);
    setWidth(el.clientWidth - 32);
    return () => ro.disconnect();
  }, []);

  // Le PDF, par pdf.js (chargé à la demande : jamais côté serveur).
  useEffect(() => {
    if (mime !== "application/pdf") return;
    let cancelled = false;
    // La tâche de chargement : c'est elle qu'on libère en quittant (pdf.js 6
    // n'expose plus `destroy` sur le document lui-même).
    let task: { destroy?: () => Promise<void> } | null = null;
    const release = () => {
      if (typeof task?.destroy === "function") void task.destroy().catch(() => undefined);
      task = null;
    };
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Démonté pendant l'import : on ne lance même pas le chargement.
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const loading = pdfjs.getDocument({ url });
        task = loading as unknown as { destroy?: () => Promise<void> };
        const pdf = (await loading.promise) as unknown as PdfDoc;
        // Démonté pendant le chargement : le nettoyage a déjà libéré la tâche ;
        // on la relâche encore au cas où elle aurait été posée après lui.
        if (cancelled) return release();
        setLoaded({ url, doc: pdf });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      release();
    };
  }, [url, mime]);

  const scaleOf = (p: number) => {
    const size = plan.sizes[p - 1] ?? plan.sizes[0];
    return size ? Math.min(1.6, Math.max(0.3, width / size.w)) : 1;
  };

  /** Aller à une étiquette : défilement doux, étiquette mise en avant. */
  const goTo = useCallback((f: SignField) => {
    setActive(f.id);
    document.getElementById(`ps-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  useEffect(() => {
    const f = focus ? actions.find((a) => a.id === focus.id) : null;
    if (f) goTo(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  const next = () => {
    const from = actions.findIndex((f) => f.id === active);
    const ordered = [...actions.slice(from + 1), ...actions.slice(0, from + 1)];
    const todo = ordered.find((f) => !clicked[f.id]);
    if (todo) goTo(todo);
  };

  const toggle = (f: SignField) => {
    const filling = !clicked[f.id];
    onToggle(f.id);
    if (!filling) return setActive(f.id);
    // Rempli : on enchaîne sur la suivante, comme DocuSign.
    const after = actions.slice(actions.findIndex((a) => a.id === f.id) + 1).find((a) => !clicked[a.id]);
    if (after) setTimeout(() => goTo(after), 350);
    else setActive(null);
  };

  if (failed) {
    return (
      <div className={styles.root}>
        <div className={styles.loading}>Le document n&apos;a pas pu être affiché. Rechargez la page.</div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {actions.length > 0 && (
        <div className={`${styles.bar} ${allDone ? styles.barDone : ""}`} role="toolbar" aria-label="Champs à remplir">
          <div className={styles.barText}>
            <strong>
              {allDone
                ? "Tout est rempli."
                : `${left} champ${left > 1 ? "s" : ""} à remplir`}
            </strong>
            <span>
              {allDone
                ? " Cliquez sur « Terminer » pour valider."
                : " Cliquez sur chaque étiquette jaune pour y apposer vos initiales ou votre signature. « Champ suivant » vous y amène, sans rien signer."}
            </span>
          </div>
          <div className={styles.barActions}>
            {!allDone && (
              <button type="button" className={styles.barNext} onClick={next} title="Amène au champ suivant, sans rien signer">
                Champ suivant ↓
              </button>
            )}
            <button type="button" className={styles.barFinish} onClick={onFinish} disabled={!allDone}>
              {finishLabel}
            </button>
          </div>
        </div>
      )}
      <div className={styles.scroller} ref={scroller}>
        <div className={styles.pages}>
          {width > 0 &&
            plan.sizes.map((size, i) => {
              const p = i + 1;
              const scale = scaleOf(p);
              return (
                <Page key={p} n={p} doc={doc} imageUrl={mime === "application/pdf" ? null : url} size={size} scale={scale}>
                  {plan.fields
                    .filter((f) => f.page === p)
                    .map((f) => {
                      const box = {
                        left: f.x * scale,
                        top: (size.h - f.y - f.h) * scale,
                        width: f.w * scale,
                        height: f.h * scale,
                      };
                      if (!isActionField(f)) {
                        // Nom, fonction, date : remplis d'office, visibles une fois la page signée.
                        const pageSigned = plan.fields.some((x) => x.page === p && x.kind === "signature" && clicked[x.id]);
                        const text = f.kind === "name" ? fullName : f.kind === "role" ? (role ?? "") : frDate(new Date());
                        return (
                          <span
                            key={f.id}
                            className={`${styles.auto} ${pageSigned ? "" : styles.autoPending}`}
                            style={{ ...box, fontSize: Math.max(8, Math.min(12, f.h * scale * 0.7)) }}
                          >
                            {pageSigned ? text : ""}
                          </span>
                        );
                      }
                      const isDone = Boolean(clicked[f.id]);
                      const label = f.kind === "signature" ? "Signer" : "Parapher";
                      const ink = f.kind === "signature" ? fullName : initials;
                      // Le tracé tient dans la case : limité par la hauteur ET par la largeur.
                      const inkSize = Math.max(
                        8,
                        Math.min(box.height * (f.kind === "signature" ? 0.7 : 0.62), (box.width * 0.9) / Math.max(1, ink.length * 0.62)),
                      );
                      const isActive = active === f.id && !isDone;
                      return (
                        <span key={f.id} style={{ display: "contents" }}>
                          {isActive && (
                            // Le drapeau DocuSign : où cliquer, pointé depuis la gauche du champ.
                            <button
                              type="button"
                              className={styles.flag}
                              style={{ top: box.top + box.height / 2, right: `calc(100% - ${box.left - 6}px)` }}
                              onClick={() => toggle(f)}
                            >
                              {label} ici
                            </button>
                          )}
                          <button
                            id={`ps-${f.id}`}
                            type="button"
                            onClick={() => toggle(f)}
                            aria-label={isDone ? `${label} (fait) — cliquer pour annuler` : label}
                            className={`${styles.tag} ${isDone ? styles.tagDone : ""} ${isActive ? styles.tagActive : ""}`}
                            style={box}
                          >
                            {isDone ? (
                              <span className={`${fontClass} ${styles.inked}`} style={{ fontSize: inkSize }}>
                                {ink}
                              </span>
                            ) : (
                              <span className={styles.tagLabel} style={{ fontSize: Math.max(9, Math.min(12, box.height * 0.42)) }}>
                                ✎ {label}
                              </span>
                            )}
                          </button>
                        </span>
                      );
                    })}
                </Page>
              );
            })}
        </div>
      </div>

    </div>
  );
}

/** Une page : dessinée par pdf.js quand elle approche de l'écran (ou l'image seule). */
function Page({
  n,
  doc,
  imageUrl,
  size,
  scale,
  children,
}: {
  n: number;
  doc: PdfDoc | null;
  imageUrl: string | null;
  size: { w: number; h: number };
  scale: number;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !doc || !canvas.current) return;
    let cancelled = false;
    // Le rendu en cours : annulé avant d'en relancer un (changement d'échelle),
    // sinon pdf.js refuse deux rendus sur le même canvas et la page reste blanche.
    let task: { promise: Promise<void>; cancel: () => void } | null = null;
    (async () => {
      try {
        const page = await doc.getPage(n);
        if (cancelled || !canvas.current) return;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale: scale * ratio });
        const c = canvas.current;
        c.width = Math.floor(viewport.width);
        c.height = Math.floor(viewport.height);
        const ctx = c.getContext("2d");
        if (!ctx) return;
        task = page.render({ canvasContext: ctx, viewport, canvas: c });
        await task.promise;
      } catch (e) {
        // Annulé (nettoyage, document remplacé) : voulu ; le reste est signalé.
        if (cancelled || (e as { name?: string } | null)?.name === "RenderingCancelledException") return;
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, doc, n, scale]);

  return (
    <div ref={box} className={styles.page} style={{ width: size.w * scale, height: size.h * scale }}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className={styles.image} />
      ) : (
        <canvas ref={canvas} className={styles.canvas} />
      )}
      <span className={styles.pageNo}>{n}</span>
      {children}
    </div>
  );
}
