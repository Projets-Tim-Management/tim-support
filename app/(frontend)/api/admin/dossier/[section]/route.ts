import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { deleteRow, listRows, saveRow } from "@/modules/marketing/lib/dossier-rows";
import { readTimAccesses } from "@/modules/marketing/lib/credential-secrets";
import { sectionByKey } from "@/modules/marketing/lib/portal-sections";

/**
 * Le dossier de démarrage, côté TIM.
 *
 * Mêmes tableaux que dans l'espace client, mêmes règles de validation : c'est la
 * même bibliothèque qui écrit les lignes. Seules changent les deux questions qui
 * ne se posent pas de la même façon des deux côtés — QUI est autorisé (un admin
 * ici, une session client là-bas) et DE QUEL client il s'agit (l'URL ici, le
 * cookie signé là-bas).
 *
 * Pas de verrou « dossier transmis » : c'est justement TIM qui corrige après
 * transmission, souvent en ayant le client au téléphone.
 */

const client = (req: Request) => new URL(req.url).searchParams.get("clientId");

async function guard(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  const clientId = client(req);
  if (!hasAdminRole(user) || !clientId) return { payload, ok: false as const };
  return { payload, ok: true as const, clientId };
}

export async function GET(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await guard(req);
  if (!ctx.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const section = sectionByKey((await params).section);
  if (!section) return NextResponse.json({ error: "unknown_section" }, { status: 404 });

  const docs = await listRows(ctx.payload, section, ctx.clientId);

  // Mots de passe EN CLAIR, et seulement ici : l'API les masque à la lecture
  // (chiffrés au repos), or c'est précisément cet écran qui sert à les recopier
  // dans TIM. Un mot de passe qu'on ne peut pas lire ne sert à personne, et
  // l'afficher derrière six points obligerait à le régénérer pour le connaître —
  // donc à casser celui que le client a déjà distribué.
  if (section.key === "administrateur") {
    const clair = new Map(
      (await readTimAccesses(ctx.payload, ctx.clientId)).map((a) => [String(a.id), a.timPassword]),
    );
    return NextResponse.json({
      docs: docs.map((d) => ({
        ...(d as unknown as Record<string, unknown>),
        timPassword: clair.get(String((d as { id: unknown }).id)) ?? null,
      })),
      locked: false,
    });
  }

  return NextResponse.json({ docs, locked: false });
}

export async function POST(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await guard(req);
  if (!ctx.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const section = sectionByKey((await params).section);
  if (!section) return NextResponse.json({ error: "unknown_section" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const result = await saveRow(ctx.payload, section, ctx.clientId, body);
  if (!result.ok) {
    return NextResponse.json(result.errors ? { errors: result.errors } : { error: "not_found" }, {
      status: result.status,
    });
  }
  return NextResponse.json({ ok: true, doc: result.doc });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await guard(req);
  if (!ctx.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const section = sectionByKey((await params).section);
  if (!section) return NextResponse.json({ error: "unknown_section" }, { status: 404 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  await deleteRow(ctx.payload, section, ctx.clientId, id);
  return NextResponse.json({ ok: true });
}
