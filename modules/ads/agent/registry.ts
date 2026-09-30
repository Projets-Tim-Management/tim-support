import type { AgentTool } from "@/modules/ads/agent/tools";
import { TREE_TOOLS } from "@/modules/ads/agent/tools";
import { ATELIER_TOOLS } from "@/modules/ads/agent/tools-atelier";

/** Tous les outils de l'agent, par nom. Ce qu'un agent peut en utiliser, c'est son rôle qui le dit (roles.ts). */
export const TOOLS: Record<string, AgentTool> = Object.fromEntries([...TREE_TOOLS, ...ATELIER_TOOLS].map((t) => [t.definition.name, t]));
