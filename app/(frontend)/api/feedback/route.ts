import { NextResponse } from "next/server";

import { payloadClient } from "@/lib/payload-client";

// Feedback « utile / pas utile » sur une feature → incrémente les compteurs
// Payload. (postId = id Payload de la feature, fourni par le front.)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.postId);
    const helpful = Boolean(body?.helpful);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const payload = await payloadClient();
    const feature = await payload
      .findByID({ collection: "features", id, depth: 0, draft: true })
      .catch(() => null);
    if (!feature) return NextResponse.json({ success: false }, { status: 404 });

    const fb = (feature as { feedback?: { helpful?: number; notHelpful?: number } }).feedback ?? {};
    await payload.update({
      collection: "features",
      id,
      data: {
        _status: "published",
        feedback: {
          helpful: (fb.helpful ?? 0) + (helpful ? 1 : 0),
          notHelpful: (fb.notHelpful ?? 0) + (helpful ? 0 : 1),
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[feedback] échec:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
