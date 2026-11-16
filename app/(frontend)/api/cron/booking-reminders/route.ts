import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { sendDueReminders } from "@/modules/booking/lib/reminders";

/** Les rappels des rendez-vous en ligne (la veille, une heure avant…) — toutes les dix minutes. Voir lib/reminders. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const payload = await payloadClient();
  return NextResponse.json(await sendDueReminders(payload));
}
