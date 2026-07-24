import React from "react";

/**
 * Icône de marque (version compacte du logo) : monogramme carré rouge.
 * Utilisée quand la place est réduite (favicon admin, en-tête replié).
 */
export const Icon: React.FC = () => (
  <span
    style={{
      width: 26,
      height: 26,
      borderRadius: 7,
      background: "#fe5464",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontWeight: 800,
      fontSize: 14,
      fontFamily: "Inter, system-ui, sans-serif",
      letterSpacing: "-0.02em",
    }}
  >
    T
  </span>
);

export default Icon;
