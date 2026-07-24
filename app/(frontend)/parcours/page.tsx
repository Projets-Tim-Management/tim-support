import type { Metadata } from "next";
import Link from "next/link";
import { getParcours } from "@/lib/wordpress";
import type { ParcoursProfil } from "@/lib/types";
import Breadcrumb from "@/components/ui/Breadcrumb";
import ParcoursCard from "@/components/parcours/ParcoursCard";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Parcours d'apprentissage",
  description:
    "Suivez les parcours d'apprentissage par profil utilisateur pour maîtriser TIM Management étape par étape.",
};

interface ProfilDef {
  key:           ParcoursProfil;
  label:         string;
  icon:          string;
  tagline:       string;
  /** Classes Tailwind COMPLÈTES (statiques pour que Tailwind les détecte). */
  hoverBorder:   string;   // bordure au hover sur la carte étape 1
  accentBg:      string;   // fond du cercle icône
}

const PROFILS: ProfilDef[] = [
  { key: "admin",         label: "Administrateur",        icon: "👔", tagline: "Gestion globale du compte et des accès",     hoverBorder: "hover:border-primary",    accentBg: "bg-primary-light"    },
  { key: "conducteur",    label: "Conducteur de travaux", icon: "📋", tagline: "Suivi des chantiers et de l'activité",       hoverBorder: "hover:border-absence",    accentBg: "bg-absence-bg"       },
  { key: "chef-chantier", label: "Chef de chantier",      icon: "🦺", tagline: "Pilotage opérationnel sur le terrain",       hoverBorder: "hover:border-processing", accentBg: "bg-processing-bg"    },
  { key: "compagnon",     label: "Compagnon",             icon: "🛠️", tagline: "Pointage et consultation au quotidien",     hoverBorder: "hover:border-success",    accentBg: "bg-success-bg"       },
];

export default async function ParcoursIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ profil?: string }>;
}) {
  const sp            = await searchParams;
  const selectedKey   = (sp.profil ?? "") as ParcoursProfil | "";
  const allParcours   = await getParcours();

  // Compte par profil pour afficher "3 parcours" sur chaque carte de l'étape 1.
  const countByProfil = new Map<ParcoursProfil, number>();
  for (const p of allParcours) {
    const k = (p.profil || "") as ParcoursProfil;
    if (k) countByProfil.set(k, (countByProfil.get(k) ?? 0) + 1);
  }

  // ─── ÉTAPE 1 — Choix du profil ────────────────────────────────────────────
  if (!selectedKey) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <Breadcrumb items={[{ label: "Parcours" }]} />

        <header className="mt-8 mb-12 text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center px-2.5 py-1 rounded-[5px] bg-primary-light text-primary text-[11px] font-bold tracking-wider uppercase mb-4">
            Étape 1 sur 2
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            Quel est votre profil&nbsp;?
          </h1>
          <p className="mt-3 text-muted">
            Sélectionnez votre rôle pour découvrir les parcours d&apos;apprentissage
            adaptés à vos besoins.
          </p>
        </header>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PROFILS.map((p) => {
            const count = countByProfil.get(p.key) ?? 0;
            const isAvailable = count > 0;
            return (
              <Link
                key={p.key}
                href={isAvailable ? `/parcours?profil=${p.key}` : "#"}
                aria-disabled={!isAvailable}
                className={`group relative flex flex-col items-center text-center gap-3 p-6 rounded-2xl border-2 border-border bg-white transition-all ${
                  isAvailable
                    ? `${p.hoverBorder} hover:shadow-lg hover:-translate-y-1 cursor-pointer`
                    : "opacity-50 cursor-not-allowed"
                }`}
              >
                {/* Cercle coloré avec icône — accent par profil */}
                <div className={`w-20 h-20 rounded-full ${p.accentBg} flex items-center justify-center text-4xl mb-1 group-hover:scale-105 transition-transform`}>
                  <span aria-hidden>{p.icon}</span>
                </div>

                <h3 className="font-bold text-foreground text-lg leading-tight">
                  {p.label}
                </h3>
                <p className="text-sm text-muted leading-relaxed flex-1">
                  {p.tagline}
                </p>

                <div className="mt-2 pt-3 border-t border-border w-full flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted">
                    {count} parcours{count > 1 ? "" : ""}
                  </span>
                  {isAvailable ? (
                    <span className="text-primary font-semibold text-sm group-hover:translate-x-1 transition-transform">
                      Choisir →
                    </span>
                  ) : (
                    <span className="text-xs text-muted italic">
                      À venir
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── ÉTAPE 2 — Liste des parcours pour le profil sélectionné ──────────────
  const selectedProfil = PROFILS.find((p) => p.key === selectedKey);
  const filtered       = allParcours.filter((p) => p.profil === selectedKey);

  if (!selectedProfil) {
    // Profil invalide → fallback étape 1
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <p className="text-muted mb-4">Profil inconnu.</p>
        <Link href="/parcours" className="text-primary hover:underline">
          ← Retour à la sélection
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Ligne du haut : "Changer de profil" à gauche, breadcrumb à droite */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link
          href="/parcours"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Changer de profil
        </Link>
        <Breadcrumb
          items={[
            { label: "Parcours", href: "/parcours" },
            { label: selectedProfil.label },
          ]}
        />
      </div>

      {/* Header du profil sélectionné */}
      <header className="mt-8 mb-10 flex items-start gap-5">
        <div className={`w-16 h-16 rounded-2xl ${selectedProfil.accentBg} flex items-center justify-center text-3xl shrink-0`}>
          <span aria-hidden>{selectedProfil.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-[5px] bg-surface text-muted text-[10px] font-bold tracking-wider uppercase mb-2">
            Étape 2 sur 2
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Parcours pour {selectedProfil.label}
          </h1>
          <p className="mt-1 text-muted">{selectedProfil.tagline}</p>
        </div>
      </header>

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((p, idx) => (
            <ParcoursCard key={p.id} parcours={p} index={idx + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 space-y-3">
      <p className="text-4xl">📚</p>
      <p className="font-medium text-foreground">
        Aucun parcours pour ce profil pour l&apos;instant
      </p>
      <p className="text-sm text-muted">
        Les premiers parcours seront publiés très bientôt.
      </p>
      <Link
        href="/parcours"
        className="inline-block mt-3 text-sm text-primary hover:underline"
      >
        ← Choisir un autre profil
      </Link>
    </div>
  );
}

