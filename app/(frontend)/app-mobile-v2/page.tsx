import { redirect } from "next/navigation";

import { appV2Path } from "@/modules/marketing/lib/app-v2";

/**
 * L'ancienne adresse, sans interlocuteur : elle mène à la page de
 * l'interlocuteur par défaut (/app-mobile-v2/cpiancatelli).
 */
export default function AppMobileV2Redirect() {
  redirect(appV2Path());
}
