"use client";

import { Fragment, useEffect, useState } from "react";

import type { CampaignStats } from "@/modules/marketing/lib/mass-email-stats";

/**
 * Onglet « Campagnes envoyées » : une ligne par envoi, ses chiffres en face.
 *
 * Les chiffres viennent de Brevo, campagne par campagne (son tag), et arrivent
 * l'un après l'autre : la liste s'affiche tout de suite, chaque ligne se
 * remplit quand Brevo a répondu. Une ligne s'ouvre sur le détail — les clics
 * par lien, et qui a reçu, ouvert, cliqué.
 *
 * Les taux se rapportent aux e-mails DÉLIVRÉS. Les ouvertures « automatiques »
 * d'Apple Mail sont signalées à part : elles ne disent pas qu'on a lu.
 */

type Campaign = {
  id: number | string;
  subject?: string;
  sentAt?: string;
  fromEmail?: string;
  withSignature?: boolean;
  templateLabel?: string;
  sentCount?: number;
  suppressedCount?: number;
  failedCount?: number;
};

type Loaded = { stats?: CampaignStats; expired?: boolean; error?: string };

const API = "/api/admin/emails-de-masse/campagnes";

const frDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function Rate({ rate, n }: { rate: number | null | undefined; n: number | undefined }) {
  if (rate == null) return <span className="campaigns__muted">—</span>;
  return (
    <span className="campaigns__rate">
      <strong>{rate.toLocaleString("fr-FR")} %</strong>
      <span>{n}</span>
      <span className="campaigns__bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, rate)}%` }} />
      </span>
    </span>
  );
}

function Detail({ loaded }: { loaded: Loaded | undefined }) {
  if (!loaded) return <p className="campaigns__muted">Chargement des chiffres…</p>;
  if (loaded.error) return <p className="campaigns__error">{loaded.error}</p>;
  const s = loaded.stats;
  if (!s) return null;
  return (
    <div className="campaigns__detail">
      {loaded.expired && (
        <p className="campaigns__muted">Envoi de plus de 90 jours : Brevo n&apos;en garde plus les événements.</p>
      )}
      {s.proxyOpened > 0 && (
        <p className="campaigns__muted">
          + {s.proxyOpened} ouverture{s.proxyOpened > 1 ? "s" : ""} automatique{s.proxyOpened > 1 ? "s" : ""} (Apple Mail),
          non comptée{s.proxyOpened > 1 ? "s" : ""} dans le taux : l&apos;image est chargée sans que la personne lise.
        </p>
      )}

      <div className="campaigns__detail-grid">
        <section>
          <h3>Clics par lien</h3>
          {s.links.length === 0 ? (
            <p className="campaigns__muted">Aucun clic pour l&apos;instant.</p>
          ) : (
            <ul className="campaigns__links">
              {s.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}>
                    {l.url.replace(/^https?:\/\//, "")}
                  </a>
                  <span>
                    {l.people} personne{l.people > 1 ? "s" : ""} · {l.clicks} clic{l.clicks > 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Destinataires</h3>
          <ul className="campaigns__people">
            {s.recipients.map((r) => (
              <li key={r.email}>
                <span className="campaigns__email">{r.email}</span>
                <span className="campaigns__badges">
                  {r.bounced ? (
                    <span className="is-bad">Rejeté</span>
                  ) : (
                    <>
                      <span className={r.delivered ? "is-on" : ""}>Délivré</span>
                      <span className={r.opened ? "is-on" : ""}>Ouvert</span>
                      <span className={r.clicked ? "is-on is-strong" : ""}>Cliqué</span>
                    </>
                  )}
                  {r.unsubscribed && <span className="is-bad">Désinscrit</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default function CampaignsTable({ refreshKey }: { refreshKey: number }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(API, { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { campaigns?: Campaign[] };
      if (cancelled) return;
      const list = json.campaigns ?? [];
      setCampaigns(list);
      // Une à une, les plus récentes d'abord : Brevo n'aime pas les rafales.
      for (const c of list.slice(0, 30)) {
        if (cancelled) return;
        const r = await fetch(`${API}?id=${c.id}`, { credentials: "include", cache: "no-store" });
        const data = (await r.json().catch(() => ({}))) as Loaded;
        if (cancelled) return;
        setLoaded((prev) => ({ ...prev, [String(c.id)]: r.ok ? data : { error: data.error ?? "Chiffres indisponibles." } }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!campaigns) return <p className="campaigns__muted">Chargement des campagnes…</p>;
  if (campaigns.length === 0) {
    return (
      <div className="campaigns__empty">
        <strong>Aucune campagne envoyée pour l&apos;instant.</strong>
        <span>Chaque envoi apparaîtra ici avec ses ouvertures et ses clics.</span>
      </div>
    );
  }

  return (
    <div className="campaigns">
      <table className="campaigns__table">
        <thead>
          <tr>
            <th>Envoyée le</th>
            <th>Objet</th>
            <th className="is-num">Envoyés</th>
            <th className="is-num">Délivrés</th>
            <th>Ouvertures</th>
            <th>Clics</th>
            <th className="is-num">Rejets</th>
            <th className="is-num">Désinscrits</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const key = String(c.id);
            const l = loaded[key];
            const s = l?.stats;
            const isOpen = open === key;
            return (
              <Fragment key={key}>
                <tr
                  className={`campaigns__row ${isOpen ? "is-open" : ""}`}
                  onClick={() => setOpen(isOpen ? null : key)}
                  aria-expanded={isOpen}
                >
                  <td className="campaigns__date">{frDate(c.sentAt)}</td>
                  <td>
                    <span className="campaigns__subject">{c.subject}</span>
                    <span className="campaigns__meta">
                      {c.fromEmail}
                      {c.templateLabel ? ` · ${c.templateLabel}` : ""}
                      {c.withSignature === false ? " · sans signature" : ""}
                    </span>
                  </td>
                  <td className="is-num">{c.sentCount ?? 0}</td>
                  <td className="is-num">{s ? s.delivered : <span className="campaigns__muted">…</span>}</td>
                  <td>{s ? <Rate rate={s.openRate} n={s.opened} /> : <span className="campaigns__muted">…</span>}</td>
                  <td>{s ? <Rate rate={s.clickRate} n={s.clicked} /> : <span className="campaigns__muted">…</span>}</td>
                  <td className="is-num">{s ? s.bounced : "…"}</td>
                  <td className="is-num">{s ? s.unsubscribed : "…"}</td>
                </tr>
                {isOpen && (
                  <tr className="campaigns__expand">
                    <td colSpan={8}>
                      <Detail loaded={l} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="campaigns__muted campaigns__note">
        Taux calculés sur les e-mails délivrés. Une personne qui ouvre plusieurs fois compte une fois.
      </p>
    </div>
  );
}
