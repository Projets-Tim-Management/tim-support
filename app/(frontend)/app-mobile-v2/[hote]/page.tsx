import { notFound } from "next/navigation";

import AppV2Landing, { APP_V2_METADATA } from "@/components/app-v2/AppV2Landing";
import { appV2HostId } from "@/modules/marketing/lib/app-v2";

/**
 * /app-mobile-v2/<interlocuteur> — la présentation de la V2. Les adresses déjà envoyées aux clients restent valables ;
 * une adresse hors de la liste APP_V2_HOSTS est introuvable. La prise de rendez-vous est fermée (16/11/2026).
 */
export const metadata = APP_V2_METADATA;
export const revalidate = 3600;

export default async function AppV2HostPage({ params }: { params: Promise<{ hote: string }> }) {
  const { hote } = await params;
  if (appV2HostId(hote) == null) notFound();
  return <AppV2Landing />;
}
