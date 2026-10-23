"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { APP_V2_VIDEO as VIDEO } from "@/modules/marketing/lib/app-v2";

/**
 * La vidéo de présentation de la V2.
 *
 * Même principe que les vidéos de la vitrine : rien n'est téléchargé avant le
 * clic (`preload="none"`), seul l'aperçu se charge ; le clic lance la lecture
 * avec le son, dans le même geste (iPhone compris). Le navigateur choisit la
 * source : AV1 s'il le lit, sinon H.264 720p sur mobile et 1080p ailleurs.
 *
 * Mesure anonyme (compteur des analyses vidéo) : affichage, lecture, 25 / 50 /
 * 75 %, fin, et clic vers la prise de rendez-vous.
 */

const PALIERS = [25, 50, 75] as const;

const appareil = () =>
  window.matchMedia("(max-width: 767px)").matches
    ? "mobile"
    : window.matchMedia("(max-width: 1023px)").matches
      ? "tablette"
      : "ordinateur";

/** Envoi sans attendre de réponse : la mesure ne doit jamais gêner la lecture. */
export function compterVue(etape: string) {
  try {
    void fetch("/api/app-v2/vues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etape, appareil: appareil() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* mesure perdue, sans conséquence */
  }
}

const duree = `${Math.floor(VIDEO.dureeSecondes / 60)} min ${String(VIDEO.dureeSecondes % 60).padStart(2, "0")}`;

export default function V2Video() {
  const cadre = useRef<HTMLDivElement>(null);
  const lecteur = useRef<HTMLVideoElement>(null);
  const paliersVus = useRef(new Set<number>());
  const [lancee, setLancee] = useState(false);
  const [finie, setFinie] = useState(false);

  // Affichage : une fois, quand la vidéo est visible à moitié.
  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        compterVue("affichage");
        obs.disconnect();
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const lancer = () => {
    const el = lecteur.current;
    if (!el) return;
    setLancee(true);
    setFinie(false);
    void el.play().catch(() => {
      // Lecture refusée (rare) : les contrôles natifs prennent le relais.
    });
    compterVue("lecture");
    // Recentre la vidéo pendant qu'elle s'élargit, puis une fois à sa taille.
    const centrer = () =>
      cadre.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
    window.setTimeout(centrer, 120);
    window.setTimeout(centrer, 750);
  };

  const auProgres = () => {
    const el = lecteur.current;
    if (!el || !el.duration) return;
    for (const p of PALIERS) {
      if (!paliersVus.current.has(p) && (el.currentTime / el.duration) * 100 >= p) {
        paliersVus.current.add(p);
        compterVue(String(p));
      }
    }
  };

  const terminer = () => {
    compterVue("fin");
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    if (lecteur.current) lecteur.current.currentTime = 0;
    paliersVus.current.clear();
    setLancee(false);
    setFinie(true);
  };

  const versRendezVous = () => {
    compterVue("cta");
    lecteur.current?.pause();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    document.getElementById("rendez-vous")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const apercu = (
    <Image
      src={VIDEO.poster.url}
      alt={VIDEO.poster.alt}
      width={VIDEO.poster.largeur}
      height={VIDEO.poster.hauteur}
      sizes="90vw"
      priority
      className="absolute inset-0 h-full w-full object-cover"
    />
  );

  return (
    /*
     * Au clic, la vidéo sort de la colonne et s'élargit à 90 % de l'écran (sans
     * dépasser 90 % de sa hauteur), toujours centrée — comme sur la vitrine. Elle
     * reprend sa place à la fin. Centrée par `left-1/2` dans les deux états : seule
     * la largeur change, la transition reste un simple agrandissement.
     */
    <div
      ref={cadre}
      className="relative left-1/2 aspect-video -translate-x-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl shadow-absence/20 ring-1 ring-border transition-[width,border-radius,box-shadow] duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none"
      style={{ width: lancee ? "max(100%, min(90vw, calc(90vh * 16 / 9)))" : "100%" }}
    >
      <video
        ref={lecteur}
        className="absolute inset-0 h-full w-full bg-surface"
        preload="none"
        playsInline
        controls={lancee}
        onTimeUpdate={auProgres}
        onEnded={terminer}
        aria-label={VIDEO.titre}
      >
        <source src={VIDEO.sources.av1} type='video/mp4; codecs="av01.0.08M.08, mp4a.40.2"' />
        <source src={VIDEO.sources.mp4Mobile} type="video/mp4" media="(max-width: 767px)" />
        <source src={VIDEO.sources.mp4} type="video/mp4" />
      </video>

      {!lancee && !finie && (
        <button
          type="button"
          onClick={lancer}
          className="group absolute inset-0 block w-full cursor-pointer"
          aria-label={`Lire la vidéo : ${VIDEO.titre} (${duree}, avec le son)`}
        >
          {apercu}
          <span aria-hidden="true" className="absolute inset-0 bg-foreground/0 transition-colors duration-300 group-hover:bg-foreground/10" />
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-lg bg-foreground/80 py-2.5 pl-2.5 pr-5 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-md transition-transform duration-300 group-hover:scale-105 group-active:scale-95 sm:py-3 sm:pl-3 sm:pr-6"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-primary sm:h-12 sm:w-12">
              <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 sm:h-6 sm:w-6" fill="currentColor" aria-hidden="true">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
              </svg>
            </span>
            <span className="flex flex-col whitespace-nowrap text-left leading-tight">
              <span className="text-[15px] font-semibold sm:text-[17px]">Voir la présentation</span>
              <span className="text-xs text-white/75 sm:text-[13px]">{duree} · avec le son</span>
            </span>
          </span>
        </button>
      )}

      {/* Fin : le moment où l'envie de voir l'app en vrai est la plus forte. */}
      {!lancee && finie && (
        <div className="absolute inset-0">
          {apercu}
          <div aria-hidden="true" className="absolute inset-0 bg-foreground/75 backdrop-blur-[3px]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-white sm:gap-5">
            <p className="hidden max-w-lg text-xl font-bold leading-tight sm:block md:text-2xl">
              Envie d&apos;en faire le tour avec nous avant la mise en production&nbsp;?
            </p>
            <div className="flex flex-col items-center gap-2.5 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={versRendezVous}
                className="rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-primary-dark sm:px-6 sm:py-3 sm:text-base"
              >
                Réserver 20 minutes
              </button>
              <button
                type="button"
                onClick={lancer}
                className="rounded-btn px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/10 sm:py-3"
              >
                Revoir la vidéo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
