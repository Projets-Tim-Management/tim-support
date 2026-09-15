"use client";

import { getTranslation } from "@payloadcms/translations";
import { Link, useAuth, useConfig, useTranslation } from "@payloadcms/ui";
import { EntityType } from "@payloadcms/ui/shared";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { formatAdminURL } from "payload/shared";
import { Fragment, useState } from "react";

import { hasAdminRole } from "@/core/access";

import CollapsibleGroup from "./CollapsibleGroup";
import { NAV_LAYOUT, NAV_ORDER, isLink, isSubGroup, type NavItem } from "./nav-structure";
import { useNavRail } from "./useNavRail";

const baseClass = "nav";

/** Type d'i18n attendu par `getTranslation` (évite un mismatch de générique). */
type I18n = Parameters<typeof getTranslation>[1];

/** Une entrée de collection/global telle que fournie par `groupNavItems`. */
interface NavEntity {
  type: EntityType;
  slug: string;
  label: Record<string, string> | string;
}

interface NavGroupData {
  label: string;
  entities: NavEntity[];
}

interface Props {
  groups: NavGroupData[];
}

/** Vrai si l'URL courante correspond à ce lien (logique identique à Payload). */
function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    pathname.startsWith(href) && ["/", undefined].includes(pathname[href.length]);
}

/** Lien de menu — réplique fidèle du rendu de `DefaultNavClient` (id, classes,
 *  indicateur d'actif, span label) pour rester compatible avec le SCSS existant. */
function NavLink({
  entity,
  adminRoute,
  isActive,
  i18n,
}: {
  entity: NavEntity;
  adminRoute: string;
  isActive: (href: string) => boolean;
  i18n: I18n;
}) {
  const isGlobal = entity.type === EntityType.global;
  const href = formatAdminURL({
    adminRoute,
    path: isGlobal ? `/globals/${entity.slug}` : `/collections/${entity.slug}`,
  });
  const id = isGlobal ? `nav-global-${entity.slug}` : `nav-${entity.slug}`;
  const active = isActive(href);

  const label = (
    <Fragment>
      {active && <div className={`${baseClass}__link-indicator`} />}
      <span className={`${baseClass}__link-label`}>{getTranslation(entity.label, i18n)}</span>
    </Fragment>
  );

  if (active) {
    return (
      <div className={`${baseClass}__link`} id={id}>
        {label}
      </div>
    );
  }
  return (
    <Link className={`${baseClass}__link`} href={href} id={id} prefetch={false}>
      {label}
    </Link>
  );
}

