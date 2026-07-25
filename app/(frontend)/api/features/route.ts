import { NextResponse } from "next/server";

import { getFeatures } from "@/lib/content";

// Liste des features (recherche client). Sert désormais Payload.
export async function GET() {
  try {
    return NextResponse.json(await getFeatures());
  } catch {
    return NextResponse.json([]);
  }
}
