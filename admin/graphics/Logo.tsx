import React from "react";

/**
 * Logo de marque affiché dans l'en-tête du back-office et sur l'écran de
 * connexion. Couleurs alignées sur le front (rouge TIM #fe5464).
 */
export const Logo: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <span
      style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        background: "#fe5464",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 800,
        fontSize: 16,
        fontFamily: "Inter, system-ui, sans-serif",
        letterSpacing: "-0.02em",
      }}
    >
      T
    </span>
    <span
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 700,
        fontSize: 20,
        letterSpacing: "-0.01em",
      }}
    >
      TIM <span style={{ color: "#fe5464" }}>·</span> Support
    </span>
  </div>
);

export default Logo;
