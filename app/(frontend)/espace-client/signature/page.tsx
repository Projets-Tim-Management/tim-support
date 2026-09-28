import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DocumentCard } from "@/components/portal/DocumentPreview";
import SigningCompanyForm from "@/components/portal/SigningCompanyForm";
import SigningDocument, { type SignatureProof } from "@/components/portal/SigningDocument";
import { IconBuilding, IconChat, IconCheck, IconFile, IconPen } from "@/components/ui/icons";
import { payloadClient } from "@/core/payload-client";
import { getPortalClient, type PortalMedia } from "@/modules/marketing/lib/portal-server";
import { consentText, maskEmail } from "@/modules/partner/lib/e-signature";
import {
  canSignNow,
  fetchMediaBytes,
  pagePlanOf,
  awaitingCountersign,
  pendingContractUpdate,
  signableDocOf,
  type PagePlan,
} from "@/modules/partner/lib/e-signature-server";
import { inseeSearch } from "@/modules/partner/lib/insee";
import {
  PORTAL_STAGES,
  portalProgress,
  signingStarted,
  type PortalStage,
} from "@/modules/partner/lib/signing";

export const metadata: Metadata = {
  title: "Signature",
  robots: { index: false, follow: false },
};

/** Un document peuplé (depth 1) → ce dont l'écran a besoin, rien de plus. */
const docOf = (m: PortalMedia) =>
  m && typeof m === "object" ? { url: m.url ?? null, filename: m.filename ?? null } : null;

const HREF = "/espace-client/signature";

/**
 * « Signature » — une étape à la fois.
 *
 * Trois étapes, dans l'ordre : l'entreprise, le devis, le contrat. On n'affiche
 * QUE celle où en est le client : trois blocs ouverts d'un coup disaient tout
 * et ne guidaient vers rien, et laissaient signer un devis avant d'avoir donné
 * le SIREN pour lequel il est établi. Une étape ne s'ouvre qu'une fois la
 * précédente franchie (voir portalProgress) ; enregistrer ou déposer fait
 * passer à la suivante sans autre clic.
 *
 * La frise du haut permet de REVENIR sur une étape franchie (`?etape=`) —
 * corriger une adresse, retélécharger le devis —, jamais de sauter en avant :
 * une étape fermée n'est pas un lien.
 *
 * Toutes les lectures viennent de l'entreprise du cookie signé (getPortalClient),
 * jamais d'un identifiant de l'URL. `?etape=` ne choisit qu'un AFFICHAGE, et
 * seulement parmi les étapes déjà ouvertes.
 */
