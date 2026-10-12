import type { Metadata } from "next";
import "./globals.css";
import ConditionalHeader from "@/components/layout/ConditionalHeader";
import ConditionalFooter from "@/components/layout/ConditionalFooter";
import HelpFab from "@/components/ui/HelpFab";

export const metadata: Metadata = {
  title: {
    default: "Centre d'aide – Tim Management",
    template: "%s – Centre d'aide Tim Management",
  },
  description:
    "Guides, tutoriels et réponses à vos questions sur Tim Management — logiciel de pointage et planning chantier.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://support.tim-management.co"
  ),
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `data-scroll-behavior` : le défilement doux (globals.css) ne doit pas
  // s'appliquer aux changements de page — Next le coupe alors lui-même.
  return (
    <html lang="fr" data-scroll-behavior="smooth">
      <body className="flex flex-col min-h-screen bg-white">
        <ConditionalHeader />
        <main className="flex-1">{children}</main>
        <ConditionalFooter />
        <HelpFab />
      </body>
    </html>
  );
}
