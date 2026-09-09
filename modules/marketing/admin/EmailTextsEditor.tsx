"use client";

import { useFormFields, useForm } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EMAIL_SLOTS } from "@/modules/marketing/lib/email-slots";
import { JOURNEY_VARIABLES } from "@/modules/marketing/lib/journey-vars";

/**
 * Réécrire les textes du parcours, message par message.
 *
 * Le tableau brut derrière cet écran est une liste de triplets
 * (message, bloc, texte) : lisible par la machine, illisible par nous. On montre
 * donc ce qu'on vient régler — les messages, et dans chacun ses blocs — et on
 * range dans le tableau ce qui a été écrit.
 *
 * Deux garde-fous portés par l'écran lui-même :
 *  - un champ VIDE ramène le texte livré avec le logiciel. C'est écrit à côté du
 *    champ, parce que c'est ce qui rend l'écran sans danger : on peut toujours
 *    revenir en arrière en effaçant ;
 *  - l'APERÇU se fait avant d'enregistrer. Sans lui, il faudrait publier une
 *    formulation pour la relire.
 */

type Row = { key?: string; slot?: string; value?: string };

const KEYS = Object.keys(EMAIL_SLOTS);

/**
 * Les reprises enregistrées, relues à CHAQUE modification — pas seulement quand
 * une ligne apparaît ou disparaît.
 *
 * `useFormFields` ne rend qu'une valeur PRIMITIVE sans faire re-rendre à chaque
 * frappe ailleurs dans le formulaire : on en tire une empreinte du tableau, et
 * on relit les lignes quand elle change. Se caler sur le seul NOMBRE de lignes
 * laissait la pastille « réécrit » et le compteur en retard d'une modification,
 * puisque réécrire un bloc n'ajoute ni ne retire de ligne.
 */
function useTextRows(): Row[] {
  const { getDataByPath } = useForm();
  const empreinte = useFormFields(([fields]) =>
    Object.keys(fields)
      .filter((path) => path.startsWith("emailTexts."))
      .sort()
      .map((path) => `${path}=${String(fields[path]?.value ?? "")}`)
      .join("\u0000"),
  );

  return useMemo(
    () => ((getDataByPath("emailTexts") ?? []) as Row[]) || [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getDataByPath, empreinte],
  );
}

export const EmailTextsEditor = () => {
  const rows = useTextRows();

  /**
   * Les objets déclarés sur l'onglet « Parcours » : ils nomment les messages.
   *
   * Reconstruits depuis une empreinte, et non rendus directement par le
   * sélecteur : un objet neuf à chaque appel ferait re-rendre tout l'écran au
   * moindre changement ailleurs dans le formulaire — et cet écran contient
   * quatorze aperçus.
   */
  const empreinteObjets = useFormFields(([fields]) =>
    Object.keys(fields)
      .filter((path) => /^emails\.\d+\.key$/.test(path))
      .sort()
      .map((path) => {
        const index = path.split(".")[1];
        return `${String(fields[path]?.value ?? "")}\u0001${String(fields[`emails.${index}.subject`]?.value ?? "")}`;
      })
      .join("\u0000"),
  );

  const subjects = useMemo(() => {
    const out: Record<string, string> = {};
    for (const paire of empreinteObjets.split("\u0000")) {
      const [key, subject] = paire.split("\u0001");
      if (key && subject) out[key] = subject;
    }
    return out;
  }, [empreinteObjets]);

  const [open, setOpen] = useState<string | null>(null);

  const valueOf = (key: string, slot: string) =>
    rows.find((r) => r.key === key && r.slot === slot)?.value ?? "";

  return (
    <div className="field-type jr-texts">
      <p className="jr-texts__intro">
        Chaque champ montre le texte qui part aujourd&apos;hui. Modifiez-le pour le
        remplacer&nbsp;; <strong>videz-le pour revenir au texte d&apos;origine</strong>.
      </p>

      <details className="jr-texts__vars">
        <summary>Variables disponibles</summary>
        <ul>
          {JOURNEY_VARIABLES.map((v) => (
            <li key={v.token}>
              <code>{`{{${v.token}}}`}</code> — {v.label} : {v.hint}
            </li>
          ))}
        </ul>
      </details>

      {KEYS.map((key) => (
        <MessageBlock
          key={key}
          messageKey={key}
          subject={subjects[key]}
          open={open === key}
          onToggle={() => setOpen((v) => (v === key ? null : key))}
          valueOf={valueOf}
        />
      ))}
    </div>
  );
};

/** Un message, replié par défaut : quatorze messages dépliés ne se lisent pas. */
function MessageBlock({
  messageKey,
  subject,
  open,
  onToggle,
  valueOf,
}: {
  messageKey: string;
  subject?: string;
  open: boolean;
  onToggle: () => void;
  valueOf: (key: string, slot: string) => string;
}) {
  const slots = EMAIL_SLOTS[messageKey] ?? [];
  // Ce qui DIFFÈRE du texte livré, pas ce qui est renseigné : les champs sont
  // préremplis, donc « renseigné » serait vrai partout et ne dirait rien.
  const repris = slots.filter((s) => {
    const v = valueOf(messageKey, s.slot).trim();
    return v !== "" && v !== s.defaut.trim();
  }).length;

  return (
    <section className={`jr-texts__msg${open ? " jr-texts__msg--open" : ""}`}>
      <button type="button" className="jr-texts__head" onClick={onToggle} aria-expanded={open}>
        <span className="jr-texts__name">{subject || messageKey}</span>
        <span className={`jr-texts__count${repris > 0 ? " jr-texts__count--on" : ""}`}>
          {repris > 0
            ? `${repris} bloc${repris > 1 ? "s" : ""} réécrit${repris > 1 ? "s" : ""}`
            : "texte d'origine"}
        </span>
      </button>
      {open ? <MessageFields messageKey={messageKey} /> : null}
    </section>
  );
}

