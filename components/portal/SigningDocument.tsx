"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { IconFile } from "@/components/ui/icons";

/**
 * Un document de la signature, côté client : l'original à télécharger, et la
 * version signée à déposer.
 *
 * L'original peut manquer alors que l'étape est faite : le partenaire l'a
 * envoyé par e-mail. On le dit, et le dépôt de la version signée reste ouvert
 * — le client n'a pas à attendre que le fichier apparaisse ici pour répondre.
 *
 * Le fichier part vers /api/portal/signature/document, qui refait tous les
 * contrôles.
 */

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png"];

type Doc = { url: string | null; filename: string | null } | null;

export default function SigningDocument({
  kind,
  original,
  sentAt,
  signed,
  signedAt,
}: {
  kind: "devis" | "contrat";
  original: Doc;
  /** Date d'envoi (ISO), posée même quand l'original est parti par e-mail. */
  sentAt: string | null;
  signed: Doc;
  signedAt: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = kind === "devis" ? "devis" : "contrat";
  const fr = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;

  const send = async (file: File) => {
    setError(null);
    if (!TYPES.includes(file.type)) {
      setError("Déposez un PDF, ou une photo (JPEG, PNG).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Fichier trop lourd (4 Mo maximum). Envoyez-le-nous en réponse à notre e-mail.");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("kind", kind);
      body.append("file", file);
      const res = await fetch("/api/portal/signature/document", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(data?.message || "Le dépôt a échoué. Réessayez.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const hasOriginal = Boolean(original?.url);
  const sentByMail = !hasOriginal && Boolean(sentAt);

  return (
    <div className="flex flex-col gap-4">
      {/* L'original */}
      {hasOriginal ? (
        <a
          href={original!.url!}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-3 self-start rounded-lg border border-border bg-white px-4 py-3 transition hover:border-primary"
        >
          <IconFile className="h-5 w-5 shrink-0 text-muted group-hover:text-primary" />
          <span>
            <span className="block text-sm font-semibold text-foreground">Télécharger le {noun}</span>
            <span className="block text-xs text-muted">
              {original?.filename ?? "Document"}
              {sentAt ? ` · envoyé le ${fr(sentAt)}` : ""}
            </span>
          </span>
        </a>
      ) : sentByMail ? (
        <p className="text-sm text-muted">
          Votre {noun} vous a été envoyé par e-mail le {fr(sentAt)}.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Votre {noun} est en préparation. Il apparaîtra ici, et vous serez prévenu par votre
          interlocuteur.
        </p>
      )}

      {/* La version signée */}
      {signed?.url || signedAt ? (
        <p className="inline-flex items-center gap-2 self-start rounded-md bg-success-bg px-3 py-1.5 text-sm font-medium text-success-text">
          {kind === "devis" ? "Devis signé reçu" : "Contrat signé reçu"}
          {signedAt ? ` le ${fr(signedAt)}` : ""} — merci&nbsp;!
        </p>
      ) : null}

      {(hasOriginal || sentByMail || signed?.url) && (
        <div>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void send(f);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className={
              signed?.url || signedAt
                ? "text-sm font-semibold text-foreground hover:text-primary disabled:opacity-50"
                : "rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
            }
          >
            {busy
              ? "Envoi…"
              : signed?.url || signedAt
                ? "Remplacer le document signé"
                : `Déposer le ${noun} signé`}
          </button>
          <p className="mt-1.5 text-xs text-muted">PDF ou photo, 4 Mo maximum.</p>
        </div>
      )}

      {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground">{error}</p>}
    </div>
  );
}
