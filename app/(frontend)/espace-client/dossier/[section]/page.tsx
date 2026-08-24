import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import SectionEditor from "@/components/portal/SectionEditor";
import { sectionByKey } from "@/modules/marketing/lib/portal-sections";
import { isDossierLocked } from "@/modules/marketing/lib/onboarding";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";

export const metadata: Metadata = {
  title: "Dossier de démarrage",
  robots: { index: false, follow: false },
};



export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const ctx = await getPortalClient();
  if (!ctx) redirect("/espace-client");

  const section = sectionByKey((await params).section);
  if (!section) notFound();

  return (
    <div className="px-6 py-10 sm:px-8">
      <Link href="/espace-client/dossier" className="text-sm text-muted hover:underline">
        ← Dossier de démarrage
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-3xl font-bold text-foreground">{section.label}</h1>
        <p className="mt-2 max-w-2xl text-muted">{section.intro}</p>
      </header>

      <SectionEditor
        section={section}
        locked={isDossierLocked(ctx.client.onboardingStatus)}
      />
    </div>
  );
}
