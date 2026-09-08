"use client";

import { useField } from "@payloadcms/ui";
import { Fragment, useEffect, useRef, useState } from "react";

import { isSafeHref, parseMarkdown, type Block, type Span } from "@/modules/dev/lib/markdown";

/**
 * Une description qui s'ÉCRIT en texte brut et s'AFFICHE mise en forme.
 *
 * L'éditeur riche a été essayé puis retiré : on colle ici des demandes de
 * clients et des spécifications produites ailleurs, et un éditeur les retouche
 * au collage. Mais ce qu'on colle contient des listes numérotées, du `code`, du
 * **gras** — affiché tel quel, ça devient une bouillie de signes.
 *
 * D'où ce compromis : le texte enregistré reste EXACTEMENT ce qui a été tapé ou
 * collé (la donnée ne change pas, aucune migration), et la mise en forme n'est
 * qu'une lecture. Un clic rend la zone de texte, telle qu'elle était.
 */
type Props = {
  path?: string;
  field?: { label?: unknown; admin?: { placeholder?: string; description?: string } };
  readOnly?: boolean;
};

const renderSpans = (spans: Span[]) =>
  spans.map((span, i) => {
    switch (span.kind) {
      case "bold":
        return <strong key={i}>{span.value}</strong>;
      case "italic":
        return <em key={i}>{span.value}</em>;
      case "code":
        return (
          <code key={i} className="dev-md__code">
            {span.value}
          </code>
        );
      case "link":
        // Seuls http(s) et mailto deviennent cliquables — voir isSafeHref.
        return isSafeHref(span.href) ? (
          <a key={i} href={span.href} target="_blank" rel="noreferrer noopener">
            {span.value}
          </a>
        ) : (
          <Fragment key={i}>{span.value}</Fragment>
        );
      default:
        return <Fragment key={i}>{span.value}</Fragment>;
    }
  });

const renderBlock = (block: Block, i: number) => {
  if (block.kind === "heading") {
    const Tag = (["h3", "h4", "h5", "h6", "h6", "h6"][block.level - 1] ?? "h6") as "h3";
    return (
      <Tag key={i} className="dev-md__title">
        {renderSpans(block.spans)}
      </Tag>
    );
  }
  if (block.kind === "list") {
    const items = block.items.map((spans, j) => <li key={j}>{renderSpans(spans)}</li>);
    return block.ordered ? (
      <ol key={i} className="dev-md__list">
        {items}
      </ol>
    ) : (
      <ul key={i} className="dev-md__list">
        {items}
      </ul>
    );
  }
  return (
    <p key={i} className="dev-md__p">
      {renderSpans(block.spans)}
    </p>
  );
};

export const MarkdownField = (props: Props) => {
  const path = props.path ?? "description";
  const { setValue, value } = useField<string>({ path });
  const label = typeof props.field?.label === "string" ? props.field.label : "Description";
  const placeholder = props.field?.admin?.placeholder;
  const help = props.field?.admin?.description;

  const text = value ?? "";
  // Vide, on ouvre directement la saisie : il n'y a rien à lire.
  const [editing, setEditing] = useState(text.trim() === "");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div className="field-type dev-md">
      <label className="dev-cfield__label">{label}</label>

      {editing && !props.readOnly ? (
        <textarea
          ref={inputRef}
          className="dev-md__input"
          value={text}
          rows={4}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          // On quitte la saisie en cliquant ailleurs : le rendu revient sans
          // qu'il y ait un bouton « Terminer » à trouver.
          onBlur={() => {
            if (text.trim() !== "") setEditing(false);
          }}
        />
      ) : (
        <div
          className="dev-md__view"
          role={props.readOnly ? undefined : "button"}
          tabIndex={props.readOnly ? undefined : 0}
          title={props.readOnly ? undefined : "Cliquer pour modifier"}
          onClick={() => !props.readOnly && setEditing(true)}
          onKeyDown={(e) => {
            if (!props.readOnly && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setEditing(true);
            }
          }}
        >
          {parseMarkdown(text).map(renderBlock)}
        </div>
      )}

      {help ? <p className="dev-md__help">{help}</p> : null}
    </div>
  );
};
