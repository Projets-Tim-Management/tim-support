import React from "react";

/**
 * Icône de marque : le symbole seul, sans le mot-image.
 *
 * Le logo complet est trop large pour les emplacements carrés (favicon de
 * l'admin, en-tête replié). Plutôt que d'entretenir un second dessin qui
 * finirait par ne plus correspondre, on cadre le fichier existant sur sa partie
 * gauche — les quatre pastilles rouges.
 */
export const Icon: React.FC = () => (
  <span
    aria-label="TIM support"
    role="img"
    style={{
      display: "inline-block",
      width: 26,
      height: 26,
      backgroundImage: "url(/logo-support.webp)",
      backgroundRepeat: "no-repeat",
      // Le symbole occupe environ le tiers gauche de l'image : on agrandit
      // d'autant pour qu'il remplisse le carré.
      backgroundSize: "auto 100%",
      backgroundPosition: "left center",
    }}
  />
);

export default Icon;
