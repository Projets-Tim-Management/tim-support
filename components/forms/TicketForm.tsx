"use client";

import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { FeatureTerm } from "@/core/lib/types";

const TYPES = [
  { value: "assistance", label: "Assistance",  icon: "💬", desc: "Une question ou un problème sur le logiciel" },
  { value: "suggestion", label: "Suggestion",  icon: "💡", desc: "Une idée d'amélioration" },
  { value: "autre",      label: "Autre",       icon: "✉️", desc: "Toute autre demande" },
];

const ALLOWED_TYPES   = TYPES.map((t) => t.value);
const MAX_FILES       = 5;
const MAX_FILE_SIZE   = 5 * 1024 * 1024; // 5 Mo
const ACCEPTED_TYPES  = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Services destinataires pour les demandes "Autre" (qui ne sont pas liées
// à une fonctionnalité du logiciel).
const SERVICES = [
  { value: "technique",   label: "🔧 Service technique" },
  { value: "facturation", label: "💰 Service facturation" },
  { value: "support",     label: "🎯 Service support" },
  { value: "commercial",  label: "💼 Service commercial" },
  { value: "autre",       label: "❓ Autre service" },
];

interface TicketResponse {
  success?:        boolean;
  ticket_id?:      number;
  ticket_number?:  number;
  code?:           string;
  message?:        string;
}

interface PageOption {
  slug:  string;
  name:  string;
  /** Profondeur dans la hiérarchie (0 = enfant direct de Web/Mobile, 1 = niveau 2…) */
  depth: number;
}

interface PageGroups {
  web:    PageOption[];
  mobile: PageOption[];
}

/** Extrait le slug de catégorie d'une URL `/features?category=xxx` (pré-remplissage). */
function categoryFromUrl(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url, "https://x.invalid");
    return u.searchParams.get("category") ?? "";
  } catch {
    return "";
  }
}

