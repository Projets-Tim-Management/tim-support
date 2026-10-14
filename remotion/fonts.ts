import { loadFont as archivo } from "@remotion/google-fonts/Archivo";
import { loadFont as archivoBlack } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as bebasNeue } from "@remotion/google-fonts/BebasNeue";
import { loadFont as dmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as lato } from "@remotion/google-fonts/Lato";
import { loadFont as manrope } from "@remotion/google-fonts/Manrope";
import { loadFont as montserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as poppins } from "@remotion/google-fonts/Poppins";
import { loadFont as spaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";

/**
 * Les polices des pubs (celles proposées dans le Kit de marque et les styles),
 * chargées depuis Google Fonts au moment du rendu. Seules les graisses
 * employées sont demandées : le rendu attend qu'elles soient prêtes.
 */
const LOADERS: Record<string, () => void> = {
  Montserrat: () => montserrat("normal", { weights: ["500", "700", "800"], subsets: ["latin", "latin-ext"] }),
  Inter: () => inter("normal", { weights: ["500", "700", "800"], subsets: ["latin", "latin-ext"] }),
  Poppins: () => poppins("normal", { weights: ["500", "700", "800"], subsets: ["latin", "latin-ext"] }),
  Archivo: () => archivo("normal", { weights: ["500", "700", "800"], subsets: ["latin", "latin-ext"] }),
  "Archivo Black": () => archivoBlack("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }),
  "Bebas Neue": () => bebasNeue("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }),
  "Space Grotesk": () => spaceGrotesk("normal", { weights: ["500", "700"], subsets: ["latin", "latin-ext"] }),
  "DM Sans": () => dmSans("normal", { weights: ["500", "700", "800"], subsets: ["latin", "latin-ext"] }),
  Manrope: () => manrope("normal", { weights: ["500", "700", "800"], subsets: ["latin", "latin-ext"] }),
  Lato: () => lato("normal", { weights: ["400", "700", "900"], subsets: ["latin", "latin-ext"] }),
};

const loaded = new Set<string>();

/** Charge une famille (une seule fois) ; une famille inconnue retombe sur Lato. */
export function useFamily(family: string): string {
  const name = LOADERS[family] ? family : "Lato";
  if (!loaded.has(name)) {
    loaded.add(name);
    LOADERS[name]();
  }
  return `'${name}', 'Helvetica Neue', Arial, sans-serif`;
}
