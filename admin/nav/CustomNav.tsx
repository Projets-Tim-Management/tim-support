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
    >
      <CustomNavClient groups={groups} />
    </NavShell>
  );
}
