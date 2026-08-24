"use client";

import { useDocumentInfo, useForm, useFormFields } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

import { PROFILS, type ProfilKey } from "@/modules/partner/lib/pricing";

/**
 * Récap du dossier de démarrage, en tête de l'onglet de la fiche client.
 *
 * Deux rôles :
 *  1. dire d'un coup d'œil ce qui est rempli et ce qui manque (les 5 sections) ;
 *  2. faire le pont SALARIÉS → LICENCES, qui est la vraie raison d'avoir sorti
 *     ce dossier d'un fichier Excel.
 *
 * ⚠️ Le compteur ne compte QUE les salariés dont « Accès TIM » est coché : 40
 * salariés peuvent ne donner que 12 licences. Le report dans le tableau des
 * licences est un BOUTON, jamais automatique — le partenaire a pu négocier un
 * périmètre différent de l'effectif déclaré, et son chiffrage prime.
 */

type Counts = {
  contacts: number;
  employees: number;
  sites: number;
  vehicles: number;
  machines: number;
  /** Salariés « Accès TIM » par profil de licence. */
  byProfile: Record<string, number>;
  users: number;
};

const EMPTY: Counts = {
  contacts: 0,
  employees: 0,
  sites: 0,
  vehicles: 0,
  machines: 0,
  byProfile: {},
  users: 0,
};

async function countDocs(collection: string, clientId: string | number): Promise<number> {
  try {
    const res = await fetch(
      `/payload-api/${collection}?where[client][equals]=${clientId}&limit=1&depth=0`,
      { credentials: "include" },
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data?.totalDocs ?? 0);
  } catch {
    return 0;
  }
}

export function OnboardingRecap() {
  const { id } = useDocumentInfo();
  const { dispatchFields } = useForm();
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [reported, setReported] = useState(false);

  // Quantités actuellement saisies dans le tableau des licences (onglet voisin),
  // pour ne proposer le report que s'il change réellement quelque chose.
  const currentQty = useFormFields(([fields]) => {
    const out: Record<string, number> = {};
    for (const p of PROFILS) out[p.key] = Number(fields[`licences.${p.key}Qty`]?.value ?? 0);
    return out;
  });

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        // Les UTILISATEURS déclarés sont chargés en entier (et non comptés) : il
        // faut le détail par profil de licence, qu'aucun compteur serveur ne
        // donne. C'est cette liste qui alimente les comptes à créer et le devis.
        const empRes = await fetch(
          `/payload-api/client-contacts?where[client][equals]=${id}&limit=1000&depth=0`,
          { credentials: "include" },
        );
        const empData = empRes.ok ? await empRes.json() : { docs: [] };
        const docs = (empData?.docs ?? []) as { licenceProfile?: string }[];

        const byProfile: Record<string, number> = {};
        let users = 0;
        for (const e of docs) {
          users += 1;
          const key = e.licenceProfile ?? "—";
          byProfile[key] = (byProfile[key] ?? 0) + 1;
        }

        const [contacts, sites, vehicles, machines] = await Promise.all([
          countDocs("client-contacts", id),
          countDocs("client-sites", id),
          countDocs("client-vehicles", id),
          countDocs("client-machines", id),
        ]);

        if (!cancelled) {
          setCounts({
            contacts,
            employees: Number(empData?.totalDocs ?? docs.length),
            sites,
            vehicles,
            machines,
            byProfile,
            users,
          });
        }
      } catch {
        if (!cancelled) setCounts(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  /** Reporte le comptage par profil dans le tableau des licences (onglet voisin). */
  const report = useCallback(() => {
    for (const p of PROFILS) {
      dispatchFields({
        type: "UPDATE",
        path: `licences.${p.key}Qty`,
        value: counts.byProfile[p.key] ?? 0,
      });
    }
    setReported(true);
  }, [counts.byProfile, dispatchFields]);

  if (!id) {
    return (
      <div className="jr-onb jr-onb--empty">
        Enregistrez d&apos;abord la fiche client : le dossier de démarrage se rattache à un client
        existant.
      </div>
    );
  }

  if (loading) return <div className="jr-onb jr-onb--empty">Chargement du dossier…</div>;

  const sections = [
    { label: "Administrateur", n: counts.contacts, min: 1 },
    { label: "Salariés", n: counts.employees, min: 1 },
    { label: "Chantiers", n: counts.sites, min: 1 },
    { label: "Véhicules", n: counts.vehicles, min: 0 },
    { label: "Engins", n: counts.machines, min: 0 },
  ];
  // Une section facultative (min = 0) compte comme faite : le dossier ne doit
  // pas paraître incomplet parce qu'un client n'a ni véhicule ni engin.
  const complete = sections.filter((s) => s.min === 0 || s.n >= s.min).length;

  // Le report n'a d'intérêt que s'il change au moins une quantité.
  const differs = PROFILS.some((p) => (counts.byProfile[p.key] ?? 0) !== (currentQty[p.key] ?? 0));

  return (
    <div className="jr-onb">
      <div className="jr-onb__sections">
        <p className="jr-onb__progress">
          {complete}/{sections.length} sections complètes
        </p>
        {sections.map((s) => {
          const ok = s.min === 0 ? true : s.n >= s.min;
          return (
            <div key={s.label} className={`jr-onb__section${ok ? " jr-onb__section--ok" : ""}`}>
              <span className="jr-onb__mark">{ok ? "✔" : "○"}</span>
              <span className="jr-onb__label">{s.label}</span>
              <span className="jr-onb__n">
                {s.n}
                {s.min > 0 && s.n === 0 && <em> requis</em>}
              </span>
            </div>
          );
        })}
      </div>

      <div className="jr-onb__licences">
        <p className="jr-onb__headline">
          <strong>{counts.employees}</strong> salarié{counts.employees > 1 ? "s" : ""}
          <span className="jr-onb__sep">·</span>
          <strong>{counts.users}</strong> utilisateur{counts.users > 1 ? "s" : ""}
          <span className="jr-onb__hint">
            un salarié n&apos;est pas un utilisateur : seuls les « Accès TIM » consomment une licence
          </span>
        </p>

        <ul className="jr-onb__profiles">
          {PROFILS.map((p) => {
            const n = counts.byProfile[p.key as ProfilKey] ?? 0;
            const saisi = currentQty[p.key] ?? 0;
            return (
              <li key={p.key} className={n !== saisi ? "jr-onb__profile jr-onb__profile--diff" : "jr-onb__profile"}>
                <span className="jr-onb__profile-k">{p.label}</span>
                <span className="jr-onb__profile-v">{n}</span>
                {n !== saisi && <span className="jr-onb__profile-old">devis&nbsp;: {saisi}</span>}
              </li>
            );
          })}
          {counts.byProfile["—"] > 0 && (
            <li className="jr-onb__profile jr-onb__profile--warn">
              <span className="jr-onb__profile-k">Sans profil</span>
              <span className="jr-onb__profile-v">{counts.byProfile["—"]}</span>
            </li>
          )}
        </ul>

        {differs && (
          <button type="button" className="jr-btn" onClick={report}>
            Reporter dans les licences
          </button>
        )}
        {reported && <span className="jr-onb__done">Reporté — pensez à enregistrer.</span>}
        {!differs && !reported && (
          <span className="jr-onb__done">Licences alignées sur le dossier.</span>
        )}
      </div>
    </div>
  );
}