/**
 * Les champs d'un message, branchés sur les lignes du tableau Payload.
 *
 * Chaque bloc lit et écrit SA ligne : c'est ce qui permet de n'enregistrer que
 * ce qui a été réécrit, et de faire disparaître la ligne quand on efface.
 */
function MessageFields({ messageKey }: { messageKey: string }) {
  const { addFieldRow, removeFieldRow, replaceFieldRow } = useForm();
  const rows = useTextRows();
  const slots = EMAIL_SLOTS[messageKey] ?? [];

  const set = (slot: string, value: string) => {
    const index = rows.findIndex((r) => r.key === messageKey && r.slot === slot);
    const clean = value.trim();
    const ligne = {
      key: { initialValue: messageKey, valid: true, value: messageKey },
      slot: { initialValue: slot, valid: true, value: slot },
      value: { initialValue: value, valid: true, value },
    };

    if (index === -1) {
      if (!clean) return;
      addFieldRow({ path: "emailTexts", schemaPath: "emailTexts", subFieldState: ligne });
      return;
    }

    // Vidé : la ligne disparaît, et le texte d'origine repart.
    if (!clean) {
      removeFieldRow({ path: "emailTexts", rowIndex: index });
      return;
    }

    replaceFieldRow({
      path: "emailTexts",
      rowIndex: index,
      schemaPath: "emailTexts",
      subFieldState: ligne,
    });
  };

  const texts = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of rows) if (r.key === messageKey && r.slot && r.value) out[r.slot] = r.value;
    return out;
  }, [rows, messageKey]);

  return (
    <div className="jr-texts__body">
      {slots.map((s) => (
        <SlotField
          key={s.slot}
          label={s.label}
          hint={s.hint}
          // Le champ montre le texte QUI PART : la reprise si elle existe, sinon
          // celui livré avec le logiciel. Un champ vide n'apprendrait rien et
          // obligerait à ouvrir un aperçu pour savoir ce qu'on remplace.
          value={rows.find((r) => r.key === messageKey && r.slot === s.slot)?.value ?? s.defaut}
          origine={s.defaut}
          onChange={(v) => set(s.slot, v)}
        />
      ))}
      <Preview messageKey={messageKey} texts={texts} />
    </div>
  );
}

/**
 * Un bloc, prérempli du texte qui part aujourd'hui.
 *
 * Vidé, il REVIENT au texte d'origine — c'est le geste d'annulation, et il n'y
 * en a pas d'autre à apprendre. Le champ ne peut donc jamais rester vide : un
 * message amputé d'un paragraphe partirait sans que rien ne le signale.
 *
 * L'écriture se fait à la sortie du champ, pas à chaque frappe : réécrire le
 * tableau à chaque lettre republie tout le formulaire et fait sauter le curseur.
 */
function SlotField({
  label,
  hint,
  value,
  origine,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  origine: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const modifie = value.trim() !== origine.trim();

  return (
    <label className="jr-texts__field">
      <span className="jr-texts__label">
        {label}
        {modifie ? <em className="jr-texts__tag">réécrit</em> : null}
      </span>
      <textarea
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          // Vidé : on remet le texte d'origine sous les yeux, et on efface la
          // reprise. Le champ montre toujours ce qui part.
          const suivant = draft.trim() === "" ? "" : draft;
          if (suivant === "") setDraft(origine);
          if ((suivant || origine) !== value) onChange(suivant);
        }}
      />
      <span className="jr-texts__hint">
        {hint}
        {modifie ? " — videz le champ pour revenir au texte d'origine." : ""}
      </span>
    </label>
  );
}

/** Le message tel qu'il partira, avec ce qui est saisi — avant d'enregistrer. */
function Preview({ messageKey, texts }: { messageKey: string; texts: Record<string, string> }) {
  const [html, setHtml] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/journey-texts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: messageKey, texts }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { html: string; subject: string };
      setHtml(body.html);
      setSubject(body.subject);
    } catch {
      setHtml(null);
    } finally {
      setBusy(false);
    }
  }, [messageKey, texts]);

  // Un premier aperçu à l'ouverture ; ensuite, à la demande — recharger à chaque
  // frappe ferait clignoter la page pour rien.
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void load();
  }, [load]);

  return (
    <div className="jr-texts__preview">
      <div className="jr-texts__preview-bar">
        <span>
          Aperçu <em>(valeurs d&apos;exemple)</em>
          {subject ? ` — ${subject}` : ""}
        </span>
        <button
          type="button"
          className="jr-btn jr-btn--small jr-btn--quiet"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy ? "…" : "Actualiser"}
        </button>
      </div>
      {html ? (
        <iframe title={`Aperçu ${messageKey}`} srcDoc={html} className="jr-texts__frame" />
      ) : (
        <p className="jr-texts__ko">Aperçu indisponible.</p>
      )}
    </div>
  );
}
