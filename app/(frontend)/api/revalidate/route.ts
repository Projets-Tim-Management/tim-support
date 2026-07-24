import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

const SECRET = process.env.REVALIDATE_SECRET;

export async function POST(req: NextRequest) {
  const { secret, slug } = await req.json().catch(() => ({}));

  if (SECRET && secret !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (slug) {
    revalidatePath(`/features/${slug}`);
  }
  // Revalide aussi la liste des features
  revalidatePath("/features");

  return NextResponse.json({ revalidated: true, slug: slug ?? "all" });
}
