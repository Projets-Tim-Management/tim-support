"use client";

import { useEffect, useRef, useState } from "react";

import ContactPicker from "@/modules/marketing/admin/ContactPicker";
import { parseRecipients, type MassEmailTemplate, type Recipient } from "@/modules/marketing/lib/mass-email";
import type { DirectoryEntry, MassSender } from "@/modules/marketing/lib/mass-email-server";

import "./mass-email.scss";

/**
 * Écran « E-mail de masse » : trois étapes numérotées, l'aperçu à côté, et une
 * barre d'envoi qui reste en bas de l'écran.
 *
 * Les adresses deviennent des pastilles dès qu'on les colle : on VOIT qui va
 * recevoir quoi (prénom reconnu compris), on en retire une d'un clic, et une
 * adresse mal écrite reste en rouge au lieu de disparaître en silence. L'aperçu
 * se présente comme une messagerie — De, À, Objet — parce que c'est la
 * question qu'on se pose : « qu'est-ce qu'il va voir, lui ? ».
 */

type Sender = MassSender;
type Result = { email: string; status: "sent" | "suppressed" | "failed" };

const STATUS_LABEL: Record<Result["status"], string> = {
  sent: "Envoyé",
  suppressed: "Non envoyé — désinscrit",
  failed: "Échec",
};

// Route Next, hors de l'API REST de Payload (/payload-api) : chemin absolu.
const API = "/api/admin/emails-de-masse";

