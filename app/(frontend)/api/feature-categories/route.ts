import { NextResponse } from "next/server";

import { getFeatureCategories } from "@/modules/editorial/lib/content";

// Catégories de features (recherche client, formulaire de contact). Payload.
export async function GET() {
  try {
    return NextResponse.json(await getFeatureCategories());
  } catch {
    return NextResponse.json([]);
  }
}
