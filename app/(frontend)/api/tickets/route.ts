import { NextResponse } from "next/server";

const TIM_API =
  process.env.SUPPORT_WP_API_URL
    ? process.env.SUPPORT_WP_API_URL.replace("/wp/v2", "/tim-support/v1")
    : "https://support-tim-management.co/wp-json/tim-support/v1";

// Le formulaire envoie systématiquement du multipart/form-data (avec ou sans
// fichiers). On forward le FormData tel quel à WP — Node fixe le bon
// Content-Type avec boundary automatiquement.
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const res = await fetch(`${TIM_API}/tickets`, {
      method: "POST",
      body: formData,
      cache: "no-store",
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
