import type { GlobalConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Ce qu'on GARDE sur les connexions du support : le dernier test, et des
 * notes. Pas de clé — elles vivent sur Vercel (voir core/lib/support-connections).
 * Une ligne par connexion, identifiée par sa clé de code.
 */
export const SupportConnectionsGlobal: GlobalConfig = {
  slug: "support-connections",
  label: "Connexions du support",
  access: { read: isAdmin, update: isAdmin },
  admin: { hidden: true }, // l'écran est la vue /admin/connexions-support
  fields: [
    {
      name: "entries",
      type: "array",
      fields: [
        { name: "key", type: "text", required: true },
        /** Interlocuteur, date d'expiration de la clé, procédure de renouvellement. */
        { name: "notes", type: "textarea" },
        { name: "lastTestAt", type: "date" },
        { name: "lastTestOk", type: "checkbox" },
        { name: "lastTestMessage", type: "text" },
      ],
    },
  ],
};
