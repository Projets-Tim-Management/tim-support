import type { AdminViewServerProps } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";

import { isDirection } from "@/core/access";
import type { ChatMessage } from "@/modules/ai-team/admin/ChatBox";
import { MyTasksBoard } from "@/modules/ai-team/admin/MyTasksBoard";
import { loadChat } from "@/modules/ai-team/lib/chat-history";
import { loadMyTasks } from "@/modules/ai-team/lib/my-tasks";
import { OFFICES } from "@/modules/ai-team/lib/veille-domains";

/**
 * Écran « Mes tâches » (/admin/mes-taches, 16/11/2026) — réservé à la direction : tout ce qu'elle a à faire, au
 * même endroit, une couleur par bureau ; le détail, les étapes à cocher, la réponse aux questions et la conversation
 * avec le chef qui l'a confiée. Voir lib/my-tasks.
 */
export default async function MyTasksPage({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult;
  const allowed = isDirection(req.user);
  const sp = await searchParams;
  const focus = typeof sp?.tache === "string" ? sp.tache : null;
  const chiefKeys = Object.values(OFFICES).map((o) => o.chief);
  const [data, chiefs] = allowed
    ? await Promise.all([
        loadMyTasks(req.payload),
        req.payload
          .find({ collection: "ai-team-members", where: { key: { in: chiefKeys } }, pagination: false, depth: 0, overrideAccess: true, select: { key: true, name: true, portrait: true, active: true } as never })
          .then((r) => r.docs as unknown as { id: number; key: string; name: string; portrait: string; active?: boolean | null }[]),
      ])
    : [null, []];
  // Les chefs en service seulement : on ne parle pas à un chef en pause.
  const live = chiefs.filter((c) => c.active !== false);
  const people = Object.fromEntries(live.map((c) => [c.key, { name: c.name, portrait: c.portrait }]));
  const chats: Record<string, ChatMessage[]> = Object.fromEntries(await Promise.all(live.map(async (c) => [c.key, await loadChat(req.payload, c.id)] as const)));
  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <div className="ait">
          <header className="ait-head">
            <h1 className="ait-title">Mes tâches</h1>
            <p className="ait-sub">Tout ce que vous avez à faire, au même endroit. Ouvrez une tâche pour son détail, cochez au fur et à mesure.</p>
          </header>
          {data ? <MyTasksBoard tasks={data.tasks} today={data.today} people={people} chats={chats} focus={focus} /> : <p className="ait-empty">Cet écran est réservé à la direction.</p>}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
