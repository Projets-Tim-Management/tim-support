"use client";

import "leaflet/dist/leaflet.css";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { regionOf } from "@/core/lib/regions";

import { euros } from "./format";
import type { Place } from "./data-home";

/**
 * Où sont les clients signés — une carte, un point par fiche, et de quoi
 * jouer avec : chercher un nom ou une commune, filtrer par apporteur, par
 * taille ou par région (déduite du code postal), ne garder que le top 5, cliquer un client dans la liste pour voler jusqu'à
 * lui, zoomer à la molette une fois la carte « prise en main » (un clic
 * dessus — sinon elle avalerait le défilement de la page).
 *
 * Leaflet, chargé dans le navigateur seulement (il a besoin de `window`), sur
 * le fond OpenStreetMap passé en gris pour que les points rouges ressortent.
 * Chaque point est un cercle à la couleur TIM, dont la taille suit le CA
 * mensuel (racine carrée : un client à 400 € n'écrase pas un client à 100 €) ;
 * l'infobulle dit le nom, la commune, le CA, et mène à la fiche.
 *
 * Les points viennent de la Base Adresse Nationale, ou de Nominatim hors de
 * France (voir core/lib/geocode.ts), posés quand l'adresse de facturation
 * d'une fiche change. Une fiche sans adresse — ou dont l'adresse est
 * introuvable — n'a pas de point ; on le dit sous la carte plutôt que de la
 * laisser disparaître en silence.
 */
const FRANCE: [number, number] = [46.6, 2.4];
/** Les tuiles OpenStreetMap : libres avec attribution, sans clé — pour un back-office à quelques comptes, c'est dans leur politique d'usage. */
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

type Band = { key: string; label: string; test: (ca: number) => boolean };
/** Trois tailles de client, en CA HT mensuel — des bornes rondes, lisibles. */
const BANDS: Band[] = [
  { key: "s", label: "< 100 €", test: (ca) => ca < 100 },
  { key: "m", label: "100 – 300 €", test: (ca) => ca >= 100 && ca < 300 },
  { key: "l", label: "300 € et +", test: (ca) => ca >= 300 },
];

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const radiusFor = (ca: number) => Math.max(7, Math.min(18, 5 + Math.sqrt(Math.max(ca, 0)) * 0.6));

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const sinceLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) : null);

const popupHtml = (p: Place) =>
  `<div class="home-map__pop">` +
  `<strong>${escape(p.name)}</strong>` +
  `<span>${escape([p.city, p.since ? `client depuis ${sinceLabel(p.since)}` : null].filter(Boolean).join(" · "))}</span>` +
  `<span>${escape(euros(p.ca))} HT / mois · ${p.licences} licence${p.licences > 1 ? "s" : ""}${p.partner ? ` · via ${escape(p.partner)}` : ""}</span>` +
  `<a href="${escape(p.href)}">Ouvrir la fiche ›</a>` +
  `</div>`;

type Leaflet = typeof import("leaflet");

