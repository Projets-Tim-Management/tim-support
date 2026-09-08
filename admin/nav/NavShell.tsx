"use client";

import { GearIcon, Hamburger, Popup, useConfig, useNav, useTranslation } from "@payloadcms/ui";
import NextLink from "next/link";
import React, { Fragment, useEffect, useRef } from "react";

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
  /** Logos réglés en back-office ; à défaut, ceux livrés avec le code. */
  logoUrl?: string;
  iconUrl?: string;
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
  logoUrl,
  iconUrl,
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

  /**
   * Le survol est signalé par JAVASCRIPT, et pas par `:hover` en CSS.
   *
   * La largeur du menu n'est pas celle de `.nav` : `template-default` est une
   * GRILLE dont la piste vaut `--nav-width`, déclarée sur `:root`. Or un
   * sélecteur `.nav:hover` ne peut pas modifier une variable portée par un
   * ANCÊTRE — c'est la limite du CSS qui a fait échouer les tentatives
   * précédentes, y compris le panneau flottant.
   *
   * On remonte donc l'information là où la variable vit : un attribut sur
   * `<html>`, posé à l'entrée de la souris, retiré à la sortie.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arm = (fn: () => void, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, delay);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /**
   * Deux délais, et ils ne servent pas la même chose.
   *
   * À L'OUVERTURE (140 ms) : c'est une intention. Le menu longe tout le bord
   * gauche de l'écran ; sans ce délai, il se déploie chaque fois que la souris
   * le frôle en allant ailleurs, et la page tressaute pour rien.
   *
   * À LA FERMETURE (120 ms) : c'est une tolérance. Sortir puis rentrer d'un
   * pixel — ce qui arrive en visant un lien — ne doit pas produire un
   * clignotement.
   */
  const onEnter = () => {
    if (!window.matchMedia("(min-width: 769px)").matches) return;
    arm(() => {
      document.documentElement.dataset.navHover = "1";
    }, 140);
  };
  const onLeave = () => {
    arm(() => {
      delete document.documentElement.dataset.navHover;
    }, 120);
  };

  return (
    <aside
      className={className}
      inert={!navOpen ? true : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className={`${baseClass}__scroll`} ref={navRef}>
        {/* Logo TIM support cliquable → tableau de bord de l'admin.
            Même asset que le front (public/logo-support.webp). Le bouton de repli
            reste le natif de Payload (couche app-header, hors de cette barre). */}
        <NextLink aria-label="Tableau de bord" className={`${baseClass}__brand`} href={adminRoute}>
          {/* Les DEUX logos sont rendus, le CSS montre celui qui convient à
              l'état du menu. Choisir en JS demanderait de connaître l'état du
              menu ici, donc de rendre ce composant client — pour une image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="TIM Support"
            className={`${baseClass}__brand-logo`}
            src={logoUrl || "/logo-support.webp"}
          />
          {iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" aria-hidden className={`${baseClass}__brand-icon`} src={iconUrl} />
          ) : null}
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
