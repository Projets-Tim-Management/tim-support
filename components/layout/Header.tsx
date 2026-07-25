"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import SearchModal from "@/components/ui/SearchModal";

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);

  // ⌘K / Ctrl+K pour ouvrir la recherche + événement "tim-search:open"
  // émis par les SearchBar trigger (home, /search, etc.).
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setInitialQuery(undefined);
        setSearchOpen(true);
      }
    };
    const openHandler = (e: Event) => {
      const ev = e as CustomEvent<{ query?: string }>;
      setInitialQuery(ev.detail?.query);
      setSearchOpen(true);
    };
    window.addEventListener("keydown", keyHandler);
    window.addEventListener("tim-search:open", openHandler);
    return () => {
      window.removeEventListener("keydown", keyHandler);
      window.removeEventListener("tim-search:open", openHandler);
    };
  }, []);

  const handleClose = () => {
    setSearchOpen(false);
    setInitialQuery(undefined);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-border">
        {/* Grille 3 colonnes égales — garantit que la recherche est toujours
            centrée sur le viewport, peu importe le contenu des côtés. */}
        <div className="max-w-none px-6 h-16 grid grid-cols-3 items-center gap-4">

          {/* Bloc gauche — Logo + Nouveautés */}
          <div className="flex items-center gap-5">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/logo-support.webp"
                alt="TIM Management"
                width={160}
                height={32}
                className="h-8 w-auto"
              />
            </Link>
            <Link
              href="/parcours"
              className="hidden md:inline-flex items-center text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              Parcours
            </Link>
            <Link
              href="/nouveautes"
              className="hidden md:inline-flex items-center text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              Nouveautés
            </Link>
            <Link
              href="/mises-a-jour"
              className="hidden md:inline-flex items-center text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              Mises à jour
            </Link>
          </div>

          {/* Bloc centre — Trigger recherche, centré dans la cellule */}
          <div className="flex justify-center">
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Rechercher"
              className="flex items-center justify-center sm:justify-start gap-3 w-9 sm:w-full sm:max-w-sm h-9 px-0 sm:px-3 bg-surface border border-border rounded-md text-sm text-muted hover:border-[#b4b4b4] hover:bg-white transition-all group"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <span className="hidden sm:block flex-1 text-left">Rechercher...</span>
              <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-white text-muted group-hover:border-[#b4b4b4]/40 transition-colors">
                <span>⌘</span><span>K</span>
              </kbd>
            </button>
          </div>

          {/* Bloc droite — Contact (CTA) + retour à l'app, alignés à droite */}
          <div className="flex items-center justify-end gap-3 sm:gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span className="hidden sm:inline">Nous contacter</span>
              <span className="sm:hidden">Contact</span>
            </Link>
            <a
              href={process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tim-management.co"}
              className="text-sm text-muted hover:text-foreground transition-colors hidden md:flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Retour à l&apos;app
            </a>
          </div>
        </div>
      </header>

      <SearchModal open={searchOpen} onClose={handleClose} initialQuery={initialQuery} />
    </>
  );
}
