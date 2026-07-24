import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const TIM_API =
  process.env.SUPPORT_WP_API_URL
    ? process.env.SUPPORT_WP_API_URL.replace("/wp/v2", "/tim-support/v1")
    : "https://support-tim-management.co/wp-json/tim-support/v1";

const INTERNAL_SECRET = process.env.TIM_INTERNAL_SECRET ?? "";

// Soumission d'une preuve de mission (capture d'écran).
// Le formulaire envoie du multipart (capture + mission_id + note). On injecte
// l'email depuis la session (jamais depuis le client) puis on relaie à WP avec
// le secret serveur-à-serveur. Node fixe le bon Content-Type multipart.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { code: "unauthorized", message: "Connectez-vous depuis l'app pour envoyer une preuve." },
      { status: 401 }
    );
  }

  try {
    const incoming = await req.formData();
    const outgoing = new FormData();

    // On ne reconduit que les champs attendus + les fichiers.
    const missionId = incoming.get("mission_id");
    const note = incoming.get("note");
    const reviewerEmail = incoming.get("reviewer_email");
    if (missionId != null) outgoing.set("mission_id", String(missionId));
    if (note != null) outgoing.set("note", String(note));
    if (reviewerEmail != null) outgoing.set("reviewer_email", String(reviewerEmail));

    for (const [key, value] of incoming.entries()) {
      if (value instanceof File) outgoing.append(key, value, value.name);
    }

    // Identité forcée par la session.
    outgoing.set("email", session.email);

    const res = await fetch(`${TIM_API}/missions/submit`, {
      method: "POST",
      body: outgoing,
      cache: "no-store",
      headers: { "X-Tim-Internal-Secret": INTERNAL_SECRET },
    });

    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { code: "network_error", message: "Impossible de joindre le serveur." },
      { status: 503 }
    );
  }
}