export default function TicketForm() {
  const searchParams   = useSearchParams();
  const initialType    = searchParams.get("type")    ?? "assistance";
  const initialSubject = searchParams.get("subject") ?? "";
  const initialPage    = categoryFromUrl(searchParams.get("url"));

  const [type,        setType]        = useState(ALLOWED_TYPES.includes(initialType) ? initialType : "assistance");
  const [subject,     setSubject]     = useState(initialSubject);
  const [description, setDescription] = useState("");
  const [email,       setEmail]       = useState("");
  const [name,        setName]        = useState("");
  const [firstName,   setFirstName]   = useState("");
  const [company,     setCompany]     = useState("");
  const [page,        setPage]        = useState(initialPage);
  const [service,     setService]     = useState("");
  const [files,       setFiles]       = useState<File[]>([]);
  const [website,     setWebsite]     = useState(""); // honeypot
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState<{ ticketId: number } | null>(null);

  const [pageGroups,  setPageGroups]  = useState<PageGroups>({ web: [], mobile: [] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Charge la hiérarchie complète des catégories de features et la met en forme
  // pour le <select> :
  //   - <optgroup> pour Web et Mobile (libellés non-cliquables, native HTML)
  //   - chaque catégorie est indentée selon sa profondeur (↳ + espaces)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/feature-categories")
      .then((r) => r.ok ? r.json() : [])
      .then((data: FeatureTerm[]) => {
        if (cancelled || !Array.isArray(data)) return;

        // Index : enfants de chaque parent
        const childrenOf = new Map<number, FeatureTerm[]>();
        for (const c of data) {
          if (c.slug === "non-classe") continue;
          const p = c.parent ?? 0;
          if (!childrenOf.has(p)) childrenOf.set(p, []);
          childrenOf.get(p)!.push(c);
        }

        // Walk récursif du sous-arbre d'un parent donné, applique l'indentation
        // visuelle dans le label affiché.
        const walk = (parentId: number, depth: number, out: PageOption[]) => {
          const kids = (childrenOf.get(parentId) ?? [])
            .sort((a, b) => a.name.localeCompare(b.name, "fr"));
          for (const c of kids) {
            const indent = "    ".repeat(depth);
            const arrow  = depth > 0 ? "↳ " : "";
            out.push({
              slug:  c.slug,
              name:  `${indent}${arrow}${c.name}`,
              depth,
            });
            walk(c.id, depth + 1, out);
          }
        };

        // Trouve les racines Web et Mobile par slug
        const roots = data.filter((c) => !c.parent || c.parent === 0);
        const web    = roots.find((c) => c.slug === "web");
        const mobile = roots.find((c) => c.slug === "mobile");

        const webOpts:    PageOption[] = [];
        const mobileOpts: PageOption[] = [];
        if (web)    walk(web.id,    0, webOpts);
        if (mobile) walk(mobile.id, 0, mobileOpts);

        setPageGroups({ web: webOpts, mobile: mobileOpts });
      })
      .catch(() => { /* fail silently — le select aura juste l'option vide */ });
    return () => { cancelled = true; };
  }, []);

  // Fallback referrer si on arrive sans paramètre `url` — extrait la catégorie.
  useEffect(() => {
    if (page) return;
    if (typeof document === "undefined" || !document.referrer) return;
    try {
      const ref = new URL(document.referrer);
      if (ref.origin !== window.location.origin) return;
      const slug = categoryFromUrl(ref.toString());
      if (slug) setPage(slug);
    } catch {
      /* ignore */
    }
  }, [page]);

  // Captures d'écran : ajout / retrait avec validation
  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? []);
    const valid: File[] = [];
    let rejected = 0;

    for (const f of incoming) {
      if (!ACCEPTED_TYPES.includes(f.type)) { rejected++; continue; }
      if (f.size > MAX_FILE_SIZE)            { rejected++; continue; }
      valid.push(f);
    }

    setFiles((prev) => {
      const merged = [...prev, ...valid].slice(0, MAX_FILES);
      if (rejected > 0 || valid.length + prev.length > MAX_FILES) {
        setError(
          rejected > 0
            ? `Certaines images ont été ignorées (formats acceptés : JPG/PNG/GIF/WEBP, max 5 Mo).`
            : `Maximum ${MAX_FILES} captures d'écran.`
        );
      } else {
        setError(null);
      }
      return merged;
    });

    // Reset input pour pouvoir resélectionner le même fichier après retrait
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // FormData uniformément (avec ou sans fichiers) — la route Next forward tel quel.
      const fd = new FormData();
      fd.append("type",        type);
      fd.append("subject",     subject);
      fd.append("description", description);
      fd.append("email",       email);
      fd.append("name",        name);
      fd.append("firstName",   firstName);
      fd.append("company",     company);
      // Pour 'autre' on envoie le service au lieu de la page concernée.
      if (type === "autre") {
        fd.append("service", service);
        fd.append("url",     "");
      } else {
        fd.append("service", "");
        fd.append("url",     page ? `/features?category=${page}` : "");
      }
      fd.append("website",     website);

      // Captures uniquement pour "assistance"
      if (type === "assistance") {
        files.forEach((f, i) => fd.append(`attachment_${i}`, f));
      }

      const res = await fetch("/api/tickets", { method: "POST", body: fd });
      const data: TicketResponse = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message ?? "Une erreur est survenue. Réessayez plus tard.");
      } else if (data.ticket_number || data.ticket_id) {
        setSuccess({ ticketId: data.ticket_number ?? data.ticket_id! });
      }
    } catch {
      setError("Impossible de joindre le serveur. Vérifiez votre connexion.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="border border-success/30 bg-success-bg rounded-lg p-8 text-center space-y-4">
        <p className="text-5xl">✅</p>
        <h2 className="text-xl font-semibold text-success-text">Demande envoyée</h2>
        <p className="text-sm text-foreground">
          Votre ticket <strong>#{success.ticketId}</strong> a été reçu.<br />
          Un email de confirmation vous a été envoyé à <strong>{email}</strong>.
        </p>
        <p className="text-xs text-muted">
          Notre équipe le prendra en charge dans les plus brefs délais.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Type */}
      <fieldset>
        <legend className="block text-sm font-semibold mb-2">Type de demande</legend>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              aria-pressed={type === t.value}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition text-center ${
                type === t.value
                  ? "border-primary bg-primary-light text-primary font-semibold"
                  : "border-border bg-white hover:border-primary/40"
              }`}
            >
              <span className="text-2xl" aria-hidden>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {TYPES.find((t) => t.value === type)?.desc}
        </p>
      </fieldset>

      {/* Sujet */}
      <div>
        <label htmlFor="subject" className="block text-sm font-semibold mb-1">
          Sujet <span className="text-primary">*</span>
        </label>
        <input
          id="subject"
          type="text"
          required
          minLength={5}
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Résumé court du problème ou de la demande"
          className="w-full h-10 px-3 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-semibold mb-1">
          Description <span className="text-primary">*</span>
        </label>
        <textarea
          id="description"
          required
          minLength={10}
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Décrivez votre demande aussi précisément que possible."
          className="w-full px-3 py-2 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y transition"
        />
        <p className="mt-1 text-xs text-muted">
          {description.length} / 10 caractères minimum
        </p>
      </div>

      {/* Captures d'écran — uniquement pour Assistance */}
      {type === "assistance" && (
        <div>
          <label className="block text-sm font-semibold mb-1">
            Captures d&apos;écran <span className="text-muted text-xs font-normal">(optionnel, max {MAX_FILES})</span>
          </label>
          <div className="border-2 border-dashed border-border rounded-lg p-4 bg-surface">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="attachments"
            />
            <label
              htmlFor="attachments"
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm cursor-pointer transition ${
                files.length >= MAX_FILES
                  ? "bg-surface border border-border text-muted cursor-not-allowed"
                  : "bg-white border border-border hover:border-primary text-foreground"
              }`}
              aria-disabled={files.length >= MAX_FILES}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Ajouter des images
            </label>
            <span className="ml-3 text-xs text-muted">
              {files.length} / {MAX_FILES} • JPG, PNG, GIF, WEBP — 5 Mo max chacune
            </span>

            {files.length > 0 && (
              <ul className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
                {files.map((file, i) => {
                  const url = URL.createObjectURL(file);
                  return (
                    <li key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={file.name}
                        className="w-full aspect-square object-cover rounded-md border border-border"
                        onLoad={() => URL.revokeObjectURL(url)}
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        aria-label={`Retirer ${file.name}`}
                        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-foreground text-white flex items-center justify-center text-xs hover:bg-danger transition"
                      >
                        ×
                      </button>
                      <p className="mt-1 text-[10px] text-muted truncate" title={file.name}>{file.name}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Email + Nom */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="email" className="block text-sm font-semibold mb-1">
            Email <span className="text-primary">*</span>
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            className="w-full h-10 px-3 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
          />
        </div>
        <div>
          <label htmlFor="name" className="block text-sm font-semibold mb-1">
            Nom <span className="text-muted text-xs font-normal">(optionnel)</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 px-3 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
          />
        </div>
      </div>

      {/* Prénom + Entreprise — facultatifs : ils aident le support à situer le
          demandeur, sans jamais bloquer l'envoi d'une demande. */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-semibold mb-1">
            Prénom <span className="text-muted text-xs font-normal">(optionnel)</span>
          </label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full h-10 px-3 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
          />
        </div>
        <div>
          <label htmlFor="company" className="block text-sm font-semibold mb-1">
            Entreprise <span className="text-muted text-xs font-normal">(optionnel)</span>
          </label>
          <input
            id="company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nom de votre société"
            className="w-full h-10 px-3 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
          />
        </div>
      </div>

      {/* Champ contextuel : "Page concernée" pour assistance/suggestion (lié au
          logiciel), "Service concerné" pour autre (demandes administratives). */}
      {type === "autre" ? (
        <div>
          <label htmlFor="service" className="block text-sm font-semibold mb-1">
            Service concerné
          </label>
          <select
            id="service"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full h-10 px-3 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition bg-white"
          >
            <option value="">— Sélectionner un service —</option>
            {SERVICES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            Aide-nous à orienter ta demande vers la bonne équipe.
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor="page" className="block text-sm font-semibold mb-1">
            Page concernée <span className="text-muted text-xs font-normal">(optionnel)</span>
          </label>
          <select
            id="page"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            className="w-full h-10 px-3 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition bg-white font-mono text-sm"
          >
            <option value="">— Aucune page particulière —</option>
            {pageGroups.web.length > 0 && (
              <optgroup label="🖥️  Web">
                {pageGroups.web.map((p) => (
                  <option key={`web-${p.slug}`} value={p.slug}>{p.name}</option>
                ))}
              </optgroup>
            )}
            {pageGroups.mobile.length > 0 && (
              <optgroup label="📱  Mobile">
                {pageGroups.mobile.map((p) => (
                  <option key={`mobile-${p.slug}`} value={p.slug}>{p.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}

      {/* Honeypot — invisible, doit rester vide */}
      <div aria-hidden className="absolute left-[-9999px] w-px h-px overflow-hidden">
        <label>
          Site web
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <div className="border border-danger/40 bg-danger-bg text-foreground p-3 rounded-md text-sm" role="alert">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full h-11 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed transition"
      >
        {submitting ? "Envoi en cours…" : "Envoyer la demande"}
      </button>

      <p className="text-xs text-muted text-center">
        Vos données sont uniquement utilisées pour traiter votre demande.
      </p>
    </form>
  );
}
