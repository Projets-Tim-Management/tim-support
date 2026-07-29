"use client";

import { getTranslation } from "@payloadcms/translations";
import { Link, useConfig, useTranslation } from "@payloadcms/ui";
import { EntityType } from "@payloadcms/ui/shared";
import { usePathname } from "next/navigation";
import { formatAdminURL } from "payload/shared";
import { Fragment, useState } from "react";

import CollapsibleGroup from "./CollapsibleGroup";
import { NAV_LAYOUT, isSubGroup, type NavItem } from "./nav-structure";

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
  const i18n = useTranslation().i18n as I18n;
  const isActive = useIsActive();
  const adminRoute = config.routes.admin;

  const activeHref = (entity: NavEntity) => {
    const isGlobal = entity.type === EntityType.global;
    return formatAdminURL({
      adminRoute,
      path: isGlobal ? `/globals/${entity.slug}` : `/collections/${entity.slug}`,
    });
  };

  const groupHasActive = (group: NavGroupData) =>
    group.entities.some((e) => isActive(activeHref(e)));

  // Accordéon : un seul groupe de 1er niveau ouvert à la fois. Au chargement, on
  // ouvre celui qui contient la page active (sinon aucun).
  const [openGroup, setOpenGroup] = useState<string | null>(
    () => groups.find(groupHasActive)?.label ?? null,
  );

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
      {groups.map((group) => {
        const bySlug = new Map(group.entities.map((e) => [e.slug, e]));
        const layout: NavItem[] = NAV_LAYOUT[group.label] ?? group.entities.map((e) => e.slug);

        // Slugs déjà placés par le layout → le reste est rendu en fin de groupe.
        const placed = new Set<string>();
        layout.forEach((item) => {
          if (isSubGroup(item)) item.slugs.forEach((s) => placed.add(s));
          else placed.add(item);
        });
        const leftovers = group.entities.filter((e) => !placed.has(e.slug));

        return (
          <CollapsibleGroup
            key={group.label}
            label={group.label}
            open={openGroup === group.label}
            onToggle={() =>
              setOpenGroup((prev) => (prev === group.label ? null : group.label))
            }
          >
            {layout.map((item, i) => {
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
                  defaultOpen={subContainsActive}
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
