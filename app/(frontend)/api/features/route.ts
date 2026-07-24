import { NextResponse } from "next/server";

const TIM_API =
  process.env.SUPPORT_WP_API_URL
    ? process.env.SUPPORT_WP_API_URL.replace("/wp/v2", "/tim-support/v1")
    : "https://support-tim-management.co/wp-json/tim-support/v1";

export async function GET() {
  try {
    const res = await fetch(`${TIM_API}/features?per_page=200`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json([], { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch {
    return NextResponse.json([]);
  }
}
