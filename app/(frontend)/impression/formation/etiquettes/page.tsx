import { headers } from "next/headers";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { profileRank } from "@/modules/partner/lib/pricing";
import { loadTrainingPrint, type PrintPerson } from "@/modules/training/lib/print-data";

import PrintButton from "../PrintButton";

/**
 * Étiquettes d'identifiants de 6,4 × 2,4 cm (largeur × hauteur) : le nom, puis
 * « Id : » et « Mdp : » en grand — une par personne. Une feuille A4 en porte 33
 * (3 colonnes × 11 rangées), centrées.
 *
 * AUCUN trait sur les étiquettes : des traits de coupe seulement dans les
 * marges, alignés sur chaque ligne de découpe, pour caler la découpeuse. La
 * largeur laisse une adresse e-mail courante sur une seule ligne, et 9 mm de
 * marge latérale pour que les traits des côtés s'impriment.
 *
 * `scope=tous` : tous les contacts du client, et non les seules personnes
 * formées. `start` : commencer plus loin sur une feuille déjà entamée.
 *
 * TIM seulement : les mots de passe s'impriment en clair. Pas d'impression
 * automatique : on règle d'abord.
 */
export const dynamic = "force-dynamic";

const COLS = 3;
const ROWS = 11;
// Géométrie de la feuille, en millimètres.
const CELL_W = 64;
const CELL_H = 24;
const MARGIN_X = (210 - COLS * CELL_W) / 2; // 9
const MARGIN_Y = (297 - ROWS * CELL_H) / 2; // 16,5
/** Écart entre un trait de coupe et la première étiquette. */
const MARK_GAP = 2;
const PER_SHEET = COLS * ROWS;
const fullName = (p: PrintPerson) => [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || "—";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ training?: string; start?: string; day?: string; scope?: string }>;
}) {
  const { training, start, day, scope } = await searchParams;
  const all = scope === "tous";
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: await headers() });
  if (!hasAdminRole(user)) return <p className="p-10 text-muted">Accès réservé à l&apos;équipe TIM (mots de passe).</p>;
  if (!training) return <p className="p-10 text-muted">Aucune formation indiquée.</p>;
  const data = await loadTrainingPrint(payload, training, { withPasswords: true, dayId: day ?? null, allContacts: all });
  if (!data) return <p className="p-10 text-muted">Formation introuvable.</p>;

  const people = [...data.people].sort((a, b) => profileRank(a.profile) - profileRank(b.profile) || fullName(a).localeCompare(fullName(b)));
  const ready = people.filter((p) => p.password && p.email);
  const missing = people.filter((p) => !p.password || !p.email);
  const offset = Math.min(PER_SHEET - 1, Math.max(0, (Number(start) || 1) - 1));
  const cells: (PrintPerson | null)[] = [...Array<null>(offset).fill(null), ...ready];
  const sheets: (PrintPerson | null)[][] = [];
  for (let i = 0; i < cells.length; i += PER_SHEET) sheets.push(cells.slice(i, i + PER_SHEET));

  return (
    <div>
      {/* Une feuille = 210 × 297 mm, marges nulles ; 3 × 64 mm de large, 11 × 24 mm
          de haut, centrées. Les traits de coupe vivent dans les marges. */}
      <style>{`
        @page { size: A4; margin: 0; }
        .lbl-sheet { position: relative; width: 210mm; height: 297mm; padding: ${MARGIN_Y}mm ${MARGIN_X}mm; box-sizing: border-box; }
        .lbl-cell { width: ${CELL_W}mm; height: ${CELL_H}mm; box-sizing: border-box; }
        /* Des BORDURES et non un fond : Chrome n'imprime pas les couleurs de
           fond par défaut (« Graphiques d'arrière-plan » décoché) — un trait
           dessiné en fond disparaissait à l'impression. */
        .lbl-mark { position: absolute; border: 0 solid currentColor; }
        .lbl-mark--v { border-left-width: 0.25mm; }
        .lbl-mark--h { border-top-width: 0.25mm; }
        @media print { .lbl-sheet { break-after: page; } .lbl-sheet:last-child { break-after: auto; } }
      `}</style>

      <div className="mx-auto max-w-3xl px-8 py-8 print:hidden">
        <h1 className="text-xl font-bold text-foreground">
          Étiquettes d&apos;identifiants{data.companyName ? ` — ${data.companyName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {ready.length} étiquette{ready.length > 1 ? "s" : ""} de 6,4 × 2,4 cm · 33 par feuille A4. Les traits de coupe sont
          dans les marges : calez la découpeuse dessus, rien n&apos;est tracé sur les étiquettes.
          Dans la fenêtre d&apos;impression : échelle 100 %, sans marges.
        </p>
        <div className="mt-3 flex gap-2 text-sm">
          <a
            href={`?training=${training}${day ? `&day=${day}` : ""}`}
            className={`rounded-md border px-3 py-1.5 ${all ? "border-border text-foreground" : "border-primary bg-primary-light font-semibold text-primary-dark"}`}
          >
            Personnes formées
          </a>
          <a
            href={`?training=${training}${day ? `&day=${day}` : ""}&scope=tous`}
            className={`rounded-md border px-3 py-1.5 ${all ? "border-primary bg-primary-light font-semibold text-primary-dark" : "border-border text-foreground"}`}
          >
            Tous les utilisateurs du client
          </a>
        </div>
        {missing.length > 0 && (
          <p className="mt-3 rounded-md bg-primary-light px-3 py-2 text-sm text-primary-dark">
            Sans étiquette (mot de passe ou adresse manquants) : {missing.map(fullName).join(", ")}.
          </p>
        )}
        <form className="mt-4 flex items-end gap-3" method="get">
          <input type="hidden" name="training" value={training} />
          {day && <input type="hidden" name="day" value={day} />}
          {all && <input type="hidden" name="scope" value="tous" />}
          <label className="flex flex-col gap-1 text-sm text-foreground">
            Commencer à l&apos;étiquette n°
            <input type="number" name="start" min={1} max={PER_SHEET} defaultValue={offset + 1} className="w-24 rounded-md border border-border px-2 py-1" />
          </label>
          <button type="submit" className="rounded-md border border-border px-3 py-2 text-sm">
            Appliquer
          </button>
          <PrintButton />
        </form>
      </div>

      {sheets.map((sheet, s) => (
        <div key={s} className="lbl-sheet mx-auto mb-6 bg-white text-foreground shadow print:mx-0 print:mb-0 print:shadow-none">
          <CropMarks />
          <div className="grid grid-cols-3">
            {sheet.map((p, i) =>
              p ? (
                <div key={p.id} className="lbl-cell flex flex-col justify-center gap-[1mm] overflow-hidden px-[3mm]">
                  <span className="truncate text-[10pt] leading-tight font-bold text-foreground">{fullName(p)}</span>
                  {/* Coupée seulement si elle ne tient vraiment pas sur la ligne. */}
                  <span className="text-[8.5pt] leading-tight [overflow-wrap:anywhere] text-foreground">
                    <span className="font-semibold">Id :</span> {p.email}
                  </span>
                  <span className="text-[8.5pt] leading-tight text-foreground">
                    <span className="font-semibold">Mdp :</span>{" "}
                    <span className="font-mono text-[12pt] font-bold tracking-wide">{p.password}</span>
                  </span>
                </div>
              ) : (
                <div key={`vide-${s}-${i}`} className="lbl-cell" />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Traits de coupe, dans les marges seulement : en haut et en bas à chaque
 * ligne verticale de découpe, à gauche et à droite à chaque ligne horizontale.
 * Ils s'arrêtent à 2 mm des étiquettes : rien ne déborde sur elles.
 */
function CropMarks() {
  const xs = Array.from({ length: COLS + 1 }, (_, i) => MARGIN_X + i * CELL_W);
  const ys = Array.from({ length: ROWS + 1 }, (_, i) => MARGIN_Y + i * CELL_H);
  const t = 0.25; // épaisseur, mm
  const vLen = MARGIN_Y - MARK_GAP - 4; // du bord + 4 mm jusqu'à 2 mm de la grille
  const hLen = MARGIN_X - MARK_GAP - 2;
  return (
    <>
      {xs.map((x) => (
        <span key={`t${x}`}>
          <span className="lbl-mark lbl-mark--v" style={{ left: `${x - t / 2}mm`, top: "4mm", height: `${vLen}mm` }} />
          <span className="lbl-mark lbl-mark--v" style={{ left: `${x - t / 2}mm`, bottom: "4mm", height: `${vLen}mm` }} />
        </span>
      ))}
      {ys.map((y) => (
        <span key={`l${y}`}>
          <span className="lbl-mark lbl-mark--h" style={{ top: `${y - t / 2}mm`, left: "2mm", width: `${hLen}mm` }} />
          <span className="lbl-mark lbl-mark--h" style={{ top: `${y - t / 2}mm`, right: "2mm", width: `${hLen}mm` }} />
        </span>
      ))}
    </>
  );
}
