import { Logout } from "@payloadcms/ui";
import { RenderServerComponent } from "@payloadcms/ui/elements/RenderServerComponent";
import { EntityType, groupNavItems } from "@payloadcms/ui/shared";
import type { PayloadComponent } from "payload";
import type { ComponentType } from "react";

import CustomNavClient from "./CustomNavClient";
import NavShell from "./NavShell";

/** Type accepté par `RenderServerComponent` pour son champ `Component`. */
type RSCComponent =
  | PayloadComponent
  | PayloadComponent[]
  | ComponentType
  | ComponentType[]
  | undefined;

/**
 * Nav de l'admin, remplaçant `DefaultNav` (via admin.components.Nav).
 *
 * Reproduit fidèlement le chrome de Payload (before/after nav, contrôles,
 * logout, hamburger — voir NavShell) mais délègue le rendu des groupes à
 * CustomNavClient, qui ajoute un 2ᵉ niveau de sous-groupes repliables défini
 * dans nav-structure.ts. Regroupement et filtrage d'accès inchangés : on
 * réutilise `groupNavItems` + `visibleEntities` exactement comme Payload.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function CustomNav(props: any) {
  const {
    documentSubViewType,
    i18n,
    locale,
    params,
    payload,
    permissions,
    searchParams,
    user,
    viewType,
    visibleEntities,
  } = props;

  if (!payload?.config) return null;

  /**
   * Les logos réglés en back-office. Lus ici, côté serveur, pour qu'ils soient
   * dans le HTML du premier rendu : passés au client, le menu afficherait
   * d'abord le logo livré avec le code, puis le vrai — un clignotement à
   * chaque page.
   *
   * `overrideAccess` : le menu s'affiche pour tous les rôles, y compris ceux
   * qui n'ont pas le droit de MODIFIER l'apparence.
   */
  const appearance = (await payload
    .findGlobal({ slug: "appearance", depth: 1, overrideAccess: true })
    .catch(() => null)) as { logo?: { url?: string }; icon?: { url?: string } } | null;

  const {
    admin: {
      components: { afterNav, afterNavLinks, beforeNav, beforeNavLinks, logout, settingsMenu },
    },
    collections,
    globals,
  } = payload.config;

  const groups = groupNavItems(
    [
      ...collections
        .filter(({ slug }: { slug: string }) => visibleEntities.collections.includes(slug))
        .map((entity: unknown) => ({ type: EntityType.collection, entity })),
      ...globals
        .filter(({ slug }: { slug: string }) => visibleEntities.globals.includes(slug))
        .map((entity: unknown) => ({ type: EntityType.global, entity })),
    ],
    permissions,
    i18n,
  );

  const serverProps = { i18n, locale, params, payload, permissions, searchParams, user };
  const clientProps = { documentSubViewType, viewType };

  const LogoutComponent = RenderServerComponent({
    clientProps,
    Component: logout?.Button,
    Fallback: Logout,
    importMap: payload.importMap,
    serverProps,
  });

  const RenderedSettingsMenu =
    settingsMenu && Array.isArray(settingsMenu)
      ? settingsMenu.map((item: RSCComponent, index: number) =>
          RenderServerComponent({
            clientProps,
            Component: item,
            importMap: payload.importMap,
            key: `settings-menu-item-${index}`,
            serverProps,
          }),
        )
      : [];

  const render = (Component: RSCComponent) =>
    RenderServerComponent({ clientProps, Component, importMap: payload.importMap, serverProps });

  return (
    <NavShell
      afterNav={render(afterNav)}
      afterNavLinks={render(afterNavLinks)}
      beforeNav={render(beforeNav)}
      beforeNavLinks={render(beforeNavLinks)}
      logout={LogoutComponent}
      settingsMenu={RenderedSettingsMenu}
      logoUrl={appearance?.logo?.url ?? undefined}
      iconUrl={appearance?.icon?.url ?? undefined}
    >
      <CustomNavClient groups={groups} />
    </NavShell>
  );
}