export default async function SignaturePage({
  searchParams,
}: {
  searchParams: Promise<{ etape?: string }>;
}) {
  const ctx = await getPortalClient();
  if (!ctx) redirect(`/espace-client?next=${HREF}`);
  const { client } = ctx;
  const facts = client as Record<string, unknown>;

  if (!signingStarted(facts)) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 pb-16 pt-8">
        <Link href="/espace-client/accueil" className="text-sm text-muted hover:underline">
          ← Mon espace
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Signature</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Rien à signer pour l&apos;instant. Cette page s&apos;ouvrira quand vous aurez décidé de
          continuer avec TIM.
        </p>
      </div>
    );
  }

  const progress = portalProgress(facts);
  const { done, reached } = progress;
  let current = progress.current;

  // Le signataire proposé : le représentant légal renseigné à l'étape « Votre
  // entreprise » (c'est lui qui engage la société) ; à défaut, la personne
  // connectée. Tout reste modifiable si quelqu'un d'autre signe.
  const payload = await payloadClient();
  const account = (await payload
    .findByID({ collection: "client-portal-accounts", id: ctx.session.aid, depth: 0, overrideAccess: true })
    .catch(() => null)) as { firstName?: string | null; lastName?: string | null } | null;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const repFirst = text(facts.representativeFirstName);
  const repLast = text(facts.representativeLastName);
  const hasRep = Boolean(repFirst || repLast);
  const signer = {
    firstName: hasRep ? repFirst : text(account?.firstName),
    lastName: hasRep ? repLast : text(account?.lastName),
    role: text(facts.representativeRole),
  };

  // Une nouvelle version du contrat (v2…) attend sa signature : l'étape
  // « Contrat » se rouvre sur elle ; la version signée reste en vigueur.
  const update = await pendingContractUpdate(payload, client);
  const countersignPending = await awaitingCountersign(payload, client.id);
  if (update) {
    done.contrat = false;
    if (done.entreprise && done.devis) current = "contrat";
  }

  // Le dossier de preuve des signatures en ligne abouties — la plus récente
  // par document. Affiché tel quel sous le document signé.
  const proofs = (
    await payload.find({
      collection: "electronic-signatures",
      where: { and: [{ client: { equals: client.id } }, { status: { equals: "signe" } }] },
      sort: "-signedAt",
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as unknown as {
    id: number;
    kind?: string;
    signerFirstName?: string;
    signerLastName?: string;
    signerRole?: string | null;
    signerEmail?: string;
    signedAt?: string;
    signedHash?: string | null;
  }[];
  const proofOf = (kind: "devis" | "contrat"): SignatureProof | null => {
    const p = proofs.find((x) => x.kind === kind && x.signedAt);
    return p
      ? {
          signer: [p.signerFirstName, p.signerLastName].filter(Boolean).join(" "),
          role: p.signerRole,
          signedAt: p.signedAt!,
          reference: `SIG-${String(p.id).padStart(6, "0")}`,
          email: maskEmail(p.signerEmail),
          documentHash: p.signedHash,
        }
      : null;
  };
  const { etape } = await searchParams;

  /**
   * Préremplissage de l'étape « Votre entreprise » : la fiche d'abord (TIM, le
   * partenaire ou l'INSEE y ont peut-être déjà tout mis), puis l'INSEE par le
   * SIREN pour ce qui manque encore — forme sociale et adresse du siège. Le
   * client corrige ; rien n'est enregistré tant qu'il ne valide pas.
   */
  const needsInsee =
    (etape === "entreprise" || (!etape && current === "entreprise")) &&
    Boolean(client.siren) &&
    (!client.legalForm || !client.billingAddress);
  const insee = needsInsee ? ((await inseeSearch(client.siren!))?.[0] ?? null) : null;
  // Revenir sur une étape ouverte, oui ; forcer une étape fermée, non.
  const shown: PortalStage | "termine" =
    etape && reached.includes(etape as PortalStage) ? (etape as PortalStage) : current;
  const revisiting = shown !== current;
  const locked = Boolean(client.signatureDate);
  const index = PORTAL_STAGES.findIndex((s) => s.key === shown);

  const STAGE_VIEW: Record<PortalStage, { Icon: typeof IconFile; title: string; desc: string }> = {
    entreprise: {
      Icon: IconBuilding,
      title: "Les informations de votre entreprise",
      desc: "Elles servent à établir votre devis puis vos factures. Deux minutes suffisent.",
    },
    devis: {
      Icon: IconFile,
      title: "Votre devis",
      desc: "Relisez-le, puis signez-le en ligne avec un code reçu par e-mail.",
    },
    contrat: update
      ? {
          Icon: IconPen,
          title: `Votre contrat mis à jour${update.reference ? ` (${update.reference})` : ""}`,
          desc: "Même geste que la première fois : relire, parapher chaque page, puis signer en ligne.",
        }
      : {
          Icon: IconPen,
          title: "Votre contrat",
          desc: "Il suit votre devis signé. Même geste : relire, puis signer en ligne.",
        },
  };
  const view = shown === "termine" ? null : STAGE_VIEW[shown];
  // Étape rouverte alors qu'elle est franchie : tout passe au vert, comme la frise.
  const shownDone = shown !== "termine" && done[shown];
  // Les pages à parapher une à une, pour le document à signer maintenant.
  let pagePlan: PagePlan | null = null;
  if ((shown === "devis" || shown === "contrat") && (canSignNow(client, shown) || (shown === "contrat" && update))) {
    const doc = signableDocOf(client, shown);
    const bytes = doc ? await fetchMediaBytes(doc.url) : null;
    if (doc && bytes) pagePlan = await pagePlanOf(bytes, doc.mime).catch(() => null);
  }
  const DONE_DESC: Record<PortalStage, string> = {
    entreprise: "Vos informations sont enregistrées. Vous pouvez encore les corriger.",
    devis: "Votre devis est signé. Merci !",
    contrat: "Votre contrat est signé. Merci !",
  };

  return (
    // Un fondu rouge en haut de page, sur toute la largeur — jusque derrière
    // le logo (le châssis le place au-dessus) : pas de coupure sous le bandeau.
    <div className="relative isolate">
    <div
      aria-hidden
      // Rouge tant qu'il reste à faire ; vert sur une étape franchie ou quand
      // tout est signé — la même règle que la frise.
      className={`pointer-events-none absolute inset-x-0 -top-20 -z-10 h-[26rem] bg-linear-to-b to-transparent ${
        shownDone || shown === "termine" ? "from-success-bg" : "from-primary-light"
      }`}
    />
    <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-6">
      {/* ── En-tête : le retour et le titre sur la même ligne, pour gagner de
          la hauteur ; trois colonnes pour que le titre reste centré. ───────── */}
      <header className="flex flex-col items-center gap-2 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <Link
          href="/espace-client/accueil"
          className="self-start text-sm text-muted hover:text-foreground sm:self-auto sm:justify-self-start"
        >
          ← Mon espace
        </Link>
        <h1 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
          {update ? "Mise à jour de votre contrat" : current === "termine" ? "Bienvenue chez TIM !" : "Finalisons votre arrivée chez TIM"}
        </h1>
        <span aria-hidden className="hidden sm:block" />
      </header>
      <p className="mx-auto mt-2 max-w-xl text-center text-muted">
        {update
          ? "Relisez et signez la nouvelle version. Votre contrat actuel reste en vigueur jusqu'à votre signature."
          : current === "termine"
          ? "Tout est signé. Nous activons votre compte de production."
          : `Trois étapes${client.companyName ? ` pour ${client.companyName}` : ""}, l'une après l'autre : nous vous guidons.`}
      </p>

      <div className="mx-auto max-w-2xl">
      {/* ── La frise : où on en est, et ce qu'on peut rouvrir ─────────────── */}
      <ol className="mt-8 flex items-start" aria-label="Étapes de la signature">
        {PORTAL_STAGES.map((s, i) => {
          const open = reached.includes(s.key);
          const active = s.key === shown;
          const inner = (
            <>
              <span
                // Vert : validée. Rouge : à faire — pleine pour celle qu'on
                // regarde, cerclée pour les suivantes.
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition ${
                  done[s.key]
                    ? "bg-success text-white"
                    : active
                      ? "bg-primary text-white ring-4 ring-primary-light"
                      : "border-2 border-primary bg-white text-primary"
                } ${active && done[s.key] ? "ring-4 ring-success-bg" : ""}`}
                aria-hidden
              >
                {done[s.key] ? <IconCheck className="h-5 w-5" /> : i + 1}
              </span>
              <span
                className={`mt-2 text-center text-sm ${active ? "font-semibold" : ""} ${
                  done[s.key] ? "text-success-text" : "text-primary"
                }`}
              >
                {s.label}
              </span>
            </>
          );
          return (
            <li key={s.key} className="relative flex flex-1 flex-col items-center">
              {/* Le trait qui relie à l'étape suivante, derrière les pastilles. */}
              {i < PORTAL_STAGES.length - 1 && (
                <span
                  className={`absolute left-1/2 top-5 h-0.5 w-full ${done[s.key] ? "bg-success" : "bg-primary/30"}`}
                  aria-hidden
                />
              )}
              {open && !active ? (
                <Link
                  href={s.key === current ? HREF : `${HREF}?etape=${s.key}`}
                  className="relative flex flex-col items-center rounded-lg px-2 hover:opacity-80"
                >
                  {inner}
                </Link>
              ) : (
                <span
                  className="relative flex flex-col items-center px-2"
                  aria-current={active ? "step" : undefined}
                  aria-disabled={!open || undefined}
                >
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* ── L'étape affichée, et elle seule ──────────────────────────────── */}
      <section className="mt-8 rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
        {view ? (
          <div className="flex items-start gap-4">
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                shownDone ? "bg-success-bg text-success-text" : "bg-primary-light text-primary"
              }`}
            >
              {shownDone ? <IconCheck className="h-6 w-6" /> : <view.Icon className="h-6 w-6" />}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Étape {index + 1} sur {PORTAL_STAGES.length}
                {shownDone && <span className="text-success-text"> · Faite</span>}
              </p>
              <h2 className="mt-1 text-xl font-bold text-foreground">{view.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {shownDone ? DONE_DESC[shown as PortalStage] : view.desc}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-success-text">
              <IconCheck className="h-8 w-8" />
            </span>
            <h2 className="mt-4 text-xl font-bold text-foreground">C&apos;est signé, merci&nbsp;!</h2>
            <p className="mt-1 text-sm text-muted">
              Nous activons votre compte de production. Vos documents restent disponibles ici.
            </p>
          </div>
        )}

        <div className="mt-6">
          {shown === "entreprise" && (
            // Enregistrer rafraîchit la page : sans `?etape`, elle passe d'elle-même à
            // l'étape suivante ; en révision, on reste sur ce qu'on vient de corriger.
            <SigningCompanyForm
              locked={locked}
              submitLabel={revisiting ? "Enregistrer" : "Valider et continuer"}
              initial={{
                raisonSociale: client.raisonSociale ?? insee?.denomination ?? client.companyName ?? "",
                legalForm: client.legalForm ?? insee?.formeJuridique ?? "",
                shareCapital: client.shareCapital != null ? String(client.shareCapital) : "",
                siren: client.siren ?? "",
                siret: client.siret ?? "",
                rcsCity: client.rcsCity ?? "",
                vatNumber: client.vatNumber ?? "",
                billingAddress: client.billingAddress ?? insee?.adresse ?? "",
                billingAddressComplement: client.billingAddressComplement ?? "",
                representativeFirstName: client.representativeFirstName ?? account?.firstName ?? "",
                representativeLastName: client.representativeLastName ?? account?.lastName ?? "",
                representativeRole: client.representativeRole ?? "",
              }}
            />
          )}

          {shown === "devis" && (
            <SigningDocument
              kind="devis"
              proof={proofOf("devis")}
              consent={consentText("devis", client.companyName)}
              signer={signer}
              pagePlan={pagePlan}
              original={docOf(client.quoteDocument ?? null)}
              sentAt={client.quoteSentAt ?? null}
              signed={docOf(client.quoteSignedDocument ?? null)}
              signedAt={client.quoteSignedAt ?? null}
            />
          )}

          {shown === "contrat" && (
            <SigningDocument
              kind="contrat"
              proof={update ? null : proofOf("contrat")}
              awaitingCountersign={!update && countersignPending}
              consent={consentText("contrat", client.companyName)}
              signer={signer}
              pagePlan={pagePlan}
              original={docOf(client.contractToSignDocument ?? null)}
              sentAt={client.contractSentAt ?? null}
              // Mise à jour en attente : la nouvelle version est à signer ; la
              // version signée en vigueur n'est pas celle qu'on présente ici.
              signed={update ? docOf(null) : docOf(client.contractDocument ?? null)}
              signedAt={update ? null : (client.signatureDate ?? null)}
            />
          )}

          {shown === "termine" && (
            <div className="flex flex-col gap-3">
              {[
                { label: "Devis signé", doc: docOf(client.quoteSignedDocument ?? null) },
                { label: "Contrat signé", doc: docOf(client.contractDocument ?? null) },
              ]
                .filter((d) => d.doc?.url)
                .map((d) => (
                  <DocumentCard
                    key={d.label}
                    doc={{ url: d.doc!.url!, filename: d.doc!.filename }}
                    title={d.label}
                    subtitle={d.doc!.filename}
                  />
                ))}
            </div>
          )}
        </div>

        {revisiting && (
          <div className="mt-6 border-t border-border pt-4 text-center">
            <Link href={HREF} className="text-sm font-semibold text-primary hover:underline">
              Revenir à l&apos;étape en cours →
            </Link>
          </div>
        )}
      </section>

      <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted">
        <IconChat className="h-4 w-4" />
        Une question sur votre devis ou votre contrat&nbsp;? Répondez simplement à notre e-mail.
      </p>
      </div>
    </div>
    </div>
  );
}