/** La liste telle que l'API la relit : « Prénom <adresse> » garde le prénom. */
const serialize = (list: Recipient[]) =>
  list.map((r) => (r.firstName ? `${r.firstName} <${r.email}>` : r.email)).join("\n");

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mass-mail__step">
      <header className="mass-mail__step-head">
        <span className="mass-mail__step-num">{n}</span>
        <div>
          <h2 className="mass-mail__step-title">{title}</h2>
          {hint && <p className="mass-mail__hint">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export default function MassEmailForm({
  initialTemplates,
  directory,
  senders,
  defaultSender,
  signatures,
  onSent,
  onShowCampaigns,
}: {
  onSent?: () => void;
  onShowCampaigns?: () => void;
  initialTemplates: MassEmailTemplate[];
  directory: DirectoryEntry[];
  senders: Sender[];
  defaultSender: string | null;
  /** Par adresse d'expédition : sa fiche partenaire a-t-elle une signature ? */
  signatures: Record<string, boolean>;
}) {
  const [fromEmail, setFromEmail] = useState(defaultSender ?? "");
  // Cochée par défaut ; sans effet pour une adresse qui n'a pas de signature.
  const [withSignature, setWithSignature] = useState(true);
  const hasSignature = Boolean(signatures[fromEmail]);
  const sender = senders.find((s) => s.email === fromEmail) ?? null;
  const first = initialTemplates[0];
  const [templates, setTemplates] = useState<MassEmailTemplate[]>(initialTemplates);
  const [templateKey, setTemplateKey] = useState(first?.key ?? "");

  const [list, setList] = useState<Recipient[]>([]);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const [subject, setSubject] = useState(first?.subject ?? "");
  const [body, setBody] = useState(first?.body ?? "");
  const [closing, setClosing] = useState(first?.closing ?? "");

  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const template = templates.find((t) => t.key === templateKey);
  const recipients = serialize(list);

  const applyTemplate = (t: MassEmailTemplate) => {
    setTemplateKey(t.key);
    setSubject(t.subject);
    setBody(t.body);
    setClosing(t.closing);
  };

  const [picking, setPicking] = useState(false);

  /** Ajoute à la liste d'envoi ; les doublons sont ignorés. */
  const addRecipients = (more: Recipient[]) =>
    setList((prev) => {
      const seen = new Set(prev.map((r) => r.email));
      return [...prev, ...more.filter((r) => !seen.has(r.email))];
    });

  /** Ajoute ce qui a été tapé ou collé. Un prénom connu du carnet complète l'adresse nue. */
  const commit = (raw: string) => {
    const { valid, invalid: bad } = parseRecipients(raw);
    const known = new Map(directory.map((d) => [d.email, d.firstName]));
    if (valid.length) addRecipients(valid.map((r) => ({ ...r, firstName: r.firstName ?? known.get(r.email) ?? null })));
    setInvalid((prev) => [...new Set([...prev, ...bad])]);
    setDraft("");
  };

  // Suggestions sous le champ : dès deux lettres, les contacts qui correspondent.
  const inList = new Set(list.map((r) => r.email));
  const q = draft.trim().toLowerCase();
  const suggestions =
    q.length >= 2 && !/[\n,;]/.test(q)
      ? directory
          .filter(
            (d) =>
              !d.suppressed &&
              !inList.has(d.email) &&
              `${d.name ?? ""} ${d.company ?? ""} ${d.email}`.toLowerCase().includes(q),
          )
          .slice(0, 6)
      : [];

  // Aperçu : recalculé côté serveur (signature comprise) un instant après la frappe.
  useEffect(() => {
    if (!templateKey) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const res = await fetch(API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          subject,
          body,
          closing,
          preheader: template?.preheader,
          recipients,
          from: fromEmail,
          signature: withSignature && hasSignature,
        }),
      });
      if (res.ok) setPreview((await res.json()) as { subject: string; html: string });
    }, 450);
    return () => window.clearTimeout(timer.current);
  }, [templateKey, subject, body, closing, recipients, template?.preheader, withSignature, hasSignature, fromEmail]);

  /** Supprime un modèle enregistré ; si c'était celui à l'écran, on revient à la page blanche. */
  async function deleteTemplate(key: string) {
    const res = await fetch(API, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", key }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setConfirmDelete(null);
    if (!res.ok) {
      setNotice({ kind: "error", text: json.error ?? "Le modèle n'a pas pu être supprimé." });
      return;
    }
    const removed = templates.find((t) => t.key === key);
    setTemplates((prev) => prev.filter((t) => t.key !== key));
    if (templateKey === key && templates[0]) applyTemplate(templates[0]);
    setNotice({ kind: "ok", text: `Modèle « ${removed?.label ?? ""} » supprimé.` });
  }

  /** Enregistre le message tel qu'il est à l'écran, et le sélectionne. */
  async function saveTemplate() {
    if (!saveName?.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", name: saveName, subject, body, closing }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; template?: MassEmailTemplate };
      if (!res.ok || !json.template) {
        setNotice({ kind: "error", text: json.error ?? "Le modèle n'a pas pu être enregistré." });
        return;
      }
      setTemplates((prev) => [...prev, json.template as MassEmailTemplate]);
      setTemplateKey(json.template.key);
      setSaveName(null);
      setNotice({ kind: "ok", text: `Modèle « ${json.template.label} » enregistré.` });
    } finally {
      setSaving(false);
    }
  }

  async function post(action: "test" | "send") {
    setBusy(action);
    setNotice(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          subject,
          body,
          closing,
          preheader: template?.preheader,
          recipients,
          from: fromEmail,
          signature: withSignature && hasSignature,
          templateLabel: template?.label,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; to?: string; results?: Result[] };
      if (!res.ok) {
        setNotice({ kind: "error", text: json.error ?? "L'envoi n'a pas abouti." });
        return;
      }
      if (action === "test") {
        setNotice({ kind: "ok", text: `E-mail de test envoyé à ${json.to}. Vérifiez votre boîte de réception.` });
        return;
      }
      const out = json.results ?? [];
      setResults(out);
      onSent?.();
      const sent = out.filter((r) => r.status === "sent").length;
      setNotice({
        kind: sent === out.length ? "ok" : "error",
        text: `${sent} e-mail${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""} sur ${out.length}.`,
      });
      // Les adresses servies sortent de la liste : un second clic ne renvoie rien en double.
      const done = new Set(out.filter((r) => r.status === "sent").map((r) => r.email));
      setList((prev) => prev.filter((r) => !done.has(r.email)));
    } catch {
      setNotice({ kind: "error", text: "L'envoi n'a pas abouti — vérifiez la connexion." });
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  }

  const count = list.length;
  const complete = Boolean(subject.trim() && body.trim());
  const canSend = Boolean(sender) && complete && count > 0 && !busy;
  const edited = template && (subject !== template.subject || body !== template.body || closing !== template.closing);
  const from = sender ? (sender.name ? `${sender.name} <${sender.email}>` : sender.email) : "—";

  return (
    <div className="mass-mail">
      {senders.length === 0 && (
        <p className="mass-mail__banner is-warning">
          Aucune adresse n&apos;est utilisable comme expéditeur : il en faut une inscrite chez Brevo, avec un domaine
          authentifié.
        </p>
      )}

      <div className="mass-mail__grid">
        <div className="mass-mail__steps">
          <Step n={1} title="Modèle" hint="Un point de départ : tout reste modifiable ensuite.">
            <div className="mass-mail__templates">
              {templates.map((t) => {
                const saved = t.key.startsWith("saved-");
                if (confirmDelete === t.key) {
                  return (
                    <div key={t.key} className="mass-mail__template is-confirm">
                      <span className="mass-mail__template-name">Supprimer « {t.label} » ?</span>
                      <span className="mass-mail__template-desc">
                        {t.description.includes("TIM")
                          ? "Modèle TIM : il disparaît aussi du composeur des opportunités."
                          : "Il disparaît aussi du composeur de vos opportunités."}
                      </span>
                      <span className="mass-mail__template-actions">
                        <button type="button" className="mass-mail__btn is-danger" onClick={() => void deleteTemplate(t.key)}>
                          Supprimer
                        </button>
                        <button type="button" className="mass-mail__link" onClick={() => setConfirmDelete(null)}>
                          Annuler
                        </button>
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={t.key} className="mass-mail__template-wrap">
                    <button
                      type="button"
                      aria-pressed={t.key === templateKey}
                      className={`mass-mail__template ${t.key === templateKey ? "is-active" : ""}`}
                      onClick={() => applyTemplate(t)}
                    >
                      <span className="mass-mail__template-name">{t.label}</span>
                      <span className="mass-mail__template-desc">{t.description}</span>
                    </button>
                    {saved && (
                      <button
                        type="button"
                        className="mass-mail__template-delete"
                        aria-label={`Supprimer le modèle « ${t.label} »`}
                        title="Supprimer ce modèle"
                        onClick={() => setConfirmDelete(t.key)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Step>

          <Step n={2} title="Destinataires" hint="Chacun reçoit son propre e-mail : personne ne voit les autres adresses.">
            <div
              className="mass-mail__chips"
              onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
            >
              {list.map((r) => (
                <span key={r.email} className="mass-mail__chip" title={r.email}>
                  {r.firstName ? (
                    <>
                      <strong>{r.firstName}</strong> <span className="mass-mail__chip-mail">{r.email}</span>
                    </>
                  ) : (
                    r.email
                  )}
                  <button
                    type="button"
                    aria-label={`Retirer ${r.email}`}
                    onClick={() => setList((prev) => prev.filter((x) => x.email !== r.email))}
                  >
                    ×
                  </button>
                </span>
              ))}
              {invalid.map((raw) => (
                <span key={raw} className="mass-mail__chip is-error" title="Adresse illisible">
                  {raw}
                  <button
                    type="button"
                    aria-label={`Retirer ${raw}`}
                    onClick={() => setInvalid((prev) => prev.filter((x) => x !== raw))}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === "," || e.key === ";") && draft.trim()) {
                    e.preventDefault();
                    commit(draft);
                  } else if (e.key === "Backspace" && !draft && list.length) {
                    setList((prev) => prev.slice(0, -1));
                  }
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (/[\n,;]/.test(text)) {
                    e.preventDefault();
                    commit(`${draft}\n${text}`);
                  }
                }}
                onBlur={() => window.setTimeout(() => draft.trim() && commit(draft), 150)}
                placeholder={count ? "Ajouter une adresse ou un nom…" : "Tapez un nom, une société, ou collez une liste d'adresses"}
              />
            </div>
            {suggestions.length > 0 && (
              <ul className="mass-mail__suggest" role="listbox">
                {suggestions.map((d) => (
                  <li key={d.email}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        addRecipients([{ email: d.email, firstName: d.firstName }]);
                        setDraft("");
                      }}
                    >
                      <strong>{d.name ?? d.email}</strong>
                      <span>{[d.name ? d.email : null, d.company].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {picking ? (
              <ContactPicker
                directory={directory}
                already={inList}
                onAdd={(more) => {
                  addRecipients(more);
                  setPicking(false);
                }}
                onClose={() => setPicking(false)}
              />
            ) : (
              <button type="button" className="mass-mail__btn mass-mail__open-picker" onClick={() => setPicking(true)}>
                Choisir dans les contacts ({directory.length})
              </button>
            )}
            <div className="mass-mail__chips-foot">
              <span className="mass-mail__pill">
                {count} destinataire{count > 1 ? "s" : ""}
              </span>
              {invalid.length > 0 && (
                <span className="mass-mail__pill is-error">
                  {invalid.length} adresse{invalid.length > 1 ? "s" : ""} à corriger
                </span>
              )}
              <span className="mass-mail__hint">« Prénom Nom &lt;adresse&gt; » personnalise le « Bonjour ».</span>
              {count > 0 && (
                <button type="button" className="mass-mail__link" onClick={() => setList([])}>
                  Tout retirer
                </button>
              )}
            </div>
          </Step>

          <Step n={3} title="Message">
            <div className="mass-mail__row">
              <label className="mass-mail__field mass-mail__field--grow">
                <span className="mass-mail__label">De</span>
                <select value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} disabled={senders.length === 0}>
                  {senders.map((s) => (
                    <option key={s.email} value={s.email}>
                      {s.name ? `${s.name} — ${s.email}` : s.email}
                    </option>
                  ))}
                </select>
                <span className="mass-mail__hint">Les réponses arrivent à cette adresse.</span>
              </label>
              <label className={`mass-mail__switch ${hasSignature ? "" : "is-disabled"}`}>
                <input
                  type="checkbox"
                  checked={withSignature && hasSignature}
                  disabled={!hasSignature}
                  onChange={(e) => setWithSignature(e.target.checked)}
                />
                <span className="mass-mail__switch-track" aria-hidden="true" />
                <span>
                  <span className="mass-mail__label">Signature</span>
                  <span className="mass-mail__hint">
                    {hasSignature
                      ? withSignature
                        ? "Ajoutée sous le message"
                        : "Envoi sans signature"
                      : "Aucune signature pour cette adresse"}
                  </span>
                </span>
              </label>
            </div>
            <label className="mass-mail__field">
              <span className="mass-mail__label">Objet</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            </label>
            <label className="mass-mail__field">
              <span className="mass-mail__label">Texte</span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} />
              <span className="mass-mail__tokens">
                <code>{"{{prenom}}"}</code> prénom du destinataire
                <code>**gras**</code> mise en avant
                <code>[texte](https://…)</code> lien
              </span>
            </label>
            <label className="mass-mail__field">
              <span className="mass-mail__label">Formule de politesse</span>
              <input value={closing} onChange={(e) => setClosing(e.target.value)} maxLength={120} />
              <span className="mass-mail__hint">{withSignature && hasSignature ? "La signature est ajoutée en dessous." : "C'est la dernière ligne du message."}</span>
            </label>
            <div className="mass-mail__step-foot">
              {saveName === null ? (
                <button type="button" className="mass-mail__link" disabled={!complete} onClick={() => setSaveName("")}>
                  Enregistrer comme modèle
                </button>
              ) : (
                <span className="mass-mail__save">
                  <input
                    autoFocus
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveTemplate();
                      } else if (e.key === "Escape") setSaveName(null);
                    }}
                    placeholder="Nom du modèle, ex. « Invitation webinaire »"
                    maxLength={120}
                  />
                  <button type="button" className="mass-mail__btn" disabled={!saveName.trim() || saving} onClick={() => void saveTemplate()}>
                    {saving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  <button type="button" className="mass-mail__link" onClick={() => setSaveName(null)}>
                    Annuler
                  </button>
                </span>
              )}
              {edited && (
                <button type="button" className="mass-mail__link" onClick={() => template && applyTemplate(template)}>
                  Revenir au texte du modèle
                </button>
              )}
            </div>
          </Step>
        </div>

        <aside className="mass-mail__preview">
          <div className="mass-mail__preview-bar">
            <span className="mass-mail__label">Aperçu</span>
            <div className="mass-mail__toggle" role="group" aria-label="Taille de l'aperçu">
              <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>
                Ordinateur
              </button>
              <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>
                Téléphone
              </button>
            </div>
          </div>
          <div className={`mass-mail__client is-${device}`}>
            <dl className="mass-mail__headers">
              <div>
                <dt>De</dt>
                <dd>{from}</dd>
              </div>
              <div>
                <dt>À</dt>
                <dd>{list[0] ? list[0].email : <span className="mass-mail__muted">chaque destinataire, un par un</span>}</dd>
              </div>
              <div>
                <dt>Objet</dt>
                <dd className="mass-mail__subject">{preview?.subject || subject || "(sans objet)"}</dd>
              </div>
            </dl>
            {preview ? (
              <iframe title="Aperçu de l'e-mail" srcDoc={preview.html} className="mass-mail__frame" />
            ) : (
              <p className="mass-mail__hint mass-mail__loading">Chargement de l&apos;aperçu…</p>
            )}
          </div>
        </aside>
      </div>

      {results && results.length > 0 && onShowCampaigns && (
        <button type="button" className="mass-mail__link mass-mail__to-stats" onClick={onShowCampaigns}>
          Suivre les ouvertures et les clics de cet envoi →
        </button>
      )}
      {results && results.length > 0 && (
        <ul className="mass-mail__results">
          {results.map((r) => (
            <li key={r.email} className={`is-${r.status}`}>
              <span>{r.email}</span>
              <span>{STATUS_LABEL[r.status]}</span>
            </li>
          ))}
        </ul>
      )}

      {/* La barre d'envoi reste visible : on n'a pas à remonter pour envoyer. */}
      <div className="mass-mail__bar">
        <div className="mass-mail__bar-info">
          {notice ? (
            <span className={`mass-mail__notice is-${notice.kind}`}>{notice.text}</span>
          ) : (
            <span>
              <strong>
                {count} destinataire{count > 1 ? "s" : ""}
              </strong>{" "}
              · un e-mail chacun · depuis {sender?.email ?? "—"}
              {withSignature && hasSignature ? "" : " · sans signature"}
            </span>
          )}
        </div>
        <div className="mass-mail__bar-actions">
          <button
            type="button"
            className="mass-mail__btn"
            disabled={!sender || !complete || Boolean(busy)}
            onClick={() => post("test")}
          >
            {busy === "test" ? "Envoi…" : "M'envoyer un test"}
          </button>
          {confirming ? (
            <>
              <button type="button" className="mass-mail__link" disabled={Boolean(busy)} onClick={() => setConfirming(false)}>
                Annuler
              </button>
              <button type="button" className="mass-mail__btn is-primary" disabled={!canSend} onClick={() => post("send")}>
                {busy === "send" ? "Envoi en cours…" : `Confirmer : ${count} e-mail${count > 1 ? "s" : ""}`}
              </button>
            </>
          ) : (
            <button type="button" className="mass-mail__btn is-primary" disabled={!canSend} onClick={() => setConfirming(true)}>
              Envoyer à {count} personne{count > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