export default function CustomNavClient({ groups }: Props) {
  const { config } = useConfig();
  const { user } = useAuth();

  /**
   * Groupes VIRTUELS : un libellé du layout qui n'a que des liens libres, sans
   * aucune collection. Ils n'existent pas pour `groupNavItems` — on les fabrique
   * ici, à condition qu'au moins un de leurs liens soit visible pour ce rôle.
   */
  const virtualGroups = (real: NavGroupData[]): NavGroupData[] => {
    const known = new Set(real.map((g) => g.label));
    return Object.entries(NAV_LAYOUT)
      .filter(
        ([label, items]) =>
          !known.has(label) && items.some((it) => isLink(it) && (!it.adminOnly || hasAdminRole(user))),
      )
      .map(([label]) => ({ label, entities: [] }));
  };
  const i18n = useTranslation().i18n as I18n;
  const isActive = useIsActive();
  const pathname = usePathname();
  const adminRoute = config.routes.admin;
  const [railed, setRailed] = useNavRail();

  // Rôles non-admin (support, partenaires) : menus OUVERTS par défaut — la nav
  // est courte, plus simple à parcourir sans dérouler. Admins : accordéon.
  const keepOpen = !hasAdminRole(user);
  const onDashboard = pathname === adminRoute || pathname === `${adminRoute}/`;

  const activeHref = (entity: NavEntity) => {
    const isGlobal = entity.type === EntityType.global;
    return formatAdminURL({
      adminRoute,
      path: isGlobal ? `/globals/${entity.slug}` : `/collections/${entity.slug}`,
    });
  };

  // Un groupe « contient » la page active par ses collections OU par ses liens
  // libres (une vue custom comme le rapprochement Pennylane).
  const groupHasActive = (group: NavGroupData) =>
    group.entities.some((e) => isActive(activeHref(e))) ||
    (NAV_LAYOUT[group.label] ?? []).some((it) => isLink(it) && isActive(it.href));

  // Accordéon : un seul groupe de 1er niveau ouvert à la fois. Au chargement, on
  // ouvre celui qui contient la page active (sinon aucun).
  const [openGroup, setOpenGroup] = useState<string | null>(
    () => [...groups, ...virtualGroups(groups)].find(groupHasActive)?.label ?? null,
  );

  /**
   * Ordre voulu, puis le reste. Un groupe non listé garde sa place relative à
   * la fin plutôt que de disparaître — on ne perd jamais une collection parce
   * qu'elle n'a pas été déclarée quelque part.
   */
  const rank = (label: string) => {
    const i = NAV_ORDER.indexOf(label);
    return i === -1 ? NAV_ORDER.length : i;
  };
  const ordered = [...groups, ...virtualGroups(groups)].sort((a, b) => rank(a.label) - rank(b.label));

  const renderLink = (entity: NavEntity) => (
    <NavLink
      key={entity.slug}
      entity={entity}
      adminRoute={adminRoute}
      isActive={isActive}
      i18n={i18n}
    />
  );

  return (
    <Fragment>
      {/* Accès direct au tableau de bord (pour tous les rôles). Comme le logo,
          on utilise next/link (le Link de Payload ne mène pas à la racine /admin). */}
      {onDashboard ? (
        <div
          className={`${baseClass}__link`}
          id="nav-dashboard"
          {...(railed ? { title: "Tableau de bord" } : {})}
        >
          <div className={`${baseClass}__link-indicator`} />
          <span className={`${baseClass}__link-label`}>Tableau de bord</span>
        </div>
      ) : (
        <NextLink
          className={`${baseClass}__link`}
          href={adminRoute}
          id="nav-dashboard"
          {...(railed ? { title: "Tableau de bord" } : {})}
        >
          <span className={`${baseClass}__link-label`}>Tableau de bord</span>
        </NextLink>
      )}

      {ordered.map((group) => {
        const bySlug = new Map(group.entities.map((e) => [e.slug, e]));
        const layout: NavItem[] = NAV_LAYOUT[group.label] ?? group.entities.map((e) => e.slug);

        // Slugs déjà placés par le layout → le reste est rendu en fin de groupe.
        const placed = new Set<string>();
        layout.forEach((item) => {
          if (isSubGroup(item)) item.slugs.forEach((s) => placed.add(s));
          else if (typeof item === "string") placed.add(item);
        });
        const leftovers = group.entities.filter((e) => !placed.has(e.slug));

        return (
          <CollapsibleGroup
            key={group.label}
            label={group.label}
            iconKey={group.label}
            title={railed ? group.label : undefined}
            {...(keepOpen && !railed
              ? { defaultOpen: true }
              : {
                  open: openGroup === group.label,
                  /**
                   * En mode réduit, cliquer une icône DÉPLIE le menu et l'y
                   * laisse — c'est le geste naturel : on clique parce qu'on
                   * veut voir ce qu'il y a dedans, pas pour un aperçu qui
                   * disparaît dès qu'on bouge la souris.
                   */
                  onToggle: () => {
                    if (railed) {
                      setRailed(false);
                      setOpenGroup(group.label);
                      return;
                    }
                    setOpenGroup((prev) => (prev === group.label ? null : group.label));
                  },
                })}
          >
            {layout.map((item, i) => {
              // Lien libre vers une vue custom : aucune collection derrière, donc
              // rien à chercher dans `bySlug`. Même rendu que les autres liens —
              // un <div> quand il est actif, avec l'indicateur, sinon un <Link>.
              if (isLink(item)) {
                if (item.adminOnly && !hasAdminRole(user)) return null;
                const on = isActive(item.href);
                // Même mécanisme d'icône que les collections : un identifiant
                // `nav-<chemin après /admin, tirets>`, réglé dans `$nav-icons`
                // (« /admin/analyses/facturation » → `nav-analyses-facturation`).
                const id = `nav-${item.href.split("/").filter((seg) => seg && seg !== "admin").join("-")}`;
                const label = (
                  <Fragment>
                    {on && <div className={`${baseClass}__link-indicator`} />}
                    <span className={`${baseClass}__link-label`}>{item.label}</span>
                  </Fragment>
                );
                return on ? (
                  <div key={item.href} className={`${baseClass}__link`} id={id}>
                    {label}
                  </div>
                ) : (
                  <NextLink key={item.href} className={`${baseClass}__link`} href={item.href} id={id} prefetch={false}>
                    {label}
                  </NextLink>
                );
              }

              if (!isSubGroup(item)) {
                const entity = bySlug.get(item);
                return entity ? renderLink(entity) : null;
              }

              const entities = item.slugs
                .map((s) => bySlug.get(s))
                .filter((e): e is NavEntity => Boolean(e));
              if (entities.length === 0) return null;

              const subContainsActive = entities.some((e) => isActive(activeHref(e)));

              return (
                <CollapsibleGroup
                  key={`${item.label}-${i}`}
                  label={item.label}
                  defaultOpen={keepOpen || subContainsActive}
                >
                  {entities.map(renderLink)}
                </CollapsibleGroup>
              );
            })}

            {leftovers.map(renderLink)}
          </CollapsibleGroup>
        );
      })}
    </Fragment>
  );
}
