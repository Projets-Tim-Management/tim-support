"use client";

/**
 * Cellule « Alertes » du tableau des tickets. Rend, à partir de la ligne, trois
 * puces distinctes :
 *   - 🧪 Phase de test   → journeyRun renseigné (réponse à un e-mail de parcours)
 *   - 💬 Réponse client   → unreadClientReply = true (le client a répondu)
 *   - 🎫 Nouveau          → needsAttention = true sans réponse client (1ère prise en charge)
 *
 * La puce « Phase de test » est cumulable avec les deux autres, et affichée en
 * premier : elle dit QUI écrit (un prospect en essai, pas un client sous
 * contrat), ce qui change la façon de répondre avant même de savoir si le
 * message est neuf.
 */
type Props = {
  rowData?: {
    needsAttention?: boolean;
    unreadClientReply?: boolean;
    // Relationship : id brut en liste (depth 0), objet si la vue est peuplée.
    journeyRun?: number | string | { id?: number | string } | null;
  };
};

export function TicketAlertCell({ rowData }: Props) {
  const unread = Boolean(rowData?.unreadClientReply);
  const isNew = Boolean(rowData?.needsAttention) && !unread;
  const fromJourney = rowData?.journeyRun != null && rowData.journeyRun !== "";

  if (!unread && !isNew && !fromJourney) {
    return <span style={{ color: "var(--tim-muted)" }}>—</span>;
  }

  return (
    <span className="ticket-alerts">
      {fromJourney && (
        <span
          className="ticket-alert ticket-alert--journey"
          title="Réponse d'un prospect pendant sa phase de test"
        >
          🧪 Phase de test
        </span>
      )}
      {unread && (
        <span className="ticket-alert ticket-alert--reply" title="Le client a répondu, en attente de traitement">
          💬 Réponse client
        </span>
      )}
      {isNew && (
        <span className="ticket-alert ticket-alert--new" title="Nouveau ticket à prendre en charge">
          🎫 Nouveau
        </span>
      )}
    </span>
  );
}
