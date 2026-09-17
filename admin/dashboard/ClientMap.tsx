"use client";

import "leaflet/dist/leaflet.css";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { euros } from "./format";
import type { Place } from "./data-home";

/**
 * Où sont les clients signés — une carte, un point par fiche.
 *
 * Leaflet, chargé dans le navigateur seulement (il a besoin de `window`), sur
 * le fond OpenStreetMap, désaturé pour que les points ressortent. Chaque point
 * est un cercle à la couleur TIM, dont la taille suit le CA mensuel (racine
 * carrée : un client à 400 € n'écrase pas un client à 100 €) ; l'infobulle
 * dit le nom, la commune, le CA, et mène à la fiche.
 *
 * Les points viennent de la Base Adresse Nationale (voir core/lib/geocode.ts),
 * posés quand l'adresse de facturation d'une fiche change. Une fiche sans
 * adresse — ou dont l'adresse est inconnue de la BAN — n'a pas de point ; on
 * le dit sous la carte plutôt que de la laisser disparaître en silence.
 */
const FRANCE: [number, number] = [46.6, 2.4];
/** Les tuiles OpenStreetMap : libres avec attribution, sans clé — pour un back-office à quelques comptes, c'est dans leur politique d'usage. */
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const radiusFor = (ca: number) => Math.max(7, Math.min(18, 5 + Math.sqrt(Math.max(ca, 0)) * 0.6));

export default function ClientMap({ places, unplaced }: { places: Place[]; unplaced: number }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    void import("leaflet").then((L) => {
      if (cancelled || !el) return;
      // Zoom au quart : avec un zoom entier, « toute la France » retombe sur toute l'Europe.
      map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, zoomSnap: 0.25 });
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map);
      const color = getComputedStyle(document.documentElement).getPropertyValue("--tim-primary").trim() || "#fe5464";
      const group = L.featureGroup();
      for (const p of places) {
        const marker = L.circleMarker([p.lat, p.lng], {
          radius: radiusFor(p.ca),
          color: "#fff",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.85,
        });
        marker.bindTooltip(escape(p.name), { direction: "top", offset: [0, -6], opacity: 0.95 });
        marker.bindPopup(
          `<div class="home-map__pop">` +
            `<strong>${escape(p.name)}</strong>` +
            `<span>${escape(p.city ?? "")}${p.since ? ` · client depuis ${new Date(p.since).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}` : ""}</span>` +
            `<span>${escape(euros(p.ca))} HT / mois</span>` +
            `<a href="${escape(p.href)}">Ouvrir la fiche ›</a>` +
            `</div>`,
          { closeButton: false, offset: [0, -4] },
        );
        group.addLayer(marker);
      }
      group.addTo(map);
      if (places.length > 1) map.fitBounds(group.getBounds(), { padding: [28, 28], maxZoom: 9 });
      else if (places.length === 1) map.setView([places[0].lat, places[0].lng], 8);
      else map.setView(FRANCE, 5);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [places]);

  return (
    <section className="home-section" aria-label="Carte des clients signés">
      <header className="home-section__head">
        <h2 className="home-section__title">Où sont nos clients</h2>
        <span className="home-section__count">{places.length}</span>
        <Link className="home-section__more" href="/admin/collections/partner-clients?where[clientStatus][equals]=actif">
          Clients signés ›
        </Link>
      </header>
      <div className="home-map">
        <div ref={box} className="home-map__canvas" role="img" aria-label={`${places.length} clients signés sur la carte`} />
        {unplaced > 0 && (
          <p className="home-map__note">
            {unplaced} client{unplaced > 1 ? "s" : ""} signé{unplaced > 1 ? "s" : ""} sans point : adresse de facturation absente ou inconnue de la Base Adresse
            Nationale.
          </p>
        )}
      </div>
    </section>
  );
}
