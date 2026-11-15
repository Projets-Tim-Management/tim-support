import { runPipeline } from "@/modules/ai-team/lib/pipeline-agent";
import { runNowRoute } from "@/modules/ai-team/lib/run-now-route";

/** Lancer le point du pipeline de Nathan tout de suite. POST — réservé à la direction. */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = runNowRoute((payload) => runPipeline(payload, { force: true }), "Le point");
