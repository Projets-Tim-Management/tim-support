import { NextResponse } from "next/server";

import { submitMission } from "@/modules/partner/lib/partner";
import { getSession } from "@/modules/partner/lib/session";

// Soumission d'une preuve de mission (capture d'écran) → Payload.
// L'identité (email) vient TOUJOURS de la session, jamais du client.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { code: "unauthorized", message: "Connectez-vous depuis l'app pour envoyer une preuve." },
      { status: 401 },
    );
  }

  try {
    const form = await req.formData();
    const missionId = Number(form.get("mission_id"));
    if (!Number.isInteger(missionId) || missionId <= 0) {
      return NextResponse.json({ code: "invalid_mission", message: "Mission invalide." }, { status: 400 });
    }

    const files = [...form.values()].filter((v): v is File => v instanceof File);

    const { status, data } = await submitMission({
      email: session.email,
      missionId,
      note: String(form.get("note") ?? "") || undefined,
      reviewerEmail: String(form.get("reviewer_email") ?? "") || undefined,
      files,
    });
    return NextResponse.json(data, { status });
  } catch {
    return NextResponse.json(
      { code: "network_error", message: "Impossible de joindre le serveur." },
      { status: 503 },
    );
  }
}
