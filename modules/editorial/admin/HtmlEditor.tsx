"use client";

import { useEffect, useRef } from "react";

/**
 * ÉDITEUR DE TEXTE ENRICHI QUI GARDE LE HTML DE WORDPRESS (tiroir, étape 3, 19/11/2026).
 *
 * Les champs ACF des articles sont du HTML (capsules en <strong>, tableaux,
 * liens, titres) : l'éditeur de notes du support, qui enregistre du Markdown,
 * les aurait abîmés. Ici :
 *  - le HTML est chargé une seule fois, au montage (le réécrire à chaque frappe
 *    replacerait le curseur au début) ;
 *  - le COLLER est forcé en texte brut (pas de styles ni de polices importés) ;
 *  - les attributs `style` et les <span> ajoutés par le navigateur sont retirés ;
 *  - une barre d'outils courte : paragraphe, H2, H3, gras (capsule), italique,
 *    listes, lien.
 */

/**
 * Les <div> NUS (sans attribut) qu'ajoute le navigateur à la frappe deviennent des <p>, avec LEUR
 * balise fermante. Un <div> qui porte une classe (l'encadré « Points clés », `tldr-box`) est
 * gardé tel quel, fermeture comprise : le 19/11/2026, remplacer TOUS les </div> cassait la TL;DR.
 */
function bareDivsToParagraphs(html: string): string {
  const stack: boolean[] = [];
  return html.replace(/<div\b([^>]*)>|<\/div\s*>/gi, (tag, attrs: string | undefined) => {
    if (tag[1] !== "/") {
      const bare = !/\bclass\s*=/i.test(String(attrs ?? ""));
      stack.push(bare);
      return bare ? "<p>" : tag;
    }
    return stack.pop() ? "</p>" : tag;
  });
}

/** Nettoie le HTML produit par le navigateur. Pure (testée). */
export function cleanEditorHtml(html: string): string {
  return bareDivsToParagraphs(html.replace(/\sstyle="[^"]*"/gi, ""))
    .replace(/<span(?:\s[^>]*)?>([\s\S]*?)<\/span>/gi, "$1")
    .replace(/<b>/gi, "<strong>")
    .replace(/<\/b>/gi, "</strong>")
    .replace(/<i>/gi, "<em>")
    .replace(/<\/i>/gi, "</em>")
    .replace(/<p><br\s*\/?><\/p>/gi, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

const TOOLS: { label: string; title: string; run: () => void }[] = [
  { label: "¶", title: "Paragraphe", run: () => document.execCommand("formatBlock", false, "P") },
  { label: "H2", title: "Titre H2", run: () => document.execCommand("formatBlock", false, "H2") },
  { label: "H3", title: "Sous-titre H3", run: () => document.execCommand("formatBlock", false, "H3") },
  { label: "G", title: "Gras (réservé aux capsules)", run: () => document.execCommand("bold") },
  { label: "I", title: "Italique", run: () => document.execCommand("italic") },
  { label: "•", title: "Liste à puces", run: () => document.execCommand("insertUnorderedList") },
  { label: "1.", title: "Liste numérotée", run: () => document.execCommand("insertOrderedList") },
  {
    label: "🔗",
    title: "Lien",
    run: () => {
      const url = window.prompt("Adresse du lien (une page précise, jamais une page d'accueil) :");
      if (url) document.execCommand("createLink", false, url.trim());
    },
  },
  { label: "⨯🔗", title: "Retirer le lien", run: () => document.execCommand("unlink") },
];

export function HtmlEditor({ value, onChange, minHeight = 120 }: { value: string; onChange: (html: string) => void; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value;
    // Au montage seulement (voir l'en-tête : curseur).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const emit = () => ref.current && onChange(cleanEditorHtml(ref.current.innerHTML));
  return (
    <div className="hed">
      <div className="hed__bar" role="toolbar" aria-label="Mise en forme">
        {TOOLS.map((t) => (
          <button
            key={t.title}
            type="button"
            title={t.title}
            className="hed__btn"
            // La barre ne prend jamais le focus : la sélection à formater est gardée.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              t.run();
              emit();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        className="hed__area cdr-html"
        contentEditable
        suppressContentEditableWarning
        style={{ minHeight }}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
      />
    </div>
  );
}
