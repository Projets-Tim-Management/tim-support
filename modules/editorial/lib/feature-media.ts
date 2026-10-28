/**
 * Les médias qu'une feature UTILISE : la vignette, et dans chaque partie les
 * blocs « Image / GIF / vidéo », « Galerie » et « Fichier ».
 *
 * Module pur, partagé par le nettoyage à la publication (voir
 * hooks/purgeReplacedMedia) : c'est lui qui dit ce qui est encore en place. Un
 * oubli ici ferait passer un visuel affiché pour un visuel remplacé — et il
 * serait supprimé ; d'où les tests.
 */

type Ref = unknown;

/** L'id d'une relation, peuplée ou non, en texte (null si vide). */
export const idOf = (v: Ref): string | null => {
  if (v == null || v === "") return null;
  if (typeof v === "object") {
    const id = (v as { id?: unknown }).id;
    return id == null ? null : String(id);
  }
  return String(v);
};

export function featureMediaIds(feature: unknown): Set<string> {
  const out = new Set<string>();
  const add = (v: Ref) => {
    const id = idOf(v);
    if (id) out.add(id);
  };
  const f = (feature ?? {}) as { thumbnail?: Ref; doc?: unknown };
  add(f.thumbnail);
  for (const part of Array.isArray(f.doc) ? f.doc : []) {
    const blocks = (part as { mediaDoc?: unknown })?.mediaDoc;
    for (const b of Array.isArray(blocks) ? blocks : []) {
      const block = b as { image?: Ref; images?: Ref[]; file?: Ref };
      add(block.image);
      add(block.file);
      for (const img of Array.isArray(block.images) ? block.images : []) add(img);
    }
  }
  return out;
}

/** Ce que les versions passées utilisaient, et que la version publiée n'utilise plus. */
export function replacedMediaIds(current: unknown, past: unknown[]): string[] {
  const keep = featureMediaIds(current);
  const gone = new Set<string>();
  for (const v of past) for (const id of featureMediaIds(v)) if (!keep.has(id)) gone.add(id);
  return [...gone];
}
