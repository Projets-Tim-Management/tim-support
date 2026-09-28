import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import SigningCompanyForm from "@/components/portal/SigningCompanyForm";
import SigningDocument from "@/components/portal/SigningDocument";
import { IconCheck } from "@/components/ui/icons";
import { getPortalClient, type PortalMedia } from "@/modules/marketing/lib/portal-server";
import { signingStarted, signingSteps } from "@/modules/partner/lib/signing";

export const metadata: Metadata = {
  title: "Signature",
  robots: { index: false, follow: false },
};

/** Un document peuplé (depth 1) → ce dont l'écran a besoin, rien de plus. */
const docOf = (m: PortalMedia) =>
  m && typeof m === "object" ? { url: m.url ?? null, filename: m.filename ?? null } : null;

/**
 * « Signature » — ce que le client a à faire pour que l'affaire soit conclue.
 *
 * Trois blocs, dans l'ordre du process : ses informations d'entreprise, son
 * devis, son contrat. Chacun dit où il en est, et offre le geste qui le fait
 * avancer : compléter, télécharger, déposer signé.
 *
 * Toutes les lectures viennent de l'entreprise du cookie signé (getPortalClient),
 * jamais d'un identifiant de l'URL.
 */
export default async function SignaturePage() {
  const ctx = await getPortalClient();
  if (!ctx) redirect("/espace-client?next=/espace-client/signature");
  const { client } = ctx;

  if (!signingStarted(client as Record<string, unknown>)) {
    return (
      <div className="px-6 py-10 sm:px-8">
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

  const steps = signingSteps(client as Record<string, unknown>);
  const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
  const done = steps.filter((s) => s.done).length;
  const locked = Boolean(client.signatureDate);

  const blocks = [
    {
      key: "entreprise",
      title: "Les informations de votre entreprise",
      desc: "Pour établir vos factures : raison sociale, SIREN ou SIRET, adresse.",
      done: byKey.entreprise.done,
      body: (
        <SigningCompanyForm
          locked={locked}
          initial={{
            raisonSociale: client.raisonSociale ?? client.companyName ?? "",
            siren: client.siren ?? "",
            siret: client.siret ?? "",
            vatNumber: client.vatNumber ?? "",
            billingAddress: client.billingAddress ?? "",
            billingAddressComplement: client.billingAddressComplement ?? "",
          }}
        />
      ),
    },
    {
      key: "devis",
      title: "Votre devis",
      desc: "Téléchargez-le, signez-le, et déposez-le ici.",
      done: byKey["devis-signe"].done,
      body: (
        <SigningDocument
          kind="devis"
          original={docOf(client.quoteDocument ?? null)}
          sentAt={client.quoteSentAt ?? null}
          signed={docOf(client.quoteSignedDocument ?? null)}
          signedAt={client.quoteSignedAt ?? null}
        />
      ),
    },
    {
      key: "contrat",
      title: "Votre contrat",
      desc: "Il suit le devis signé. Même geste : télécharger, signer, déposer.",
      done: byKey["contrat-signe"].done,
      body: (
        <SigningDocument
          kind="contrat"
          original={docOf(client.contractToSignDocument ?? null)}
          sentAt={client.contractSentAt ?? null}
          signed={docOf(client.contractDocument ?? null)}
          signedAt={client.signatureDate ?? null}
        />
      ),
    },
  ];

  const current = blocks.find((b) => !b.done)?.key;

  return (
    <div className="px-6 py-10 sm:px-8">
      <Link href="/espace-client/accueil" className="text-sm text-muted hover:underline">
        ← Mon espace
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-foreground">Signature</h1>
      <p className="mt-2 max-w-2xl text-muted">
        {locked
          ? "Votre contrat est signé. Bienvenue chez TIM !"
          : "Trois étapes pour finaliser votre arrivée chez TIM. Vous pouvez les faire dans l'ordre qui vous arrange."}
      </p>

      <div className="mt-6 max-w-3xl">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-foreground">Avancement</span>
          <span className="text-muted">
            {done} étape{done > 1 ? "s" : ""} sur {steps.length}
          </span>
        </div>
        <div className="mt-2 flex gap-1.5" role="img" aria-label={`${done} étapes sur ${steps.length}`}>
          {steps.map((s) => (
            <span key={s.key} className={`h-1.5 flex-1 rounded-full ${s.done ? "bg-success" : "bg-border"}`} />
          ))}
        </div>
      </div>

      <div className="mt-8 flex max-w-3xl flex-col gap-5">
        {blocks.map((b, i) => (
          <section
            key={b.key}
            className={`rounded-lg border bg-white p-5 sm:p-6 ${
              b.key === current ? "border-primary shadow-sm" : "border-border"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  b.done
                    ? "bg-success-bg text-success-text"
                    : b.key === current
                      ? "bg-primary text-white"
                      : "bg-surface text-muted"
                }`}
                aria-hidden
              >
                {b.done ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <h2 className="text-lg font-semibold text-foreground">{b.title}</h2>
            </div>
            <p className="mt-1 text-sm text-muted">{b.desc}</p>
            <div className="mt-4">{b.body}</div>
          </section>
        ))}
      </div>

      <p className="mt-8 max-w-3xl text-sm text-muted">
        Une question sur votre devis ou votre contrat&nbsp;? Répondez simplement à notre e-mail.
      </p>
    </div>
  );
}
