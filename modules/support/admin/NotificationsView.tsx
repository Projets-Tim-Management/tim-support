import type { AdminViewServerProps } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import Link from "next/link";

/**
 * Vue admin dédiée « Notifications » (enregistrée sous /admin/notifications).
 * Liste, à la façon d'une boîte de réception, ce qui attend une action du
 * support, en deux sections distinctes :
 *   - 💬 Réponses client en attente (unreadClientReply = true) ;
 *   - 🎫 Nouveaux tickets à prendre en charge (needsAttention = true sans réponse client).
 * Chaque ligne ouvre le ticket concerné. Server component : lecture directe via
 * la Local API (req.payload), aucune requête HTTP côté client.
 */

const TICKET_URL = (id: number | string) => `/admin/collections/tickets/${id}`;

type TicketRow = {
  id: number | string;
  number?: number;
  subject?: string;
  name?: string;
  email?: string;
  priority?: string;
  service?: string;
  updatedAt?: string;
  createdAt?: string;
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Urgente",
  high: "Haute",
  normal: "Normale",
  low: "Basse",
};

function formatDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TicketList({ docs, kind }: { docs: TicketRow[]; kind: "reply" | "new" }) {
  if (docs.length === 0) {
    return <p className="notif-page__empty">Rien à signaler ici 🎉</p>;
  }
  return (
    <ul className="notif-page__list">
      {docs.map((t) => (
        <li key={String(t.id)} className={`notif-item notif-item--${kind}`}>
          <Link className="notif-item__link" href={TICKET_URL(t.id)}>
            <span className="notif-item__icon" aria-hidden>
              {kind === "reply" ? "💬" : "🎫"}
            </span>
            <span className="notif-item__main">
              <span className="notif-item__title">
                {t.number ? `#${t.number} · ` : ""}
                {t.subject || "(sans sujet)"}
              </span>
              <span className="notif-item__meta">
                {t.name || t.email || "—"}
                {t.service ? ` · ${t.service}` : ""}
                {t.priority && t.priority !== "normal"
                  ? ` · ${PRIORITY_LABEL[t.priority] ?? t.priority}`
                  : ""}
              </span>
            </span>
            <span className="notif-item__when">{formatDate(t.updatedAt || t.createdAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function NotificationsView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, permissions, visibleEntities, locale } = initPageResult;
  const { payload, user, i18n } = req;

  const [replies, news] = await Promise.all([
    payload.find({
      collection: "tickets",
      where: { unreadClientReply: { equals: true } },
      sort: "-updatedAt",
      limit: 100,
      depth: 0,
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: "tickets",
      where: {
        and: [
          { needsAttention: { equals: true } },
          { unreadClientReply: { not_equals: true } },
          { status: { not_equals: "resolved" } },
        ],
      },
      sort: "-createdAt",
      limit: 100,
      depth: 0,
      overrideAccess: false,
      user,
    }),
  ]);

  const replyDocs = replies.docs as TicketRow[];
  const newDocs = news.docs as TicketRow[];

  return (
    <DefaultTemplate
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      searchParams={searchParams}
      user={user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter>
        <div className="notif-page">
          <header className="notif-page__header">
            <h1 className="notif-page__heading">Notifications</h1>
            <p className="notif-page__subtitle">Tickets qui attendent une action de votre part.</p>
          </header>

          <section className="notif-page__section">
            <h2 className="notif-page__section-title">
              💬 Réponses client en attente
              <span className="notif-page__count">{replies.totalDocs}</span>
            </h2>
            <TicketList docs={replyDocs} kind="reply" />
          </section>

          <section className="notif-page__section">
            <h2 className="notif-page__section-title">
              🎫 Nouveaux tickets à traiter
              <span className="notif-page__count">{news.totalDocs}</span>
            </h2>
            <TicketList docs={newDocs} kind="new" />
          </section>
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
