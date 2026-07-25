import React from "react";

import { Monogram } from "./Monogram";

/**
 * Icône de marque (version compacte du logo) : monogramme carré rouge.
 * Utilisée quand la place est réduite (favicon admin, en-tête replié).
 */
export const Icon: React.FC = () => <Monogram size={26} radius={7} />;

export default Icon;
