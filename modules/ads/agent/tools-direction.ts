import type { AgentTool, ToolContext } from "@/modules/ads/agent/tools";
import { ROLE_SUBJECT } from "@/modules/ads/agent/roles";
import { ALLOWED_HOSTS, validateRequest } from "@/modules/ai-team/lib/requests";

/**
 * Parler à la direction (Équipe IA, décision du 12/11/2026) : un chef peut TOUT
 * lui demander, sous deux formes — « à faire » (un lien vers la bonne page, des
 * étapes numérotées) ou « question » (elle répond en texte) — et relit ensuite
 * ce qu'elle a fait ou répondu.
 *
 * Réservé aux rôles racines (orchestratrice, analyste) : un sous-agent passe par
 * son chef. La demande est déposée au nom du chef qui incarne le rôle.
 */

const who = (ctx: ToolContext) => ROLE_SUBJECT[ctx.agent.role];

const demander: AgentTool = {
  definition: {
    name: "demander_a_la_direction",
    description: [
      "Demande quelque chose à la direction, qui le verra dans « Vos demandes » (Équipe IA). Tout ce que tu ne peux pas faire ou décider seul : un accès, un réglage, un chiffre, un arbitrage, un contenu.",
      "Deux formes : « a-faire » — un lien vers la page où agir et des étapes numérotées, courtes et concrètes, dans l'ordre (la direction clique ensuite « C'est fait ») ; « question » — une question claire, la direction répond en texte.",
      `Lien : une page du back-office (« /admin/… ») ou une console connue (${ALLOWED_HOSTS.join(", ")}), sinon la demande est refusée. Une demande identique encore ouverte n'est pas redéposée.`,
      "Ne demande pas ce que « À valider » couvre déjà (créas, actions proposées) : la direction le voit déjà.",
    ].join(" "),
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["a-faire", "question"] },
        titre: { type: "string", description: "Ce qui est demandé, en une phrase courte." },
        pourquoi: { type: "string", description: "Ce qui motive la demande, chiffres à l'appui si possible." },
        lien: { type: "string", description: "« a-faire » : la page où agir." },
        etapes: { type: "array", items: { type: "string" }, description: "« a-faire » : les étapes, dans l'ordre (8 au plus)." },
        question: { type: "string", description: "« question » : la question posée." },
      },
      required: ["type", "titre", "pourquoi"],
    },
  },
  async run(ctx, input) {
    const ask = ctx.deps.team?.ask;
    if (!ask) return { kind: "ok", isError: true, output: { refus: "Les demandes à la direction ne sont pas disponibles ici." }, line: `${who(ctx)} ne peut pas joindre la direction.` };
    const v = validateRequest(input);
    if (!v.ok) return { kind: "ok", isError: true, output: { refus: v.reason }, line: `${who(ctx)} : demande à la direction à reprendre (${v.reason})` };
    const id = await ask(ctx.agent.role, v.value, { run: ctx.run.id, campaign: ctx.run.campaign });
    return { kind: "ok", output: { demande: id }, line: `${who(ctx)} demande à la direction : « ${v.value.title} ».` };
  },
};

const lireReponses: AgentTool = {
  definition: {
    name: "lire_reponses_direction",
    description: "Ce que la direction a fait ou répondu à tes demandes ces 30 derniers jours. Lis-le en début de passage : une réponse peut changer ce que tu proposes.",
    input_schema: { type: "object", properties: {} },
  },
  async run(ctx) {
    const answers = (await ctx.deps.team?.answers?.(ctx.agent.role)) ?? [];
    return { kind: "ok", output: { reponses: answers }, line: answers.length ? `${who(ctx)} relit les réponses de la direction (${answers.length}).` : `${who(ctx)} relit les réponses de la direction : rien de neuf.` };
  },
};

export const DIRECTION_TOOLS: AgentTool[] = [demander, lireReponses];
