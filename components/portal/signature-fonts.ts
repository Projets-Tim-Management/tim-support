import { Allura, Great_Vibes, Kalam } from "next/font/google";

import type { SignatureStyle } from "@/modules/partner/lib/signature-styles";

/**
 * Les polices de l'aperçu de signature — les MÊMES que celles embarquées dans
 * le PDF (assets/fonts/signature) : le signataire voit ce qui sera imprimé.
 */
const greatVibes = Great_Vibes({ weight: "400", subsets: ["latin"], display: "swap" });
const allura = Allura({ weight: "400", subsets: ["latin"], display: "swap" });
const kalam = Kalam({ weight: "400", subsets: ["latin"], display: "swap" });

export const SIGNATURE_FONT_CLASS: Record<SignatureStyle, string> = {
  elegante: greatVibes.className,
  fluide: allura.className,
  manuscrite: kalam.className,
};
