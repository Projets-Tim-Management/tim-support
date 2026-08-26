"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ActivityIcon } from "@/modules/partner/admin/ActivityIcons";
import { EmailTemplatePicker, type EmailTemplate } from "@/modules/partner/admin/EmailTemplatePicker";
import { RichNoteEditor } from "@/modules/partner/admin/RichNoteEditor";
import { SenderSetup } from "@/modules/partner/admin/SenderSetup";
import { TASK_KINDS, activityKind } from "@/modules/partner/lib/activity";
import { fillTemplate, type TemplateContext } from "@/modules/partner/lib/email-template";

/**
 * Drawer de saisie d'une activité : note, e-mail ou tâche.
 *
 * Un panneau latéral plutôt qu'un formulaire inséré dans la page : la
 * chronologie reste visible derrière (on écrit souvent EN RÉPONSE à ce qu'on
 * vient d'y lire), et le geste a un début et une fin nets.
 *
 * Trois partis pris d'interface, tous destinés à réduire la saisie :
 *  - la nature d'une tâche se CHOISIT au doigt (pastilles à icônes) sur UNE
 *    ligne qui défile, elle ne se déroule pas dans une liste — les sept options
 *    restent à la même place quelle que soit la largeur du panneau ;
 *  - l'échéance se pose d'un clic (« Demain », « Lundi prochain »), le champ
 *    date restant là pour les cas précis. Une date choisie au calendrier coûte
 *    quatre clics là où « Demain » en coûte un ;
 *  - les destinataires d'un e-mail sont des JETONS : on voit ce qui partira, et
 *    on retire une adresse sans éditer une chaîne à la virgule près.
 *
 * La NOTE et l'E-MAIL se rédigent en texte mis en forme (gras, titres, listes),
 * avec le même éditeur : ce qui est stocké est du Markdown, converti en HTML au
 * moment de l'envoi (voir lib/rich-text.ts).
 *
 * L'e-mail dispose en plus de ce qu'on attend d'un vrai composeur : expéditeur
 * choisi parmi les adresses VÉRIFIÉES du compte Brevo, copies Cc/Bcc repliées
 * par défaut, et surtout des MODÈLES par partenaire — les trois quarts des
 * messages commerciaux sont les mêmes à trois mots près.
 *
 * Rendu par PORTAIL sur <body> : à l'intérieur de l'onglet, son z-index resterait
 * prisonnier du contexte d'empilement et il passerait sous la barre latérale.
 */

export type DraftKind = "note" | "email" | "tache";

/** Valeurs d'une activité qu'on rouvre pour la corriger. */
export interface ActivityInitial {
  title?: string | null;
  content?: string | null;
  taskKind?: string | null;
  dueDate?: string | null;
  reminderAt?: string | null;
  highPriority?: boolean | null;
}

/** Ce que le drawer renvoie ; l'appelant se charge d'écrire. */
export interface ActivityDraft {
  kind: DraftKind;
  title: string;
  content: string;
  /** Tâche */
  taskKind?: string;
  dueDate?: string;
  reminderAt?: string;
  highPriority?: boolean;
  /** E-mail */
  to?: string;
  cc?: string;
  bcc?: string;
  from?: string;
  /** `false` retire la signature pour CE message. */
  signature?: boolean;
  /** Identifiants des médias à joindre (jamais des URL : cf. la route d'envoi). */
  attachments?: number[];
}

/** Date ISO → valeur d'un `<input type="datetime-local">`, ou vide. */
const isoToLocal = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : toLocalInput(d);
};

const META: Record<DraftKind, { title: string; hint: string; cta: string }> = {
  note: {
    title: "Créer une note",
    hint: "Ce qu'il faut retenir : un appel passé, une rencontre, une décision.",
    cta: "Enregistrer",
  },
  email: {
    title: "Envoyer un e-mail",
    hint: "Part par Brevo. Les réponses arrivent dans votre boîte.",
    cta: "Envoyer",
  },
  tache: {
    title: "Créer une tâche",
    hint: "Ce qui reste à faire, avec son échéance.",
    cta: "Créer la tâche",
  },
};

