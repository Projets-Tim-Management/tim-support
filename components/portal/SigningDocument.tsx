"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { DocumentDrawer, type PreviewDoc } from "@/components/portal/DocumentPreview";
import { SignDrawer, type PagePlan, type SignerDefaults } from "@/components/portal/SignDrawer";
import { IconCheck, IconHourglass, IconPen, IconUpload } from "@/components/ui/icons";
import { frDate, PARIS_TZ } from "@/core/lib/dates";

/**
 * Un document de la signature, côté client — un seul bouton à la fois.
 *
 *  - en préparation : rien à faire, et on le dit avec douceur ;
 *  - reçu : « Signer le devis ». Le panneau de signature (SignDrawer) montre
 *    le document à relire à côté du formulaire : pas besoin d'un « Voir » à
 *    part, qui laissait croire à deux étapes ;
 *  - signé : « Voir le devis signé ». Les éléments légaux (qui, quand, par
 *    quel procédé, référence) sont en tête de l'aperçu, le certificat complet
 *    en dernière page du PDF.
 *
 * Seul cas de dépôt : un document envoyé par e-mail sans être déposé ici — il
 * n'y a alors rien à signer en ligne, le client renvoie sa version signée.
 * Juste après ce dépôt, l'aperçu s'ouvre sur le fichier envoyé ; la suite ne
 * vient qu'à sa fermeture (« Continuer »).
 *
 * Le fichier part vers /api/portal/signature/document, qui refait tous les
 * contrôles.
 */

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png"];

type Doc = { url: string | null; filename: string | null } | null;

/** Ce que la signature en ligne a prouvé — lu dans le dossier de preuve. */
export type SignatureProof = {
  signer: string;
  role?: string | null;
  signedAt: string;
  reference: string;
  email: string;
  documentHash?: string | null;
};

