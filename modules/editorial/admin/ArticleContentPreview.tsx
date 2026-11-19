"use client";

import { useFormFields } from "@payloadcms/ui";

import type { WpAcf } from "@/modules/editorial/lib/articles/from-wp";

/**
 * L'article en lecture : TL;DR et introduction, blocs, conclusion, FAQ,
 * sources. L'article rédigé par le support (`draft`, étape 5) s'il existe ;
 * sinon la copie synchronisée de WordPress (champs ACF). Il ne se modifie pas ici.
 *
 * Le HTML vient de notre propre WordPress ; les balises <script>, <iframe> et
 * les attributs d'événement sont tout de même retirés avant l'affichage.
 */

const clean = (html: unknown) =>
  String(html ?? "")
    .replace(/<\s*(script|iframe|object|embed|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2");

const arr = <T,>(v: T[] | false | null | undefined): T[] => (Array.isArray(v) ? v : []);

export function ArticleContentPreview() {
  const wp = useFormFields(([fields]) => fields.acf?.value) as WpAcf | undefined;
  const draft = useFormFields(([fields]) => fields.draft?.value) as (WpAcf & { title?: string }) | undefined;
  const link = useFormFields(([fields]) => fields.wpLink?.value) as string | undefined;
  const filled = (v: unknown): v is WpAcf => Boolean(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length);
  // L'article rédigé par le support tant qu'il n'est pas dans WordPress ; ensuite, WordPress fait foi.
  const fromDraft = filled(draft) && !filled(wp);
  const acf = fromDraft ? draft : filled(wp) ? wp : null;

  if (!acf) {
    return <p className="art-preview__empty">Pas encore de contenu : l'article n'est ni rédigé ni dans WordPress.</p>;
  }
  return (
    <div className="art-preview">
      <div className="art-preview__head">
        <strong>{fromDraft ? "Article rédigé (pas encore dans WordPress)" : "Contenu dans WordPress"}</strong>
        {!fromDraft && link && (
          <a href={link} target="_blank" rel="noreferrer">
            Voir sur le site ↗
          </a>
        )}
      </div>
      {acf.introduction && <section className="art-preview__part" dangerouslySetInnerHTML={{ __html: clean(acf.introduction) }} />}
      {arr(acf.contenu).map((b, i) =>
        typeof b.texte === "string" ? (
          <section key={i} className="art-preview__part" dangerouslySetInnerHTML={{ __html: clean(b.texte) }} />
        ) : (
          <p key={i} className="art-preview__other">Bloc « {String(b.acf_fc_layout ?? "?")} » (non affiché ici).</p>
        ),
      )}
      {acf.conclusion && <section className="art-preview__part" dangerouslySetInnerHTML={{ __html: clean(acf.conclusion) }} />}
      {arr(acf.faq).length > 0 && (
        <section className="art-preview__part">
          <h2>FAQ</h2>
          {arr(acf.faq).map((q, i) => (
            <div key={i} className="art-preview__faq">
              <h3>{q.titre}</h3>
              <div dangerouslySetInnerHTML={{ __html: clean(q.text) }} />
            </div>
          ))}
        </section>
      )}
      {arr(acf.sources).length > 0 && (
        <section className="art-preview__part">
          <h2>Sources</h2>
          <ul>
            {arr(acf.sources).map((s, i) => (
              <li key={i}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.libelle || s.url}
                  </a>
                ) : (
                  s.libelle
                )}
                {s.date ? ` (${s.date})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
