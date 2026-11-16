import type { Payload } from "payload";

import type { ChatMessage } from "@/modules/ai-team/admin/ChatBox";

/** La conversation d'un chef : ses 40 derniers messages, dans l'ordre (sa fiche, et « Mes tâches »). */
export const loadChat = (payload: Payload, memberId: number | string): Promise<ChatMessage[]> =>
  payload
    .find({ collection: "ai-team-messages", where: { member: { equals: memberId } }, sort: "-createdAt", limit: 40, depth: 0, overrideAccess: true, select: { from: true, text: true, createdAt: true, noted: true } as never })
    .then((r) =>
      (r.docs as unknown as { id: number; from: "direction" | "agent"; text: string; createdAt: string; noted?: unknown }[])
        .reverse()
        .map((d) => ({ id: String(d.id), from: d.from, text: d.text, at: d.createdAt, ...(Array.isArray(d.noted) ? { noted: d.noted.map(String) } : {}) })),
    );
