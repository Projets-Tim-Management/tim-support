/**
 * Statistiques d'une campagne d'e-mail de masse, à partir des événements Brevo
 * de son tag. Pur : aucun appel réseau, testable tel quel.
 *
 * On compte des PERSONNES, pas des événements : quelqu'un qui ouvre trois fois
 * compte une fois dans le taux d'ouverture. Les taux se rapportent aux e-mails
 * DÉLIVRÉS — un rejet n'avait aucune chance d'être ouvert.
 *
 * ⚠️ Ouvertures « par proxy » (Apple Mail et sa protection de la vie privée) :
 * l'image de suivi est chargée par Apple à la réception, que la personne lise
 * ou non. Elles sont comptées À PART, jamais dans le taux d'ouverture, qui
 * serait sinon gonflé sans rien dire de la lecture réelle.
 */

export type StatEvent = { event: string; email: string; date: string; link?: string };

export type RecipientStat = {
  email: string;
  delivered: boolean;
  opened: boolean;
  proxyOpened: boolean;
  clicked: boolean;
  bounced: boolean;
  unsubscribed: boolean;
  lastActivity: string | null;
};

export type CampaignStats = {
  sent: number;
  delivered: number;
  opened: number;
  proxyOpened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  spam: number;
  /** En pourcentage des délivrés, arrondi ; null tant que rien n'est délivré. */
  openRate: number | null;
  clickRate: number | null;
  links: { url: string; clicks: number; people: number }[];
  recipients: RecipientStat[];
};

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 1000) / 10 : null);

export function computeCampaignStats(events: StatEvent[], sentTo: string[]): CampaignStats {
  const byEmail = new Map<string, RecipientStat>();
  const ensure = (email: string) => {
    const key = email.trim().toLowerCase();
    let r = byEmail.get(key);
    if (!r) {
      r = {
        email: key,
        delivered: false,
        opened: false,
        proxyOpened: false,
        clicked: false,
        bounced: false,
        unsubscribed: false,
        lastActivity: null,
      };
      byEmail.set(key, r);
    }
    return r;
  };
  for (const email of sentTo) ensure(email);

  const links = new Map<string, { clicks: number; people: Set<string> }>();
  let spam = 0;

  for (const e of events) {
    if (!e.email) continue;
    const r = ensure(e.email);
    if (!r.lastActivity || e.date > r.lastActivity) r.lastActivity = e.date;
    switch (e.event) {
      case "delivered":
        r.delivered = true;
        break;
      case "opened":
      case "uniqueOpened":
        r.opened = true;
        break;
      case "proxyOpen":
      case "uniqueProxyOpen":
        r.proxyOpened = true;
        break;
      case "clicks":
      case "click": {
        r.clicked = true;
        // Un clic prouve l'ouverture, même si l'image de suivi a été bloquée.
        r.opened = true;
        const url = e.link ?? "(lien inconnu)";
        const l = links.get(url) ?? { clicks: 0, people: new Set<string>() };
        l.clicks += 1;
        l.people.add(r.email);
        links.set(url, l);
        break;
      }
      case "hardBounces":
      case "softBounces":
      case "blocked":
      case "invalid":
        r.bounced = true;
        break;
      case "unsubscribed":
        r.unsubscribed = true;
        break;
      case "spam":
        spam += 1;
        break;
    }
  }

  const recipients = [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
  // Un e-mail ouvert ou cliqué a forcément été délivré, même si l'événement
  // « delivered » manque (fenêtre de 90 jours, événement perdu).
  for (const r of recipients) if (r.opened || r.clicked) r.delivered = true;

  const delivered = recipients.filter((r) => r.delivered).length;
  const opened = recipients.filter((r) => r.opened).length;
  const clicked = recipients.filter((r) => r.clicked).length;

  return {
    sent: sentTo.length,
    delivered,
    opened,
    proxyOpened: recipients.filter((r) => r.proxyOpened && !r.opened).length,
    clicked,
    bounced: recipients.filter((r) => r.bounced).length,
    unsubscribed: recipients.filter((r) => r.unsubscribed).length,
    spam,
    openRate: pct(opened, delivered),
    clickRate: pct(clicked, delivered),
    links: [...links.entries()]
      .map(([url, l]) => ({ url, clicks: l.clicks, people: l.people.size }))
      .sort((a, b) => b.people - a.people),
    recipients,
  };
}
