import { headers } from "next/headers";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { profileRank } from "@/modules/partner/lib/pricing";
import { profileLabel } from "@/modules/training/lib/plan";
import { loadTrainingPrint } from "@/modules/training/lib/print-data";

import PrintButton from "../PrintButton";

/**
 * Étiquettes d'identifiants : une par personne formée — nom, profil,
 * identifiant, mot de passe — sur une planche A4 standard de 24 étiquettes
 * (3 × 8, 70 × 37 mm). À coller sur le mémo, un carnet, le casque…
 *
 * « Commencer à l'étiquette n° » réutilise une planche déjà entamée.
 *
 * TIM seulement : les mots de passe s'impriment en clair (même règle que la
 * feuille d'accès). Pas d'impression automatique : on règle d'abord.
 */
export const dynamic = "force-dynamic";

const PER_SHEET = 24;

export default async function Page({ searchParams }: { searchParams: Promise<{ training?: string; start?: string; day?: string }> }) {
  const { training, start, day } = await searchParams;
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: await headers() });
  if (!hasAdminRole(user)) return <p className="p-10 text-muted">Accès réservé à l&apos;équipe TIM (mots de passe).</p>;
  if (!training) return <p className="p-10 text-muted">Aucune formation indiquée.</p>;
  const data = await loadTrainingPrint(payload, training, { withPasswords: true, dayId: day ?? null });
  if (!data) return <p className="p-10 text-muted">Formation introuvable.</p>;

  const people = [...data.people].sort(
    (a, b) =>
      profileRank(a.profile) - profileRank(b.profile) ||
      [a.lastName, a.firstName].join(" ").localeCompare([b.lastName, b.firstName].join(" ")),
  );
  const ready = people.filter((p) => p.password && p.email);
  const missing = people.filter((p) => !p.password || !p.email);
  const offset = Math.min(PER_SHEET - 1, Math.max(0, (Number(start) || 1) - 1));
  const cells = [...Array<null>(offset).fill(null), ...ready];

  return (
    <div>
      {/* Le format de la planche : marges nulles, cases de 70 × 37 mm. */}
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          .lbl-sheet { width: 210mm; padding: 0.5mm 0 0; }
          .lbl-cell { width: 70mm; height: 37mm; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl px-8 py-8 print:hidden">
        <h1 className="text-xl font-bold text-foreground">Étiquettes d&apos;identifiants{data.companyName ? ` — ${data.companyName}` : ""}</h1>
        <p className="mt-1 text-sm text-muted">
          {ready.length} étiquette{ready.length > 1 ? "s" : ""} · planche A4 de 24 (3 × 8, 70 × 37 mm). Dans la fenêtre
          d&apos;impression : échelle 100 %, sans marges.
        </p>
        {missing.length > 0 && (
          <p className="mt-3 rounded-md bg-primary-light px-3 py-2 text-sm text-primary-dark">
            Sans étiquette (mot de passe ou adresse manquants) :{" "}
            {missing.map((p) => [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email).join(", ")}.
          </p>
        )}
        <form className="mt-4 flex items-end gap-3" method="get">
          <input type="hidden" name="training" value={training} />
          {day && <input type="hidden" name="day" value={day} />}
          <label className="flex flex-col gap-1 text-sm text-foreground">
            Commencer à l&apos;étiquette n°
            <input
              type="number"
              name="start"
              min={1}
              max={PER_SHEET}
              defaultValue={offset + 1}
              className="w-24 rounded-md border border-border px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded-md border border-border px-3 py-2 text-sm">
            Appliquer
          </button>
          <PrintButton />
        </form>
      </div>

      <div className="lbl-sheet mx-auto grid w-[210mm] grid-cols-3 bg-white print:mx-0">
        {cells.map((p, i) =>
          p ? (
            <div key={p.id} className="lbl-cell flex h-[37mm] w-[70mm] flex-col justify-center gap-0.5 overflow-hidden border border-dashed border-border px-[5mm] print:border-0">
              <span className="truncate text-[11pt] font-bold text-foreground">
                {[p.firstName, p.lastName].filter(Boolean).join(" ") || p.email}
              </span>
              <span className="text-[7.5pt] text-muted uppercase">{profileLabel(p.profile)} · application TIM</span>
              <span className="mt-1 text-[8pt] text-muted">Identifiant</span>
              <span className="truncate font-mono text-[9pt] text-foreground">{p.email}</span>
              <span className="text-[8pt] text-muted">Mot de passe</span>
              <span className="font-mono text-[11pt] font-bold tracking-wide text-foreground">{p.password}</span>
            </div>
          ) : (
            <div key={`vide-${i}`} className="lbl-cell h-[37mm] w-[70mm] border border-dashed border-border print:border-0" />
          ),
        )}
      </div>
    </div>
  );
}
