import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import ConditionalFooter from "@/components/layout/ConditionalFooter";
import HelpFab from "@/components/ui/HelpFab";

export const metadata: Metadata = {
  title: {
    default: "Centre d'aide – TIM Management",
    template: "%s – Centre d'aide TIM Management",
  },
  description:
    "Guides, tutoriels et réponses à vos questions sur TIM Management — logiciel de pointage et planning chantier.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://support.tim-management.co"
  ),
  icons: {
    icon: "https://support-tim-management.co/wp-content/uploads/2026/04/favicon.png",
    shortcut: "https://support-tim-management.co/wp-content/uploads/2026/04/favicon.png",
    apple: "https://support-tim-management.co/wp-content/uploads/2026/04/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="flex flex-col min-h-screen bg-white">
        <Header />
        <main className="flex-1">{children}</main>
        <ConditionalFooter />
        <HelpFab />
      </body>
    </html>
  );
}
