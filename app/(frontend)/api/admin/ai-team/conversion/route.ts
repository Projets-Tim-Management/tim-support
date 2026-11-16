import { runConversion } from "@/modules/ai-team/lib/conversion";
import { runNowRoute } from "@/modules/ai-team/lib/run-now-route";

/** Lancer la revue de la conversion de Lou tout de suite. POST — réservé à la direction. */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = runNowRoute((payload) => runConversion(payload, { force: true }), "La revue");
