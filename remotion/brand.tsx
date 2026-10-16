import type { CSSProperties } from "react";

/**
 * Règle de la marque (Charlie, 15/10/2026) : un LÉGER arrondi partout — jamais
 * d'angle vif, jamais de pilule ni de rond. Des coins « carrés » ne font que
 * resserrer cet arrondi (60 % par défaut ; `square` garde la valeur propre
 * d'un appelant).
 */
export function cornerRadius(corners: string, round: number, square = round * 0.6): number {
  return corners === "carres" ? square : round;
}

/** Les quatre pastilles du logo TIM, en grille de deux : motif d'un plan ou symbole de repli. */
export function LogoDots({ size, gap, color, style }: { size: number; gap: number; color: string; style?: CSSProperties }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(2, ${size}px)`, gap, ...style }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ width: size, height: size, borderRadius: i === 1 ? "50% 50% 50% 0" : "50%", background: color }} />
      ))}
    </div>
  );
}
