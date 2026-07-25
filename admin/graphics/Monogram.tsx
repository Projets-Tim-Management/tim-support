import React from "react";

import { BRAND_RED, FONT_STACK } from "./brand";

/** Monogramme carré rouge « T » — brique commune du logo et de l'icône. */
export const Monogram: React.FC<{ size?: number; radius?: number }> = ({
  size = 28,
  radius = 8,
}) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: radius,
      background: BRAND_RED,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontWeight: 800,
      fontSize: Math.round(size * 0.48),
      fontFamily: FONT_STACK,
      letterSpacing: "-0.02em",
    }}
  >
    T
  </span>
);

export default Monogram;
