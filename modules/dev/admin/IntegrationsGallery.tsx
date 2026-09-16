"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Les connexions API en GALERIE, à la place du tableau (beforeListTable).
 *
 * Un logiciel se reconnaît à son logo avant de se lire : une carte par
 * connexion, le logo en entier, le nom, les domaines couverts, l'état, et qui
 * on appelle chez eux. Le tableau natif est masqué (body.dev-gallery-mode) ;
 * le bouton « Créer » de Payload reste.
 */
type Media = { url?: string | null; alt?: string | null } | number | string | null | undefined;
type Integration = {
  id: number | string;
  name: string;
  kind?: string[] | null;
  status?: string | null;
  website?: string | null;
  docUrl?: string | null;
  contactName?: string | null;
  contactRole?: string | null;
  logo?: Media;
};

const KIND_LABEL: Record<string, string> = {
  compta: "Comptabilité / facturation",
  paie: "Paie / RH",
  erp: "ERP / gestion",
  crm: "CRM / marketing",
  documents: "Signature / documents",
  donnees: "Données publiques",
  messagerie: "Messagerie / agenda",
  autre: "Autre",
};
const STATUS: Record<string, { label: string; tone: string }> = {
  etude: { label: "En étude", tone: "muted" },
  "en-cours": { label: "En cours d'intégration", tone: "amber" },
  connectee: { label: "Connectée", tone: "green" },
  abandonnee: { label: "Abandonnée", tone: "red" },
};

const logoUrl = (m: Media): string | null => (m && typeof m === "object" ? (m.url ?? null) : null);
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

export function IntegrationsGallery() {
  const [items, setItems] = useState<Integration[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le tableau natif se masque en CSS, le temps que cette vue est montée.
  useEffect(() => {
    document.body.classList.add("dev-gallery-mode");
    return () => document.body.classList.remove("dev-gallery-mode");
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/payload-api/integrations?limit=200&depth=1&sort=name", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { docs?: Integration[] }) => {
        if (active) setItems(d.docs ?? []);
      })
      .catch(() => {
        if (active) setError("Les connexions n'ont pas pu être chargées.");
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="dev-gallery__empty">{error}</p>;
  if (items == null) return null;

  if (items.length === 0) {
    return (
      <div className="dev-gallery__empty">
        <p>
          Aucune connexion API pour l&apos;instant. Créez une fiche par logiciel tiers que le logiciel TIM
          connectera : l&apos;interlocuteur, le compte démo, la doc, les échanges.
        </p>
        <Link className="tim-btn tim-btn--primary" href="/admin/collections/integrations/create" prefetch={false}>
          Créer la première fiche
        </Link>
      </div>
    );
  }

  return (
    <ul className="dev-gallery" aria-label="Connexions API">
      {items.map((it) => {
        const st = STATUS[it.status ?? ""] ?? STATUS.etude;
        const logo = logoUrl(it.logo);
        return (
          <li key={String(it.id)} className="dev-gallery__item">
            <Link className="dev-gallery__card" href={`/admin/collections/integrations/${it.id}`} prefetch={false}>
              <span className="dev-gallery__logo">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" />
                ) : (
                  <span className="dev-gallery__initials" aria-hidden>
                    {initials(it.name)}
                  </span>
                )}
              </span>
              <span className="dev-gallery__body">
                <span className="dev-gallery__name">{it.name}</span>
                {it.kind && it.kind.length > 0 && (
                  <span className="dev-gallery__kinds">
                    {it.kind.map((k) => (
                      <span key={k} className="dev-gallery__kind">
                        {KIND_LABEL[k] ?? k}
                      </span>
                    ))}
                  </span>
                )}
                <span className="dev-gallery__meta">
                  <span className={`dev-gallery__status dev-gallery__status--${st.tone}`}>{st.label}</span>
                  {it.contactName && (
                    <span className="dev-gallery__contact">
                      {it.contactName}
                      {it.contactRole ? ` · ${it.contactRole}` : ""}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
