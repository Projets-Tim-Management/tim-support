"use client";

import { GearIcon, Hamburger, Popup, useConfig, useNav, useTranslation } from "@payloadcms/ui";
import NextLink from "next/link";
import React, { Fragment } from "react";

const baseClass = "nav";

/** Bouton hamburger (fermeture du menu en mobile) — réplique de NavHamburger. */
function NavHamburger() {
  const { navOpen, setNavOpen } = useNav();
  return (
    <button
      className={`${baseClass}__mobile-close`}
      onClick={() => setNavOpen(false)}
      tabIndex={!navOpen ? -1 : undefined}
      type="button"
    >
      <Hamburger isActive />
    </button>
  );
}

/** Menu roue crantée (paramètres) — réplique de SettingsMenuButton. */
function SettingsMenuButton({ settingsMenu }: { settingsMenu: React.ReactNode[] }) {
  const { t } = useTranslation();
  if (!settingsMenu || settingsMenu.length === 0) return null;
  return (
    <Popup
      button={<GearIcon ariaLabel={t("general:menu")} />}
      className="settings-menu-button"
      horizontalAlign="left"
      id="settings-menu"
      size="small"
      verticalAlign="bottom"
    >
      {settingsMenu.map((item, i) => (
        <Fragment key={`settings-menu-item-${i}`}>{item}</Fragment>
      ))}
    </Popup>
  );
}

interface Props {
  beforeNav?: React.ReactNode;
  beforeNavLinks?: React.ReactNode;
  afterNavLinks?: React.ReactNode;
  afterNav?: React.ReactNode;
  logout?: React.ReactNode;
  settingsMenu?: React.ReactNode[];
  children: React.ReactNode;
}

/**
 * Enveloppe cliente du menu — réplique NavWrapper (aside + zone de scroll,
 * classes pilotées par `useNav`) + la barre de contrôles (paramètres/logout)
 * + l'en-tête mobile (hamburger). Le contexte `useNav` est fourni plus haut par
 * le Root provider de Payload, donc pas besoin de le recréer.
 */
export default function NavShell({
  beforeNav,
  beforeNavLinks,
  afterNavLinks,
  afterNav,
  logout,
  settingsMenu = [],
  children,
}: Props) {
  const { hydrated, navOpen, navRef, shouldAnimate } = useNav();
  const { config } = useConfig();
  const adminRoute = config.routes.admin;

  const className = [
    baseClass,
    navOpen && `${baseClass}--nav-open`,
    shouldAnimate && `${baseClass}--nav-animate`,
    hydrated && `${baseClass}--nav-hydrated`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className={className} inert={!navOpen ? true : undefined}>
      <div className={`${baseClass}__scroll`} ref={navRef}>
        {/* Logo TIM support cliquable → tableau de bord de l'admin.
            Même asset que le front (public/logo-support.webp). Le bouton de repli
            reste le natif de Payload (couche app-header, hors de cette barre). */}
        <NextLink aria-label="Tableau de bord" className={`${baseClass}__brand`} href={adminRoute}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="TIM Support" className={`${baseClass}__brand-logo`} src="/logo-support.webp" />
        </NextLink>
        {beforeNav}
        <nav className={`${baseClass}__wrap`}>
          {beforeNavLinks}
          {children}
          {afterNavLinks}
          <div className={`${baseClass}__controls`}>
            <SettingsMenuButton settingsMenu={settingsMenu} />
            {logout}
          </div>
        </nav>
        {afterNav}
        <div className={`${baseClass}__header`}>
          <div className={`${baseClass}__header-content`}>
            <NavHamburger />
          </div>
        </div>
      </div>
    </aside>
  );
}