const MAX_CONTENT = 10_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** `Date` → valeur d'un `<input type="datetime-local">` (heure locale). */
const toLocalInput = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Date à `days` jours, à 9 h — l'heure à laquelle on traite ce genre de tâche. */
const atNineIn = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
};

/** Prochain lundi, à 9 h. */
const nextMonday = (): Date => {
  const d = atNineIn(1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
};

/** Date à `months` mois, à 9 h — en laissant JS gérer les fins de mois. */
const atNineInMonths = (months: number): Date => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  d.setHours(9, 0, 0, 0);
  return d;
};

/**
 * Raccourcis d'échéance, du plus proche au plus lointain.
 *
 * Les échéances longues ne sont pas un cas rare en prospection : « rappeler dans
 * 3 mois » est la conclusion la plus fréquente d'un « pas maintenant ». Les
 * poser d'un clic évite d'aller compter les semaines dans un calendrier.
 */
const DUE_SHORTCUTS: { label: string; at: () => Date }[] = [
  { label: "Aujourd'hui", at: () => atNineIn(0) },
  { label: "Demain", at: () => atNineIn(1) },
  { label: "Dans 3 jours", at: () => atNineIn(3) },
  { label: "Lundi prochain", at: nextMonday },
  { label: "1 semaine", at: () => atNineIn(7) },
  { label: "2 semaines", at: () => atNineIn(14) },
  { label: "1 mois", at: () => atNineInMonths(1) },
  { label: "2 mois", at: () => atNineInMonths(2) },
  { label: "3 mois", at: () => atNineInMonths(3) },
  { label: "4 mois", at: () => atNineInMonths(4) },
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const frLong = (value: string): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Signale de quel côté il reste des pastilles à faire défiler.
 *
 * En CSS seul, le dégradé serait soit permanent (il voilerait une pastille
 * pourtant entièrement visible), soit conditionné à la largeur de la FENÊTRE —
 * qui ne dit rien de celle du panneau. On mesure donc l'élément lui-même.
 */
function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 4, right: max > 4 && el.scrollLeft < max - 4 });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, []);

  return { ref, edges };
}

/**
 * Champ d'adresses en JETONS, partagé par À, Cc et Cci.
 *
 * Voir ce qui partira, et retirer une adresse d'un clic — plutôt qu'éditer une
 * chaîne à la virgule près. Entrée ou virgule valide, Retour arrière sur un
 * champ vide retire le dernier jeton (le geste attendu d'un client de mail).
 */
function TokenField({
  label,
  tokens,
  draft,
  setTokens,
  setDraft,
  push,
  placeholder,
  after,
}: {
  label: string;
  tokens: string[];
  draft: string;
  setTokens: React.Dispatch<React.SetStateAction<string[]>>;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  push: (
    raw: string,
    set: React.Dispatch<React.SetStateAction<string[]>>,
    clear: React.Dispatch<React.SetStateAction<string>>,
  ) => void;
  placeholder: string;
  after?: React.ReactNode;
}) {
  return (
    <div className="tim-adrawer__field">
      <span className="tim-adrawer__label">
        {label}
        {after && <span className="tim-adrawer__label-after">{after}</span>}
      </span>
      <div className="tim-adrawer__tokens">
        {tokens.map((t) => (
          <span
            key={t}
            className={`tim-adrawer__token${EMAIL_RE.test(t) ? "" : " tim-adrawer__token--bad"}`}
          >
            {t}
            <button
              type="button"
              onClick={() => setTokens((cur) => cur.filter((x) => x !== t))}
              aria-label={`Retirer ${t}`}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          className="tim-adrawer__token-input"
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            // Coller « a@x.fr, b@y.fr » crée deux jetons, pas une bouillie.
            if (/[,;\s]$/.test(v)) push(v, setTokens, setDraft);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              push(draft, setTokens, setDraft);
            }
            if (e.key === "Backspace" && !draft) setTokens((cur) => cur.slice(0, -1));
          }}
          onBlur={() => push(draft, setTokens, setDraft)}
          placeholder={tokens.length ? "Ajouter une adresse…" : placeholder}
        />
      </div>
    </div>
  );
}