export default function ClientMap({ places, unplaced }: { places: Place[]; unplaced: number }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markers = useRef(new Map<string, import("leaflet").CircleMarker>());
  const leaflet = useRef<Leaflet | null>(null);

  const [partners, setPartners] = useState<Set<string>>(new Set());
  const [band, setBand] = useState<string | null>(null);
  const [region, setRegion] = useState<string>("");
  const [query, setQuery] = useState("");
  const [top, setTop] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  /** Les apporteurs présents, avec leur nombre de clients — pour les puces. */
  const partnerChips = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const p of places) {
      const k = p.partnerId != null ? String(p.partnerId) : "—";
      const cur = m.get(k) ?? { label: p.partner ?? "Sans apporteur", n: 0 };
      cur.n += 1;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [places]);

  /** Les régions présentes (déduites du code postal) et les années de signature, avec leurs comptes. */
  const regions = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of places) {
      const r = regionOf(p.postcode);
      if (r) m.set(r, (m.get(r) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [places]);

  const visible = useMemo(() => {
    const q = fold(query.trim());
    const list = places
      .filter((p) => partners.size === 0 || partners.has(p.partnerId != null ? String(p.partnerId) : "—"))
      .filter((p) => !band || BANDS.find((b) => b.key === band)?.test(p.ca))
      .filter((p) => !region || regionOf(p.postcode) === region)
      .filter((p) => !q || fold(`${p.name} ${p.city ?? ""} ${p.postcode ?? ""}`).includes(q))
      .sort((a, b) => b.ca - a.ca);
    return top ? list.slice(0, 5) : list;
  }, [places, partners, band, region, query, top]);
  const total = visible.reduce((a, p) => a + p.ca, 0);

  // ── La carte et ses points, une fois.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const registry = markers.current;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !el) return;
      leaflet.current = L;
      // Zoom au quart : avec un zoom entier, « toute la France » retombe sur toute l'Europe.
      const map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, zoomSnap: 0.25 });
      mapRef.current = map;
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map);
      // La molette ne zoome qu'une fois la carte cliquée, et rend la main
      // quand la souris la quitte : sinon elle avale le défilement de la page.
      map.on("click focus", () => map.scrollWheelZoom.enable());
      map.on("mouseout blur", () => map.scrollWheelZoom.disable());

      const color = getComputedStyle(document.documentElement).getPropertyValue("--tim-primary").trim() || "#fe5464";
      for (const p of places) {
        const marker = L.circleMarker([p.lat, p.lng], { radius: radiusFor(p.ca), color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.85 });
        marker.bindTooltip(escape(p.name), { direction: "top", offset: [0, -6], opacity: 0.95 });
        marker.bindPopup(popupHtml(p), { closeButton: false, offset: [0, -4] });
        marker.on("mouseover", () => setHover(String(p.id)));
        marker.on("mouseout", () => setHover(null));
        registry.set(String(p.id), marker);
      }
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      registry.clear();
    };
  }, [places]);

  // ── Ce qui est visible : on ajoute / retire les points, et on recadre.
  useEffect(() => {
    const apply = () => {
      const m = mapRef.current;
      const l = leaflet.current;
      if (!m || !l) return false;
      const shown = new Set(visible.map((p) => String(p.id)));
      for (const [id, marker] of markers.current) {
        if (shown.has(id)) marker.addTo(m);
        else m.removeLayer(marker);
      }
      const layers = visible.map((p) => markers.current.get(String(p.id))).filter((x): x is import("leaflet").CircleMarker => Boolean(x));
      if (layers.length > 1) m.fitBounds(l.featureGroup(layers).getBounds(), { padding: [28, 28], maxZoom: 9 });
      else if (layers.length === 1) m.setView(layers[0].getLatLng(), 8);
      else m.setView(FRANCE, 5);
      return true;
    };
    // Leaflet arrive de façon asynchrone : au premier rendu, on réessaie jusqu'à ce qu'il soit là.
    if (apply()) return;
    const t = setInterval(() => {
      if (apply()) clearInterval(t);
    }, 50);
    return () => clearInterval(t);
  }, [visible]);

  // ── Survol dans la liste ⇄ point mis en avant sur la carte.
  useEffect(() => {
    for (const [id, marker] of markers.current) {
      const p = places.find((x) => String(x.id) === id);
      if (!p) continue;
      const hot = hover === id;
      marker.setStyle({ fillOpacity: hot ? 1 : 0.85, weight: hot ? 3 : 2 });
      marker.setRadius(radiusFor(p.ca) + (hot ? 3 : 0));
    }
  }, [hover, places]);

  const flyTo = (p: Place) => {
    const map = mapRef.current;
    const marker = markers.current.get(String(p.id));
    if (!map || !marker) return;
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 11), { duration: 0.8 });
    map.once("moveend", () => marker.openPopup());
  };

  const togglePartner = (k: string) =>
    setPartners((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const filtered = partners.size > 0 || band != null || region !== "" || query.trim() !== "" || top;
  const reset = () => {
    setPartners(new Set());
    setBand(null);
    setRegion("");
    setQuery("");
    setTop(false);
  };

  return (
    <section className="home-section" aria-label="Carte des clients signés">
      <header className="home-section__head">
        <h2 className="home-section__title">Où sont nos clients</h2>
        <span className="home-section__count">{filtered ? `${visible.length} / ${places.length}` : places.length}</span>
        <Link className="home-section__more" href="/admin/collections/partner-clients?where[clientStatus][equals]=actif">
          Clients signés ›
        </Link>
      </header>
      <div className="home-map">
        <div className="home-map__stage">
          <div ref={box} className="home-map__canvas" role="img" aria-label={`${visible.length} clients signés sur la carte`} />
          <p className="home-map__hint">Cliquez sur la carte pour zoomer à la molette.</p>
        </div>

        <aside className="home-map__side" aria-label="Filtres de la carte">
          <div className="home-map__group home-map__group--search">
            <input
              type="search"
              className="home-map__search"
              placeholder="Un nom, une commune…"
              aria-label="Chercher un client sur la carte"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {partnerChips.length > 1 && (
            <div className="home-map__group">
              <h3 className="home-map__h">Apporteur</h3>
              <div className="home-map__chips">
                {partnerChips.map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    className={`home-map__chip${partners.has(k) ? " home-map__chip--on" : ""}`}
                    aria-pressed={partners.has(k)}
                    onClick={() => togglePartner(k)}
                  >
                    {v.label} <span className="home-map__chip-n">{v.n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="home-map__group">
            <h3 className="home-map__h">Taille</h3>
            <div className="home-map__chips">
              {BANDS.map((b) => {
                const n = places.filter((p) => b.test(p.ca)).length;
                return (
                  <button
                    key={b.key}
                    type="button"
                    className={`home-map__chip${band === b.key ? " home-map__chip--on" : ""}`}
                    aria-pressed={band === b.key}
                    disabled={n === 0}
                    onClick={() => setBand((cur) => (cur === b.key ? null : b.key))}
                  >
                    {b.label} <span className="home-map__chip-n">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="home-map__group home-map__group--row">
            {regions.length > 1 && (
              <label className="home-map__field">
                <span className="home-map__h">Région</span>
                <select className="home-map__select" value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="">Toutes ({places.length})</option>
                  {regions.map(([r, n]) => (
                    <option key={r} value={r}>
                      {r} ({n})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="home-map__chips">
              <button type="button" className={`home-map__chip home-map__chip--gold${top ? " home-map__chip--on" : ""}`} aria-pressed={top} onClick={() => setTop((t) => !t)}>
                ★ Top 5
              </button>
            </div>
          </div>

          <ol className="home-map__list">
            {visible.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`home-map__row${hover === String(p.id) ? " home-map__row--hot" : ""}`}
                  onClick={() => flyTo(p)}
                  onMouseEnter={() => setHover(String(p.id))}
                  onMouseLeave={() => setHover(null)}
                  title="Voir sur la carte"
                >
                  <span className="home-map__dot" style={{ width: radiusFor(p.ca), height: radiusFor(p.ca) }} aria-hidden />
                  <span className="home-map__row-body">
                    <span className="home-map__row-name">{p.name}</span>
                    <span className="home-map__row-sub">{[p.city, euros(p.ca)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="home-map__none">Aucun client ne correspond.</li>}
          </ol>

          <footer className="home-map__foot">
            <span>
              <strong>{visible.length}</strong> client{visible.length > 1 ? "s" : ""} · <strong>{euros(total)}</strong> HT / mois
            </span>
            {filtered && (
              <button type="button" className="home-map__reset" onClick={reset}>
                Tout afficher
              </button>
            )}
          </footer>
        </aside>

        {unplaced > 0 && (
          <p className="home-map__note">
            {unplaced} client{unplaced > 1 ? "s" : ""} signé{unplaced > 1 ? "s" : ""} sans point : adresse de facturation absente, ou introuvable.
          </p>
        )}
      </div>
    </section>
  );
}
