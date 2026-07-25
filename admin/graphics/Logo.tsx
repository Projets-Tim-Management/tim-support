import React from "react";

import { BRAND_RED, FONT_STACK } from "./brand";
import { Monogram } from "./Monogram";

/**
 * Logo de marque affiché dans l'en-tête du back-office et sur l'écran de
 * connexion. Couleurs alignées sur le front (rouge TIM).
 */
export const Logo: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <Monogram size={34} radius={9} />
    <span
      style={{
        fontFamily: FONT_STACK,
        fontWeight: 700,
        fontSize: 20,
        letterSpacing: "-0.01em",
      }}
    >
      TIM <span style={{ color: BRAND_RED }}>·</span> Support
    </span>
  </div>
);

export default Logo;
