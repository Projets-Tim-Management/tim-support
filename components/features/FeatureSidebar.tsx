"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import type { FeatureTerm } from "@/lib/types";
import { useActiveCategory } from "@/components/features/active-category-context";

/** Retourne vrai si ce nœud est le match le plus profond parmi les slugs actifs.
 *  Un nœud est "le plus spécifique" s'il est dans les slugs ET qu'aucun de ses
 *  descendants ne l'est aussi (sinon c'est un ancêtre, pas la feuille active). */
function isDeepestMatch(node: TreeNode, activeSlugs: string[]): boolean {
  if (!activeSlugs.includes(node.slug)) return false;
  return !node.children.some((child) => containsAny(child, activeSlugs));
}

function containsAny(node: TreeNode, slugs: string[]): boolean {
  if (slugs.includes(node.slug)) return true;
  return node.children.some((c) => containsAny(c, slugs));
}

interface TreeNode extends FeatureTerm {
  children: TreeNode[];
}

function buildTree(categories: FeatureTerm[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  categories.forEach((c) => map.set(c.id, { ...c, children: [] }));

  const roots: TreeNode[] = [];
  map.forEach((node) => {
    if (!node.parent || node.parent === 0) roots.push(node);
    else {
      const parent = map.get(node.parent);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  });

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

// Vérifie si un slug ou l'un de ses descendants est actif
function containsActive(node: TreeNode, active: string): boolean {
  if (node.slug === active) return true;
  return node.children.some((c) => containsActive(c, active));
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      className={`transition-transform duration-200 shrink-0 ${open ? "rotate-90" : ""}`}
    >
      <path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavItem({
  node,
  active,
  activeSlugs,
  depth = 0,
}: {
  node:        TreeNode;
  active:      string;        // slug depuis searchParams (page liste)
  activeSlugs: string[];      // slugs depuis contexte (page feature)
  depth?:      number;
}) {
  const isActive  = active
    ? active === node.slug
    : isDeepestMatch(node, activeSlugs);
  const hasActive = active
    ? containsActive(node, active)
    : containsAny(node, activeSlugs);
  const [open, setOpen] = useState(hasActive || depth === 0);

  // Ouvre automatiquement si un enfant devient actif
  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  const hasChildren = node.children.length > 0;
  const pl = depth === 0 ? "" : depth === 1 ? "pl-3" : "pl-6";

  return (
    <li>
      <div className={`flex items-center group ${pl}`}>
        {/* Lien principal */}
        <Link
          href={`/features?category=${node.slug}`}
          className={`flex-1 flex items-center gap-1.5 py-1.5 px-2 rounded-md text-sm transition-all ${
            isActive
              ? "text-primary font-medium bg-primary-light"
              : "text-foreground hover:text-foreground hover:bg-surface"
          } ${isActive ? "border-l-2 border-primary rounded-l-none pl-[6px]" : "border-l-2 border-transparent"}`}
        >
          {node.name}
          {node.count !== undefined && node.count > 0 && (
            <span className={`ml-auto text-xs tabular-nums ${isActive ? "text-primary" : "text-muted"}`}>
              {node.count}
            </span>
          )}
        </Link>

        {/* Bouton toggle si enfants */}
        {hasChildren && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="p-1.5 text-muted hover:text-foreground transition-colors"
            aria-label={open ? "Réduire" : "Développer"}
          >
            <ChevronIcon open={open} />
          </button>
        )}
      </div>

      {/* Enfants */}
      {hasChildren && open && (
        <ul className="mt-0.5 space-y-0.5 border-l border-border ml-4">
          {node.children.map((child) => (
            <NavItem key={child.id} node={child} active={active} activeSlugs={activeSlugs} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function FeatureSidebar({ categories }: { categories: FeatureTerm[] }) {
  const searchParams = useSearchParams();
  const { slugs: ctxSlugs } = useActiveCategory();
  // Page liste (/features?category=xxx) → searchParams
  // Page feature (/features/[slug])     → contexte avec tous les slugs
  const currentCat  = searchParams.get("category") ?? "";
  const tree        = buildTree(categories);

  // Note : la masquage responsive est géré par les composants parents
  // (FeaturesLayout aside + MobileSidebarTrigger drawer) — pas ici.
  return (
    <aside className="w-full lg:w-56 shrink-0">
      <nav className="lg:sticky lg:top-24">
        <ul className="space-y-0.5">
          {/* Toutes */}
          <li>
            <Link
              href="/features"
              className={`flex items-center gap-2 py-1.5 px-2 rounded-md text-sm transition-all border-l-2 ${
                !currentCat && ctxSlugs.length === 0
                  ? "text-primary font-medium bg-primary-light border-primary"
                  : "text-foreground hover:bg-surface border-transparent"
              }`}
            >
              Toutes les fonctionnalités
            </Link>
          </li>

          <li><div className="my-2 border-t border-border" /></li>

          {tree.map((root) => (
            <NavItem key={root.id} node={root} active={currentCat} activeSlugs={ctxSlugs} depth={0} />
          ))}
        </ul>
      </nav>
    </aside>
  );
}