export default function SigningDocument({
  kind,
  original,
  sentAt,
  signed,
  signedAt,
  consent,
  signer,
  pagePlan,
  awaitingCountersign,
  proof,
}: {
  /** Contrat signé par le client, pas encore contresigné par TIM : pas d'exemplaire encore. */
  awaitingCountersign?: boolean;
  /** Les pages à parapher une à une (null : lecture impossible, on signe sans). */
  pagePlan?: PagePlan | null;
  /** Signature en ligne aboutie (sinon : document signé déposé, ou rien). */
  proof?: SignatureProof | null;
  kind: "devis" | "contrat";
  /** Texte d'acceptation (calculé côté serveur, conservé tel quel dans la preuve). */
  consent: string;
  /** Prénom / nom du compte connecté, pour préremplir la signature. */
  signer: SignerDefaults;
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
  /** Aperçu ouvert : le document signé (consultation), ou celui qu'on vient de déposer. */
  const [preview, setPreview] = useState<{ doc: PreviewDoc; justSent: boolean } | null>(null);
  const [signing, setSigning] = useState(false);
  // Fermer l'aperçu d'un dépôt fait passer à la suite : la page se relit, et
  // passe d'elle-même à l'étape suivante.
  const closePreview = useCallback(() => {
    if (preview?.justSent) router.refresh();
    setPreview(null);
  }, [preview, router]);
  const noun = kind === "devis" ? "devis" : "contrat";

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
      const data = (await res.json().catch(() => null)) as
        | { message?: string; url?: string | null; filename?: string | null }
        | null;
      if (!res.ok) throw new Error(data?.message || "Le dépôt a échoué. Réessayez.");
      if (data?.url) setPreview({ doc: { url: data.url, filename: data.filename }, justSent: true });
      else router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const hasOriginal = Boolean(original?.url);
  const sentByMail = !hasOriginal && Boolean(sentAt);
  const isSigned = Boolean(signed?.url || signedAt);
  const available = hasOriginal || sentByMail || isSigned;

  // ── En préparation : rien à faire, on rassure ────────────────────────────
  if (!available) {
    return (
      <div className="flex flex-col items-center rounded-xl bg-surface px-6 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-primary shadow-sm">
          <IconHourglass className="h-7 w-7" />
        </span>
        <p className="mt-4 font-semibold text-foreground">Votre {noun} est en préparation</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Votre interlocuteur le déposera ici dès qu&apos;il sera prêt. Vous n&apos;avez rien à faire
          d&apos;ici là.
        </p>
      </div>
    );
  }


  const when = (iso: string) =>
    new Date(iso).toLocaleString("fr-FR", {
      timeZone: PARIS_TZ,
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  // Un seul bouton, pleine largeur, selon l'état : signer, ou voir ce qui est signé.
  const bigButton =
    "flex w-full items-center justify-center gap-3 rounded-xl px-6 py-4 font-semibold text-white shadow-sm transition";

  // ── Signé : un seul geste, voir le document signé ─────────────────────────
  // Les éléments légaux (qui, quand, référence) vivent dans l'aperçu, en tête
  // du document : la page reste simple, la preuve reste à portée.
  if (isSigned && awaitingCountersign) {
    return (
      <div className="flex flex-col items-center rounded-xl bg-surface px-6 py-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-success-text shadow-sm">
          <IconHourglass className="h-7 w-7" />
        </span>
        <p className="mt-4 font-semibold text-foreground">
          Vous avez signé votre {noun}
          {proof?.signedAt ? ` le ${frDate(proof.signedAt, "long")}` : ""}
        </p>
        <p className="mt-1 max-w-md text-sm text-muted">
          TIM le contresigne à son tour. Vous recevrez votre exemplaire signé par les deux parties par e-mail, et il
          sera disponible ici.
        </p>
      </div>
    );
  }

  if (isSigned) {
    const details = proof
      ? `Signé électroniquement par ${proof.signer}${proof.role ? `, ${proof.role}` : ""}, le ${when(proof.signedAt)} · ` +
        `code envoyé à ${proof.email} · réf. ${proof.reference}. Certificat complet en dernière page.`
      : signedAt
        ? `Document signé reçu le ${frDate(signedAt, "long")}.`
        : null;
    return (
      <div className="flex flex-col gap-4">
        {signed?.url ? (
          <button
            type="button"
            onClick={() => setPreview({ doc: { url: signed.url!, filename: signed.filename }, justSent: false })}
            className={`${bigButton} bg-success hover:opacity-90`}
          >
            <IconCheck className="h-5 w-5" />
            Voir le {noun} signé
          </button>
        ) : (
          <p className="rounded-xl bg-success-bg px-4 py-3 text-center text-sm font-medium text-success-text">
            Votre {noun} signé nous est bien parvenu{signedAt ? ` le ${frDate(signedAt, "long")}` : ""}.
          </p>
        )}

        <DocumentDrawer
          doc={preview?.doc ?? null}
          title={`Votre ${noun} signé`}
          details={preview?.justSent ? null : details}
          onClose={closePreview}
          confirmation={
            preview?.justSent
              ? {
                  text: `${kind === "devis" ? "Devis signé" : "Contrat signé"} bien reçu — merci !`,
                  cta: kind === "devis" ? "Continuer vers le contrat" : "Terminer",
                  onContinue: closePreview,
                }
              : undefined
          }
        />
      </div>
    );
  }

  // ── Reçu : un seul geste, signer (le panneau montre le document à relire) ─
  return (
    <div className="flex flex-col gap-4">
      {hasOriginal ? (
        <button type="button" onClick={() => setSigning(true)} className={`${bigButton} bg-primary hover:bg-primary-dark`}>
          <IconPen className="h-5 w-5" />
          Signer le {noun}
        </button>
      ) : (
        // Envoyé par e-mail, pas déposé ici : pas de signature en ligne possible,
        // le client renvoie sa version signée.
        <>
          <p className="rounded-xl bg-surface px-4 py-3 text-sm text-foreground">
            Votre {noun} vous a été envoyé par e-mail le {frDate(sentAt, "long")}. Signez-le, puis déposez-le ici.
          </p>
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
            className={`${bigButton} bg-primary hover:bg-primary-dark disabled:opacity-60`}
          >
            <IconUpload className="h-5 w-5" />
            {busy ? "Envoi en cours…" : `Déposer le ${noun} signé`}
          </button>
        </>
      )}

      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-foreground">{error}</p>}

      {hasOriginal && (
        <SignDrawer
          open={signing}
          kind={kind}
          document={{
            url: original!.url!,
            filename: original?.filename,
            // Une photo (devis scanné) s'affiche telle quelle ; tout le reste est un PDF.
            mime: /\.png$/i.test(original?.filename ?? "")
              ? "image/png"
              : /\.jpe?g$/i.test(original?.filename ?? "")
                ? "image/jpeg"
                : "application/pdf",
          }}
          consent={consent}
          signer={signer}
          pagePlan={pagePlan ?? null}
          onClose={() => setSigning(false)}
          onSigned={() => {
            setSigning(false);
            router.refresh();
          }}
        />
      )}

      <DocumentDrawer
        doc={preview?.doc ?? null}
        title={kind === "devis" ? "Votre devis signé" : "Votre contrat signé"}
        onClose={closePreview}
        confirmation={
          preview?.justSent
            ? {
                text: `${kind === "devis" ? "Devis signé" : "Contrat signé"} bien reçu — merci !`,
                cta: kind === "devis" ? "Continuer vers le contrat" : "Terminer",
                onContinue: closePreview,
              }
            : undefined
        }
      />
    </div>
  );
}
