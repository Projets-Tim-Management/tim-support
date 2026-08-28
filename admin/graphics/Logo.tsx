import React from "react";

/**
 * Logo affiché sur l'écran de connexion et les pages hors session.
 *
 * C'est l'image de marque réelle, la même que dans le menu latéral et sur le
 * site (`public/logo-support.webp`). Elle remplace un « TIM · Support »
 * composé en CSS autour d'un monogramme : deux représentations d'une même
 * marque finissent toujours par diverger, et c'est la fausse qu'on montrait à
 * l'écran d'accueil.
 */
export const Logo: React.FC = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    alt="TIM support"
    src="/logo-support.webp"
    // Largeur bornée plutôt que fixée : l'écran de connexion est étroit sur
    // mobile, et un logo qui déborde y est pire que pas de logo.
    style={{ width: "100%", maxWidth: 260, height: "auto", display: "block" }}
  />
);

export default Logo;