export function ActivityDrawer({
  kind,
  initial,
  defaultTo,
  companyName,
  clientId,
  templateContext,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  kind: DraftKind;
  /** Présent = on CORRIGE une activité existante, on n'en crée pas une. */
  initial?: ActivityInitial | null;
  defaultTo?: string;
  companyName?: string;
  /** Opportunité courante : sert à charger expéditeurs et modèles. */
  clientId?: number | string;
  /** Valeurs de remplacement des variables d'un modèle. */
  templateContext?: TemplateContext;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (draft: ActivityDraft) => void;
}) {
  // Valeurs INITIALES seulement : le drawer est remonté à chaque ouverture
  // (la fiche le monte sur `kind`), il n'a donc pas à se resynchroniser.
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [taskKind, setTaskKind] = useState<string>(initial?.taskKind ?? "a-faire");
  const [due, setDue] = useState(() => isoToLocal(initial?.dueDate) || toLocalInput(atNineIn(1)));
  const [wantsReminder, setWantsReminder] = useState(Boolean(initial?.reminderAt));
  const [reminder, setReminder] = useState(
    () => isoToLocal(initial?.reminderAt) || toLocalInput(atNineIn(1)),
  );
  const [priority, setPriority] = useState(Boolean(initial?.highPriority));
  /** Destinataires en JETONS + ce que l'utilisateur est en train de taper. */
  const [tos, setTos] = useState<string[]>(() => (defaultTo ? [defaultTo] : []));
  const [toDraft, setToDraft] = useState("");
  /** Le nom d'une tâche suit sa nature tant que personne ne l'a récrit. */
  // Un nom déjà écrit ne doit pas être remplacé par le libellé du type.
  const [titleTouched, setTitleTouched] = useState(Boolean(initial?.title));

  // ── E-mail : copies, expéditeur, modèles ──────────────────────────────────
  const [ccs, setCcs] = useState<string[]>([]);
  const [ccDraft, setCcDraft] = useState("");
  const [bccs, setBccs] = useState<string[]>([]);
  const [bccDraft, setBccDraft] = useState("");
  /** Copies repliées par défaut : neuf envois sur dix n'en ont pas. */
  const [showCopies, setShowCopies] = useState(false);
  const [from, setFrom] = useState("");
  const [senders, setSenders] = useState<{ email: string; name?: string }[]>([]);
  /** Expéditeur imposé (partenaire) : aucun choix, aucune liste. */
  const [fromLocked, setFromLocked] = useState(true);
  /** Adresse acceptée par Brevo comme expéditeur. */
  const [fromVerified, setFromVerified] = useState(true);
  /** Signature du partenaire, telle qu'elle sera collée au bas du message. */
  const [signatureHtml, setSignatureHtml] = useState("");
  const [withSignature, setWithSignature] = useState(true);
  /** Fichiers DÉJÀ téléversés : on n'envoie que leur identifiant à l'envoi. */
  const [files, setFiles] = useState<{ id: number; name: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  /**
   * Erreur PROPRE au téléversement : `error` vient du parent et décrit l'envoi
   * du message. Un fichier refusé ne doit pas s'afficher comme un échec d'envoi
   * — le message, lui, n'est même pas encore parti.
   */
  const [fileError, setFileError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [picking, setPicking] = useState(false);
  /**
   * Change à chaque insertion de modèle pour REMONTER l'éditeur.
   *
   * `RichNoteEditor` n'écrit son contenu dans le DOM qu'au montage — c'est ce
   * qui évite de replacer le curseur au début à chaque frappe. Conséquence : une
   * valeur posée de l'extérieur (un modèle inséré) ne s'affichait pas. Le corps
   * était bien en mémoire, mais l'écran restait vide — donc le message partait
   * vide si on ne retapait rien. Changer la `key` reconstruit l'éditeur avec la
   * nouvelle valeur.
   */
  const [bodyKey, setBodyKey] = useState(0);
  /** Nom en cours de saisie pour enregistrer le message courant en modèle. */
  const [saveName, setSaveName] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const { ref: chipsRef, edges: chipEdges } = useScrollEdges<HTMLDivElement>();
  const { ref: dueRef, edges: dueEdges } = useScrollEdges<HTMLDivElement>();

  // Échap ferme : un panneau qu'on ne sait pas fermer au clavier est un piège.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Le fond ne défile plus derrière le panneau (sinon la molette emporte la
  // page entière dès que le curseur sort du drawer).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /** Modèles du partenaire — relu après chaque création, modification, suppression. */
  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/payload-api/email-templates?limit=100&sort=name&depth=0&select[name]=true&select[subject]=true&select[body]=true&select[scope]=true", {
        credentials: "include",
      });
      const json = res.ok ? await res.json() : { docs: [] };
      setTemplates((json?.docs ?? []) as EmailTemplate[]);
    } catch {
      /* pas de modèle : le composeur reste utilisable */
    }
  }, []);

  // Expéditeurs vérifiés + modèles du partenaire : deux lectures, une seule fois
  // à l'ouverture du drawer d'e-mail.
  useEffect(() => {
    if (kind !== "email" || clientId == null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/partner/client-email?client=${clientId}`, {
          credentials: "include",
        });
        const json = res.ok ? await res.json() : null;
        if (!cancelled && json) {
          setSenders(json.senders ?? []);
          setFrom(json.default ?? "");
          setFromLocked(json.locked !== false);
          setFromVerified(json.verified !== false);
          setSignatureHtml(json.signatureHtml ?? "");
        }
      } catch {
        /* l'adresse par défaut du serveur s'appliquera */
      }
      await loadTemplates();
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, kind, loadTemplates]);

  const editing = Boolean(initial);
  const meta = editing
    ? {
        title: kind === "tache" ? "Modifier la tâche" : "Modifier la note",
        hint: "La correction remplace le texte d'origine dans l'historique.",
        cta: "Enregistrer",
      }
    : META[kind];
  const isTask = kind === "tache";
  const isEmail = kind === "email";
  const accent = activityKind(kind)?.color;
  const accentBg = activityKind(kind)?.bg;

  /**
   * Écran de mise en conformité, ou composeur ?
   *
   * Seul un PARTENAIRE peut être bloqué : son adresse est imposée, elle doit
   * donc être utilisable. Un admin, lui, CHOISIT parmi les expéditeurs vérifiés
   * du compte — le bloquer parce que sa propre adresse ne l'est pas encore lui
   * fermerait l'accès à la liste au moment précis où il en a besoin.
   */
  const needsSetup = fromLocked && !fromVerified;

  const taskLabel = TASK_KINDS.find((k) => k.value === taskKind)?.label ?? "À faire";
  const shownTitle = isTask && !titleTouched ? taskLabel : title;

  /** Ajoute une adresse à un champ de jetons (À, Cc, Cci). */
  const pushToken = (
    raw: string,
    set: React.Dispatch<React.SetStateAction<string[]>>,
    clear: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    const value = raw.trim().replace(/[,;]$/, "");
    if (!value) return;
    set((cur) => (cur.includes(value) ? cur : [...cur, value]));
    clear("");
  };

  /** Adresses invalides : signalées sur le jeton, pas au moment d'envoyer. */
  const badTos = useMemo(() => tos.filter((t) => !EMAIL_RE.test(t)), [tos]);
  const allTos = useMemo(() => (toDraft.trim() ? [...tos, toDraft.trim()] : tos), [toDraft, tos]);

  const canSubmit = isEmail
    ? !needsSetup &&
      allTos.length > 0 &&
      allTos.every((t) => EMAIL_RE.test(t)) &&
      Boolean(title.trim() && content.trim())
    : isTask
      ? Boolean(shownTitle.trim() && due)
      : Boolean(content.trim());

  const submit = () => {
    if (!canSubmit || busy) return;
    onSubmit({
      kind,
      title: shownTitle.trim(),
      content: content.trim(),
      ...(isTask
        ? {
            taskKind,
            dueDate: due ? new Date(due).toISOString() : undefined,
            reminderAt: wantsReminder && reminder ? new Date(reminder).toISOString() : undefined,
            highPriority: priority,
          }
        : {}),
      ...(isEmail
        ? {
            to: allTos.join(","),
            cc: [...ccs, ccDraft.trim()].filter(Boolean).join(","),
            bcc: [...bccs, bccDraft.trim()].filter(Boolean).join(","),
            from,
            signature: withSignature,
            attachments: files.map((f) => f.id),
          }
        : {}),
    });
  };

  /**
   * Téléverse les fichiers choisis, un par un, vers la médiathèque.
   *
   * Le fichier part MAINTENANT et non à l'envoi : on voit tout de suite s'il
   * passe, et le message ne reste pas bloqué au moment où on clique « Envoyer ».
   */
  const addFiles = async (chosen: FileList | null) => {
    if (!chosen?.length) return;
    setUploading(true);
    setFileError(null);
    try {
      for (const file of Array.from(chosen).slice(0, 5)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/payload-api/media", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.doc?.id) throw new Error(`« ${file.name} » n'a pas pu être envoyé.`);
        setFiles((cur) => [
          ...cur,
          { id: json.doc.id as number, name: json.doc.filename ?? file.name, size: file.size },
        ]);
      }
    } catch (e) {
      setFileError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  /** Insère un modèle : objet + corps, variables déjà remplacées. */
  const applyTemplate = (t: EmailTemplate) => {
    setPicking(false);
    setTitleTouched(true);
    setTitle(fillTemplate(t.subject ?? "", templateContext ?? {}));
    setContent(fillTemplate(t.body ?? "", templateContext ?? {}));
    setBodyKey((n) => n + 1); // remonte l'éditeur pour que le texte s'affiche
  };

  /** Enregistre le message courant comme modèle du partenaire de l'opportunité. */
  const saveTemplate = async () => {
    const name = (saveName ?? "").trim();
    if (!name || !title.trim() || !content.trim()) return;
    try {
      const res = await fetch("/payload-api/email-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // `partner` est posé côté serveur pour un partenaire (enforcePartnerField) ;
        // pour un admin, il vient de l'opportunité en cours.
        body: JSON.stringify({
          name,
          subject: title.trim(),
          body: content.trim(),
          partner: templateContext?.partnerId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.errors?.[0]?.message ?? "Enregistrement impossible.");
      setTemplates((cur) => [...cur, json?.doc ?? { id: `tmp-${cur.length}`, name, subject: title, body: content }]);
      setSaveName(null);
      setSaveMsg(`Modèle « ${name} » enregistré.`);
    } catch (e) {
      setSaveMsg((e as Error).message);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="tim-adrawer"
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="tim-adrawer__panel" ref={panelRef}>
        <header className="tim-adrawer__head" style={{ background: accentBg }}>
          <span className="tim-adrawer__head-icon" style={{ color: accent }}>
            <ActivityIcon kind={kind} />
          </span>
          <div className="tim-adrawer__head-text">
            <h2 className="tim-adrawer__title">{meta.title}</h2>
            <p className="tim-adrawer__hint">
              {companyName ? `${companyName} · ` : ""}
              {meta.hint}
            </p>
          </div>
          <button
            type="button"
            className="tim-adrawer__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="tim-adrawer__body">
          {error && (
            <p className="tim-adrawer__error" role="alert">
              {error}
            </p>
          )}

          {/* ── Nature de la tâche : des pastilles, pas une liste déroulante ── */}
          {isTask && (
            <div className="tim-adrawer__field">
              <span className="tim-adrawer__label">Type de tâche</span>
              <div
                ref={chipsRef}
                className={
                  "tim-adrawer__chips tim-adrawer__chips--scroll" +
                  (chipEdges.left ? " is-left" : "") +
                  (chipEdges.right ? " is-right" : "")
                }
                role="radiogroup"
                aria-label="Type de tâche"
              >
                {TASK_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    role="radio"
                    aria-checked={taskKind === k.value}
                    className={`tim-adrawer__chip${taskKind === k.value ? " tim-adrawer__chip--on" : ""}`}
                    onClick={() => setTaskKind(k.value)}
                  >
                    <ActivityIcon kind={k.value} />
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Adresse pas encore utilisable : la marche à suivre REMPLACE le
              composeur. Laisser rédiger un message qui sera refusé à l'envoi
              serait le pire enchaînement — on l'apprendrait après avoir écrit. */}
          {isEmail && needsSetup && <SenderSetup onReady={() => setFromVerified(true)} />}

          {/* ── Expéditeur, destinataires, copies ──────────────────────────── */}
          {isEmail && !needsSetup && (
            <>
              {/* « De » : un choix pour l'admin, une adresse imposée pour un
                  partenaire — c'est son client, l'e-mail vient de lui. La règle
                  est appliquée côté serveur ; ici on ne fait que la montrer. */}
              {!fromLocked && senders.length > 1 ? (
                <label className="tim-adrawer__field">
                  <span className="tim-adrawer__label">De</span>
                  <select
                    className="tim-adrawer__input"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  >
                    {senders.map((sd) => (
                      <option key={sd.email} value={sd.email}>
                        {sd.name ? `${sd.name} — ${sd.email}` : sd.email}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                from && (
                  <div className="tim-adrawer__field">
                    <span className="tim-adrawer__label">De</span>
                    <span className="tim-adrawer__from">{from}</span>
                  </div>
                )
              )}
              <TokenField
                label="À"
                tokens={tos}
                draft={toDraft}
                setTokens={setTos}
                setDraft={setToDraft}
                push={pushToken}
                placeholder="adresse@entreprise.fr"
                after={
                  !showCopies && (
                    <button
                      type="button"
                      className="tim-adrawer__link"
                      onClick={() => setShowCopies(true)}
                    >
                      Cc Cci
                    </button>
                  )
                }
              />
              {badTos.length > 0 && (
                <span className="tim-adrawer__warn">Adresse invalide : {badTos.join(", ")}</span>
              )}

              {showCopies && (
                <>
                  <TokenField
                    label="Cc"
                    tokens={ccs}
                    draft={ccDraft}
                    setTokens={setCcs}
                    setDraft={setCcDraft}
                    push={pushToken}
                    placeholder="en copie"
                  />
                  <TokenField
                    label="Cci"
                    tokens={bccs}
                    draft={bccDraft}
                    setTokens={setBccs}
                    setDraft={setBccDraft}
                    push={pushToken}
                    placeholder="en copie cachée"
                  />
                </>
              )}

              {/* ── Modèles ─────────────────────────────────────────────────── */}
              {/* La liste se déploie PAR-DESSUS les champs suivants (objet,
                  message) : coincée dans le flux, elle n'avait que la place
                  d'une ligne et demie — on ne voyait pas ce qu'on choisissait. */}
              <div className="tim-adrawer__tpl-wrap">
              <div className="tim-adrawer__tpl-row">
                <button
                  type="button"
                  className="tim-adrawer__tpl-btn"
                  onClick={() => setPicking((v) => !v)}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 9h18M8 4v16" />
                  </svg>
                  Modèles{templates.length ? ` (${templates.length})` : ""}
                </button>
                {title.trim() && content.trim() && saveName === null && (
                  <button
                    type="button"
                    className="tim-adrawer__link"
                    onClick={() => {
                      setSaveMsg(null);
                      setSaveName("");
                    }}
                  >
                    Enregistrer comme modèle
                  </button>
                )}
              </div>

              {picking && (
                <EmailTemplatePicker
                  templates={templates}
                  partnerId={templateContext?.partnerId}
                  onPick={applyTemplate}
                  onChanged={loadTemplates}
                  onClose={() => setPicking(false)}
                />
              )}
              </div>

              {saveName !== null && (
                <div className="tim-adrawer__save-tpl">
                  <input
                    className="tim-adrawer__input"
                    value={saveName}
                    autoFocus
                    placeholder="Nom du modèle — ex. « Relance sans retour »"
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveTemplate();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        setSaveName(null);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="tim-adrawer__btn tim-adrawer__btn--primary"
                    disabled={!saveName.trim()}
                    onClick={() => void saveTemplate()}
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    className="tim-adrawer__btn"
                    onClick={() => setSaveName(null)}
                  >
                    Annuler
                  </button>
                </div>
              )}
              {saveMsg && <span className="tim-adrawer__note">{saveMsg}</span>}
            </>
          )}

          {/* ── Intitulé ────────────────────────────────────────────────────── */}
          {kind !== "note" && !(isEmail && needsSetup) && (
            <label className="tim-adrawer__field">
              <span className="tim-adrawer__label">{isEmail ? "Objet" : "Nom de la tâche"}</span>
              <input
                className="tim-adrawer__input"
                value={shownTitle}
                autoFocus={isEmail}
                onChange={(e) => {
                  setTitleTouched(true);
                  setTitle(e.target.value);
                }}
                placeholder={
                  isEmail
                    ? `Votre projet avec TIM${companyName ? ` — ${companyName}` : ""}`
                    : "Rappeler pour valider l'offre"
                }
              />
            </label>
          )}

          {/* ── Échéance + rappel + priorité ────────────────────────────────── */}
          {isTask && (
            <div className="tim-adrawer__card">
              <div className="tim-adrawer__field">
                <span className="tim-adrawer__label">Échéance</span>
                {/* Dix raccourcis sur UNE ligne qui défile : sur trois rangs, ils
                    repoussaient le champ date et les interrupteurs hors écran. */}
                <div
                  ref={dueRef}
                  className={
                    "tim-adrawer__chips tim-adrawer__chips--scroll" +
                    (dueEdges.left ? " is-left" : "") +
                    (dueEdges.right ? " is-right" : "")
                  }
                >
                  {DUE_SHORTCUTS.map((sc) => {
                    const value = toLocalInput(sc.at());
                    return (
                      <button
                        key={sc.label}
                        type="button"
                        className={`tim-adrawer__chip${due === value ? " tim-adrawer__chip--on" : ""}`}
                        onClick={() => setDue(value)}
                      >
                        {sc.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="datetime-local"
                  className="tim-adrawer__input"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
                {due && <span className="tim-adrawer__echo">{frLong(due)}</span>}
              </div>

              <div className="tim-adrawer__switch-row">
                <button
                  type="button"
                  role="switch"
                  aria-checked={wantsReminder}
                  className={`tim-adrawer__switch${wantsReminder ? " tim-adrawer__switch--on" : ""}`}
                  onClick={() => {
                    setWantsReminder((v) => !v);
                    // Un rappel par défaut le matin de l'échéance : l'heure la
                    // plus utile, et une saisie de moins.
                    if (!wantsReminder && due) setReminder(due);
                  }}
                >
                  <span className="tim-adrawer__switch-knob" />
                </button>
                <span className="tim-adrawer__switch-label">
                  {wantsReminder ? "Rappel par e-mail" : "Pas de rappel"}
                </span>
              </div>
              {wantsReminder && (
                <input
                  type="datetime-local"
                  className="tim-adrawer__input"
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value)}
                  aria-label="Heure du rappel"
                />
              )}

              <div className="tim-adrawer__switch-row">
                <button
                  type="button"
                  role="switch"
                  aria-checked={priority}
                  className={`tim-adrawer__switch${priority ? " tim-adrawer__switch--on" : ""}`}
                  onClick={() => setPriority((v) => !v)}
                >
                  <span className="tim-adrawer__switch-knob" />
                </button>
                <span className="tim-adrawer__switch-label">
                  {priority ? "⚑ Priorité haute" : "Priorité normale"}
                </span>
              </div>
            </div>
          )}

          {/* ── Corps ───────────────────────────────────────────────────────── */}
          {!(isEmail && needsSetup) && (
          <div className="tim-adrawer__field">
            <span className="tim-adrawer__label">
              {isEmail ? "Message" : isTask ? "Notes" : "Note"}
              {isTask && <span className="tim-adrawer__opt"> (optionnel)</span>}
            </span>
            {isTask ? (
              <textarea
                className="tim-adrawer__textarea"
                rows={4}
                value={content}
                maxLength={MAX_CONTENT}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Prenez des notes ici…"
              />
            ) : (
              // Note ET e-mail : même éditeur, même Markdown stocké. Le message
              // part en HTML reconstruit à l'envoi (voir la route d'envoi).
              <RichNoteEditor
                key={`${kind}-${bodyKey}`}
                value={content}
                onChange={setContent}
                placeholder={isEmail ? "Rédiger un message…" : "Prenez des notes ici…"}
                rows={isEmail ? 12 : 10}
                autoFocus={kind === "note"}
                footer={
                  isEmail && withSignature && signatureHtml ? (
                    <div
                      className="tim-rte__signature"
                      // HTML fabriqué par le serveur à partir de champs échappés
                      // (renderSignature) — ce n'est pas une saisie réinjectée.
                      dangerouslySetInnerHTML={{ __html: signatureHtml }}
                    />
                  ) : null
                }
              />
            )}
            <span className="tim-adrawer__count">
              {content.length}/{MAX_CONTENT}
            </span>
          </div>
          )}

          {/* La signature est ajoutée à l'ENVOI (jamais collée dans le corps :
              elle serait alors figée, et doublée). Le bouton sert donc à la
              VOIR et à la retirer pour ce message — pas à l'insérer. */}
          {/* La signature s'affiche DANS le cadre ci-dessus, à sa vraie place.
              Cette ligne ne fait que l'y mettre ou l'en retirer — elle n'est
              jamais collée dans le texte : elle serait alors figée, et doublée
              par l'ajout de l'envoi. */}
          {isEmail && !needsSetup && (
            <div className="tim-adrawer__files">
              <div className="tim-adrawer__files-list">
                {files.map((f) => (
                  <span key={f.id} className="tim-adrawer__file">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.49" />
                    </svg>
                    {f.name}
                    <span className="tim-adrawer__file-size">
                      {Math.max(1, Math.round(f.size / 1024))} Ko
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))}
                      aria-label={`Retirer ${f.name}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <label className="tim-adrawer__link tim-adrawer__file-add">
                {uploading ? "Envoi du fichier…" : "+ Joindre un fichier"}
                <input
                  type="file"
                  multiple
                  hidden
                  disabled={uploading}
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    // Réinitialisé : rejoindre DEUX FOIS le même fichier doit
                    // rester possible (un devis corrigé porte le même nom).
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="tim-adrawer__file-hint">5 fichiers, 8 Mo au total au maximum.</span>
              {fileError && (
                <span className="tim-adrawer__warn" role="alert">
                  {fileError}
                </span>
              )}
            </div>
          )}

          {isEmail && !needsSetup && signatureHtml && (
            <label className="tim-adrawer__sig-toggle">
              <input
                type="checkbox"
                checked={withSignature}
                onChange={(e) => setWithSignature(e.target.checked)}
              />
              Ajouter ma signature
            </label>
          )}
        </div>

        <footer className="tim-adrawer__foot">
          <button type="button" className="tim-adrawer__btn" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className="tim-adrawer__btn tim-adrawer__btn--primary"
            disabled={busy || !canSubmit}
            onClick={submit}
          >
            {busy ? "En cours…" : meta.cta}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
