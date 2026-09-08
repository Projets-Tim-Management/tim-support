"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { IconSpinner } from "@/components/ui/icons";

import ImportGrid, { evaluer, ligneDepuis, type Ligne } from "@/components/portal/ImportGrid";
import {
  choicesOf,
  decodeCsvBytes,
  importableFields,
  type ImportReport,
} from "@/modules/marketing/lib/portal-csv";
import type { PortalSection } from "@/modules/marketing/lib/portal-sections";

/**
 * Import d'un fichier CSV dans une section du dossier.
 *
 * EN TROIS TEMPS, et l'ordre est le sujet : on explique, on donne le modèle,
 * puis on lit le fichier — et le verdict s'affiche AVANT que quoi que ce soit
 * ne soit enregistré. Un import qui écrit d'abord laisse un dossier à moitié
 * rempli dont plus personne ne sait ce qu'il contient.
 *
 * Le modèle n'est pas un fichier joint au projet : il est engendré à la demande
 * à partir du même registre que le formulaire. Il ne peut donc pas s'en écarter.
 */

type Rapport = ImportReport & { written?: number };

const CLOSE_LABEL = "Fermer";

export default function ImportDialog({
  section,
  endpoint,
  query = "",
  onClose,
  onImported,
  existantes = 0,
}: {
  section: PortalSection;
  /** Lignes déjà enregistrées : c'est ce que « remplacer » effacerait. */
  existantes?: number;
  /** Base des routes — l'espace client et le back-office n'ont pas la même. */
  endpoint: string;
  query?: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [rapport, setRapport] = useState<Rapport | null>(null);
  /** Les lignes du fichier, telles qu'on peut encore les corriger. */
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [ecrites, setEcrites] = useState(0);
  /**
   * Les lignes que la base a refusées, avec leur motif.
   *
   * La collection contrôle des choses que le tableau ne sait pas voir — l'âge
   * minimum d'un salarié, le format d'un téléphone. Annoncer « 3 lignes
   * refusées » sans dire lesquelles ni pourquoi laisse le client relire son
   * fichier au hasard.
   */
  const [refus, setRefus] = useState<{ line: number; message: string }[]>([]);
  const [effacees, setEffacees] = useState(0);
  /**
   * Remplacer ou compléter.
   *
   * Le remplacement est proposé PAR DÉFAUT parce que c'est le geste attendu :
   * on redépose un fichier corrigé, pas une seconde liste. Mais il efface, donc
   * il est écrit en toutes lettres avec le nombre de lignes concernées — jamais
   * décidé en silence.
   */
  const [remplacer, setRemplacer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const url = (suffixe: string) => `${endpoint}/${section.key}/${suffixe}${query}`;

  const envoyer = useCallback(
    async (csv: string) => {
      setBusy(true);
      setErreur(null);
      try {
        const res = await fetch(url(`import`), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setErreur(
            data?.error === "too_many_rows"
              ? `Fichier trop volumineux : ${data.found} lignes, maximum ${data.max}.`
              : data?.error === "locked"
                ? "Votre dossier est transmis : il n'est plus modifiable."
                : "Le fichier n'a pas pu être lu.",
          );
          return;
        }
        const rap = data as Rapport;
        setRapport(rap);
        setLignes(rap.rows.map(ligneDepuis));
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, section.key, query, onImported],
  );

  const [nomFichier, setNomFichier] = useState<string>("");

  /**
   * Le fichier est lu DANS LE NAVIGATEUR, une seule fois, en OCTETS.
   *
   * Il l'était deux fois — deux `FileReader` concurrents sur le même fichier,
   * l'un pour l'analyse, l'autre pour garder le texte en vue de l'écriture. Sur
   * un gros fichier, rien ne garantissait lequel finirait le premier.
   *
   * Et il l'était en UTF-8 d'office, ce qui refusait les fichiers réenregistrés
   * par Excel : les en-têtes accentués devenaient méconnaissables et « Société »
   * passait pour absente. `decodeCsvBytes` reconnaît l'encodage au lieu de le
   * supposer.
   *
   * L'attente commence ici et non dans `envoyer` : entre le lâcher du fichier
   * et le départ de la requête il y a la lecture du disque, et c'est déjà du
   * temps pendant lequel l'écran ne doit pas paraître inerte.
   */
  const prendre = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setErreur(null);
    setRapport(null);
    setNomFichier(file.name);

    let texte: string;
    try {
      texte = decodeCsvBytes(await file.arrayBuffer());
    } catch {
      setBusy(false);
      setErreur("Fichier illisible.");
      return;
    }
    // Le texte n'est pas conservé : ce qu'on enverra ensuite, ce sont les
    // lignes corrigées à l'écran, pas le fichier d'origine.
    await envoyer(texte);
  };

  const champs = importableFields(section);
  const obligatoires = champs.filter((f) => f.required).map((f) => f.label);
  const listes = choicesOf(section);

  /**
   * Combien de lignes restent fautives, recalculé à CHAQUE frappe.
   *
   * C'est ce compteur qui tient le bouton fermé : tant qu'il n'est pas à zéro,
   * on n'écrit rien. Le recalcul complet est sans conséquence — on parle de
   * quelques centaines de lignes au plus, et le plafond du serveur le garantit.
   */
  const aCorriger = (lignes ?? []).filter(
    (l) => Object.keys(evaluer(section, champs, l.raw).errors).length > 0,
  ).length;

  /**
   * L'import n'est fini que si RIEN n'a été refusé.
   *
   * Sans cette nuance, un enregistrement partiel fermait le tableau et retirait
   * le bouton : le client voyait ce qui avait échoué sans pouvoir le corriger.
   */
  const termine = ecrites > 0 && refus.length === 0;

  /** Envoie les lignes CORRIGÉES, pas le fichier d'origine. */
  const ecrire = useCallback(async () => {
    if (!lignes) return;
    setBusy(true);
    setErreur(null);
    setRefus([]);
    try {
      const rows = lignes.map((l) => evaluer(section, champs, l.raw).data);
      const res = await fetch(url("import"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, confirmer: true, remplacer: existantes > 0 && remplacer }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErreur("L'enregistrement a échoué.");
        return;
      }
      setEcrites(data?.written ?? 0);
      setEffacees(data?.deleted ?? 0);
      // Des refus de dernière minute (règle de collection, contrainte d'unicité)
      // ne doivent pas passer pour un succès complet.
      if (Array.isArray(data?.refused) && data.refused.length > 0) {
        // Le prochain envoi doit REMPLACER : les lignes acceptées viennent
        // d'être écrites, les renvoyer en complément les dédoublerait. C'est
        // aussi ce que promet le message affiché juste en dessous.
        setRemplacer(true);
        setRefus(
          (data.refused as { index: number; errors?: Record<string, string> }[]).map((r) => ({
            line: lignes[r.index]?.line ?? r.index + 2,
            message: Object.values(r.errors ?? {}).join(" ") || "Ligne refusée.",
          })),
        );
      }
      onImported();
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, section, champs, onImported, remplacer, existantes]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Importer des ${section.label.toLowerCase()}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Étroite pour lire trois consignes, large pour corriger un tableau de
          quatorze colonnes : ce ne sont pas les mêmes besoins, et une largeur
          moyenne dessert les deux. */}
      <div
        className={`w-full rounded-xl bg-white p-6 shadow-xl transition-[max-width] duration-200 ${
          lignes && lignes.length > 0 ? "max-w-6xl" : "max-w-2xl"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              Importer des {section.label.toLowerCase()}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {lignes?.length
                ? "Vérifiez les lignes, corrigez ce qui est en rouge, puis importez."
                : existantes > 0
                  ? "Déposez votre fichier : vous choisirez ensuite de remplacer votre liste ou de la compléter."
                  : "Remplissez le modèle, déposez-le, puis vérifiez les lignes avant de les enregistrer."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-muted transition hover:text-foreground"
            aria-label={CLOSE_LABEL}
          >
            ×
          </button>
        </div>

        {/* ── Les trois temps, tant qu'il n'y a rien à corriger ──
            Une fois le fichier lu, ces consignes ont fait leur office : les
            garder repousserait le tableau hors de l'écran, au moment précis où
            c'est lui qu'il faut voir. */}
        {!lignes?.length && (
        <ol className="mt-6 space-y-4">
          <li className="flex gap-3">
            <Puce n={1} />
            <div>
              <p className="font-semibold text-foreground">Téléchargez le modèle</p>
              <p className="mt-0.5 text-sm text-muted">
                Il contient les bonnes colonnes et une ligne d&apos;exemple —{" "}
                <strong>remplacez-la</strong> par vos données.
              </p>
              <a
                href={url("modele")}
                className="mt-2 inline-block rounded-md bg-surface px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-border"
                download
              >
                Modèle {section.label.toLowerCase()}.csv
              </a>
            </div>
          </li>

          <li className="flex gap-3">
            <Puce n={2} />
            <div>
              <p className="font-semibold text-foreground">Complétez dans votre tableur</p>
              <p className="mt-0.5 text-sm text-muted">
                Ne renommez pas les colonnes. Une ligne par{" "}
                {section.singular}. Colonnes obligatoires :{" "}
                <strong>{obligatoires.join(", ")}</strong>. Les dates s&apos;écrivent{" "}
                <strong>jj/mm/aaaa</strong>.
              </p>
              {listes.length > 0 && (
                <p className="mt-1 text-sm text-muted">
                  Valeurs attendues —{" "}
                  {listes
                    .map((l) => `${l.label} : ${l.values.slice(0, 3).join(", ")}${l.values.length > 3 ? "…" : ""}`)
                    .join(" · ")}
                </p>
              )}
            </div>
          </li>

          <li className="flex gap-3">
            <Puce n={3} />
            <div className="w-full">
              <p className="font-semibold text-foreground">Déposez le fichier</p>
              <div
                className={`mt-2 rounded-lg border-2 border-dashed p-6 text-center transition ${
                  survol ? "border-primary bg-primary-light" : "border-border bg-surface"
                } ${busy ? "opacity-60" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setSurvol(true);
                }}
                onDragLeave={() => setSurvol(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setSurvol(false);
                  // Un second fichier lâché pendant l'analyse produirait deux
                  // rapports concurrents, et c'est le plus lent qui gagnerait.
                  if (!busy) void prendre(e.dataTransfer.files?.[0]);
                }}
              >
                {busy ? (
                  <p className="flex items-center justify-center gap-2 text-sm text-muted">
                    <IconSpinner className="h-4 w-4 animate-spin" />
                    Lecture de {nomFichier || "votre fichier"}…
                  </p>
                ) : (
                <p className="text-sm text-muted">
                  Glissez votre fichier ici, ou{" "}
                  <button
                    type="button"
                    disabled={busy}
                    className="font-semibold text-primary underline disabled:opacity-50"
                    onClick={() => inputRef.current?.click()}
                  >
                    parcourez vos fichiers
                  </button>
                  .
                </p>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => void prendre(e.target.files?.[0])}
                />
              </div>
            </div>
          </li>
        </ol>
        )}

        {erreur && (
          <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground" role="alert">
            {erreur}
          </p>
        )}

        {/* Colonne obligatoire absente : rien n'est corrigeable à l'écran, il
            faut reprendre le fichier. Le dire tout de suite évite de faire lire
            cinquante lignes fautives pour la même raison. */}
        {rapport && rapport.missingRequired.length > 0 && (
          <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground" role="alert">
            Colonne{rapport.missingRequired.length > 1 ? "s" : ""} absente
            {rapport.missingRequired.length > 1 ? "s" : ""} du fichier :{" "}
            <strong>{rapport.missingRequired.join(", ")}</strong>. Repartez du modèle.
          </p>
        )}

        {rapport && rapport.unknownColumns.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            Colonnes ignorées : {rapport.unknownColumns.join(", ")}.
          </p>
        )}

        {refus.length > 0 && (
          <div className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground" role="alert">
            <p className="font-semibold">
              {refus.length} ligne{refus.length > 1 ? "s" : ""} refusée
              {refus.length > 1 ? "s" : ""} à l&apos;enregistrement :
            </p>
            <ul className="mt-1 list-disc pl-5">
              {refus.slice(0, 10).map((r) => (
                <li key={r.line}>
                  Ligne {r.line} — {r.message}
                </li>
              ))}
            </ul>
            {refus.length > 10 && <p className="mt-1">…et {refus.length - 10} autre(s).</p>}
            <p className="mt-2">
              Corrigez-les ci-dessous et relancez l&apos;import : il remplacera ce qui vient
              d&apos;être enregistré, sans le dédoubler.
            </p>
          </div>
        )}

        {termine ? (
          <p className="mt-5 rounded-md bg-success-bg px-4 py-3 text-sm text-foreground">
            <strong>
              {ecrites} ligne{ecrites > 1 ? "s" : ""} importée{ecrites > 1 ? "s" : ""}.
            </strong>{" "}
            {effacees > 0
              ? `${effacees} ligne${effacees > 1 ? "s" : ""} précédente${effacees > 1 ? "s ont" : " a"} été remplacée${effacees > 1 ? "s" : ""}.`
              : "Elles apparaissent dans le tableau."}
          </p>
        ) : (
          lignes &&
          lignes.length > 0 &&
          rapport?.missingRequired.length === 0 && (
            <>
              <div className="mt-6 flex items-baseline justify-between gap-4">
                <p className="font-semibold text-foreground">
                  Vérifiez avant d&apos;importer
                </p>
                <p className="text-sm text-muted">
                  {lignes.length} ligne{lignes.length > 1 ? "s" : ""}
                  {aCorriger > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-primary">
                        {aCorriger} en attente de correction
                      </span>
                    </>
                  )}
                </p>
              </div>
              <p className="mt-1 text-sm text-muted">
                Les cases en rouge empêchent l&apos;import. Corrigez-les ici — passez la souris
                dessus pour savoir ce qui est attendu — ou retirez la ligne avec la croix.
              </p>

              <ImportGrid
                section={section}
                champs={champs}
                lignes={lignes}
                onChange={(i, name, value) =>
                  setLignes((ls) =>
                    ls!.map((l, k) => (k === i ? { ...l, raw: { ...l.raw, [name]: value } } : l)),
                  )
                }
                onRemove={(i) => setLignes((ls) => ls!.filter((_, k) => k !== i))}
              />
            </>
          )
        )}

        {lignes && lignes.length > 0 && !termine && existantes > 0 && (
          <fieldset className="mt-5 rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-foreground">
              Ce tableau contient déjà {existantes} ligne{existantes > 1 ? "s" : ""}
            </legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-1"
                checked={remplacer}
                onChange={() => setRemplacer(true)}
              />
              <span>
                <strong>Remplacer</strong> — les {existantes} ligne
                {existantes > 1 ? "s" : ""} existante{existantes > 1 ? "s" : ""}{" "}
                {existantes > 1 ? "sont supprimées" : "est supprimée"} et remplacée
                {existantes > 1 ? "s" : ""} par le fichier.
              </span>
            </label>
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-1"
                checked={!remplacer}
                onChange={() => setRemplacer(false)}
              />
              <span>
                <strong>Compléter</strong> — le fichier s&apos;ajoute à la suite de ce qui existe.
              </span>
            </label>
          </fieldset>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-semibold text-muted transition hover:text-foreground"
          >
            {termine ? CLOSE_LABEL : "Annuler"}
          </button>
          {lignes && lignes.length > 0 && !termine && (
            <button
              type="button"
              /* Fermé tant qu'une case est rouge : on ne veut ni écrire à
                 moitié, ni laisser croire que tout est passé. */
              disabled={busy || aCorriger > 0}
              title={aCorriger > 0 ? "Corrigez les cases en rouge pour continuer." : undefined}
              onClick={() => void ecrire()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <IconSpinner className="h-4 w-4 animate-spin" />}
              {busy
                ? "Enregistrement…"
                : `${existantes > 0 && remplacer ? "Remplacer par" : "Importer"} ${lignes.length} ligne${lignes.length > 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const Puce = ({ n }: { n: number }) => (
  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
    {n}
  </span>
);
