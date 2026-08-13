import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import { sectionByKey, validateRow, type PortalSection } from "@/modules/marketing/lib/portal-sections";

/**
 * Lecture et écriture d'une section du dossier de démarrage, depuis l'espace
 * client.
 *
 * Trois règles non négociables, toutes appliquées ici :
 *  1. le CLIENT vient de la session (cookie signé), jamais du corps de la
 *     requête — sinon n'importe qui écrirait dans le dossier d'une autre
 *     entreprise en changeant un identifiant ;
 *  2. seuls les champs déclarés dans le registre sont acceptés (liste blanche) ;
 *  3. un dossier transmis ou validé est en lecture seule.
 */

const CLOSED_DOSSIER = ["transmis", "valide"];

/** Ne garde que les champs du registre : rien d'autre n'atteint la base. */
const pick = (section: PortalSection, body: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const field of section.fields) {
    if (!(field.name in body)) continue;
    const value = body[field.name];
    out[field.name] = value === "" ? null : value;
  }
  return out;
};

export async function GET(_req: Request, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const section = sectionByKey((await params).section);
  if (!section) return NextResponse.json({ error: "unknown_section" }, { status: 404 });

  const payload = await payloadClient();
  const res = await payload.find({
    collection: section.collection as "client-employees",
    where: { client: { equals: ctx.client.id } },
    limit: 1000,
    depth: 0,
    sort: "createdAt",
    overrideAccess: true,
  });

  return NextResponse.json({ docs: res.docs, locked: CLOSED_DOSSIER.includes(ctx.client.onboardingStatus ?? "") });
}

export async function POST(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (CLOSED_DOSSIER.includes(ctx.client.onboardingStatus ?? "")) {
    return NextResponse.json({ error: "locked" }, { status: 409 });
  }

  const section = sectionByKey((await params).section);
  if (!section) return NextResponse.json({ error: "unknown_section" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }

  const data = pick(section, body);
  const errors = validateRow(section, data);
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 422 });

  const payload = await payloadClient();
  const id = body.id;

  // La collection est choisie à l'exécution (registre des sections) : TypeScript
  // ne peut pas prouver la forme des données pour une section quelconque. La
  // garantie ne vient donc pas du typage mais de `pick` (liste blanche de
  // champs) et `validateRow` (obligatoires), qui viennent de tourner ci-dessus.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const collection = section.collection as any;
  // `Number` et non un cast : les identifiants Postgres sont numériques, alors
  // que la session les transporte en chaîne (jeton signé).
  const clientId = Number(ctx.client.id);

  try {
    // Le client est FORCÉ depuis la session, quoi qu'annonce le corps.
    const doc = id
      ? await payload.update({
          collection,
          // Le `where` (et non l'id seul) garantit qu'on ne modifie qu'une ligne
          // appartenant à CE client, même si l'id vient d'ailleurs.
          where: { id: { equals: id }, client: { equals: clientId } },
          data: data as any,
          overrideAccess: true,
        })
      : await payload.create({
          collection,
          data: { ...data, client: clientId } as any,
          overrideAccess: true,
        });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return NextResponse.json({ ok: true, doc });
  } catch (err) {
    return NextResponse.json(
      { error: "save_failed", message: err instanceof Error ? err.message : "Enregistrement impossible." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (CLOSED_DOSSIER.includes(ctx.client.onboardingStatus ?? "")) {
    return NextResponse.json({ error: "locked" }, { status: 409 });
  }

  const section = sectionByKey((await params).section);
  if (!section) return NextResponse.json({ error: "unknown_section" }, { status: 404 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const payload = await payloadClient();
  await payload.delete({
    collection: section.collection as "client-employees",
    // Même précaution qu'à la mise à jour : la suppression est bornée au client.
    where: { id: { equals: id }, client: { equals: ctx.client.id } },
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true });
}
