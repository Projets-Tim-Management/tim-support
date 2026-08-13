"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * Connexion des agendas d'un partenaire (onglet « Agenda & rendez-vous »).
 *
 * Tout passe par des routes serveur : aucun jeton ne descend jusqu'au navigateur.
 * L'écran ne manipule que ce qui se règle — quels agendas comptent pour les
 * conflits, lequel reçoit les rendez-vous.
 */

type Calendar = { calendarId?: string; name?: string; busy?: boolean; target?: boolean };
type Connection = {
  id: number | string;
  provider?: string;
  accountEmail?: string;
  status?: string;
  calendars: Calendar[];
};

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google Calendar",
  microsoft: "Microsoft 365",
};

export function CalendarConnect() {
  const { id } = useDocumentInfo();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [providers, setProviders] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/calendar/connections?partnerId=${id}`, {
        credentials: "include",
      });
      const data = res.ok ? await res.json() : null;
      setConnections(data?.connections ?? []);
      setProviders(data?.providers ?? {});
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Retour du consentement : la route de callback redirige ici avec un message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("calendar");
    if (!status) return;
    setNotice(
      status === "connected"
        ? "Agenda connecté."
        : status === "refused"
          ? "Connexion refusée chez le fournisseur."
          : `La connexion a échoué${params.get("detail") ? ` : ${params.get("detail")}` : "."}`,
    );
    // Nettoie l'URL pour que le message ne réapparaisse pas à chaque rechargement.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const patch = async (connection: Connection, calendars: Calendar[]) => {
    setConnections((cs) => cs.map((c) => (c.id === connection.id ? { ...c, calendars } : c)));
    await fetch("/api/calendar/connections", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: connection.id, calendars }),
    });
  };

  const toggleBusy = (connection: Connection, calendarId?: string) =>
    patch(
      connection,
      connection.calendars.map((c) =>
        c.calendarId === calendarId ? { ...c, busy: !c.busy } : c,
      ),
    );

  /** Une seule cible à la fois : deux agendas receveurs n'auraient pas de sens. */
  const setTarget = (connection: Connection, calendarId?: string) => {
    setConnections((cs) =>
      cs.map((c) => ({
        ...c,
        calendars: c.calendars.map((cal) => ({
          ...cal,
          target: c.id === connection.id && cal.calendarId === calendarId,
        })),
      })),
    );
    void Promise.all(
      connections.map((c) =>
        fetch("/api/calendar/connections", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: c.id,
            calendars: c.calendars.map((cal) => ({
              calendarId: cal.calendarId,
              busy: cal.busy,
              target: c.id === connection.id && cal.calendarId === calendarId,
            })),
          }),
        }),
      ),
    );
  };

  const disconnect = async (connection: Connection) => {
    await fetch(`/api/calendar/connections?id=${connection.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  if (!id) {
    return <p className="jr-prev">Enregistrez la fiche pour pouvoir connecter un agenda.</p>;
  }
  if (loading) return <p className="jr-prev">Chargement des agendas…</p>;

  const none = Object.values(providers).every((v) => !v);

  return (
    <div className="jr-cnx">
      {notice && <p className="jr-cnx__notice">{notice}</p>}

      {connections.length === 0 && (
        <p className="jr-cnx__empty">
          Aucun agenda connecté. Les créneaux proposés au client viennent uniquement de vos règles
          ci-dessus — vos rendez-vous existants ne sont pas pris en compte.
        </p>
      )}

      {connections.map((c) => (
        <section key={String(c.id)} className="jr-cnx__account">
          <header className="jr-cnx__head">
            <span className="jr-cnx__provider">{PROVIDER_LABEL[c.provider ?? ""] ?? c.provider}</span>
            <span className="jr-cnx__mail">{c.accountEmail ?? "compte connecté"}</span>
            {c.status === "expired" && <span className="jr-cnx__warn">à reconnecter</span>}
            <button type="button" className="jr-cnx__unlink" onClick={() => void disconnect(c)}>
              Déconnecter
            </button>
          </header>

          <table className="jr-cnx__table">
            <thead>
              <tr>
                <th>Agenda</th>
                <th>Occupe mes créneaux</th>
                <th>Reçoit les RDV</th>
              </tr>
            </thead>
            <tbody>
              {c.calendars.map((cal) => (
                <tr key={cal.calendarId}>
                  <td>{cal.name ?? cal.calendarId}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={cal.busy !== false}
                      onChange={() => void toggleBusy(c, cal.calendarId)}
                    />
                  </td>
                  <td>
                    <input
                      type="radio"
                      name="calendar-target"
                      checked={Boolean(cal.target)}
                      onChange={() => setTarget(c, cal.calendarId)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <div className="jr-cnx__actions">
        {/* Le libellé dit s'il s'agit d'une première connexion ou d'un compte
            supplémentaire : « Connecter » sous une liste déjà remplie laissait
            croire que rien n'était branché. */}
        {providers.google && (
          <a className="jr-btn" href={`/api/calendar/connect?provider=google&partnerId=${id}`}>
            {connections.some((c) => c.provider === "google")
              ? "Connecter un autre compte Google"
              : "Connecter Google Calendar"}
          </a>
        )}
        {providers.microsoft && (
          <a className="jr-btn" href={`/api/calendar/connect?provider=microsoft&partnerId=${id}`}>
            {connections.some((c) => c.provider === "microsoft")
              ? "Connecter un autre compte Microsoft"
              : "Connecter Microsoft 365"}
          </a>
        )}
        {none && (
          <p className="jr-cnx__empty">
            Aucun fournisseur n&apos;est configuré sur ce serveur. Les identifiants OAuth
            (Google&nbsp;/&nbsp;Microsoft) doivent être renseignés dans l&apos;environnement.
          </p>
        )}
      </div>
    </div>
  );
}
