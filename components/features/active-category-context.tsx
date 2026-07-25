"use client";

import { createContext, useContext, useState, useEffect } from "react";

type Ctx = { slugs: string[]; setSlugs: (s: string[]) => void };

const ActiveCategoryCtx = createContext<Ctx>({ slugs: [], setSlugs: () => {} });

export function ActiveCategoryProvider({ children }: { children: React.ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  return (
    <ActiveCategoryCtx.Provider value={{ slugs, setSlugs }}>
      {children}
    </ActiveCategoryCtx.Provider>
  );
}

export function useActiveCategory() {
  return useContext(ActiveCategoryCtx);
}

/** Monté par la page feature — transmet TOUTES les catégories de la feature à la sidebar. */
export function SetActiveCategory({ slugs }: { slugs: string[] }) {
  const { setSlugs } = useActiveCategory();
  useEffect(() => {
    setSlugs(slugs);
    return () => setSlugs([]);
  }, [slugs, setSlugs]);
  return null;
}
