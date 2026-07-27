"use client";

/**
 * Cellule « Alertes » du tableau des tickets. Rend, à partir de la ligne, deux
 * puces distinctes :
 *   - 💬 Réponse client   → unreadClientReply = true (le client a répondu)
 *   - 🎫 Nouveau          → needsAttention = true sans réponse client (1ère prise en charge)
 * Rien si le ticket est à jour.
 */
type Props = {
  rowData?: { needsAttention?: boolean; unreadClientReply?: boolean };
};

export function TicketAlertCell({ rowData }: Props) {
  const unread = Boolean(rowData?.unreadClientReply);
  const isNew = Boolean(rowData?.needsAttention) && !unread;

  if (!unread && !isNew) return <span style={{ color: "var(--tim-muted)" }}>—</span>;

  return (
    <span className="ticket-alerts">
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
