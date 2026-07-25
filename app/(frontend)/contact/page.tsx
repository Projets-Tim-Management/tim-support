import { Suspense } from "react";
import type { Metadata } from "next";
import TicketForm from "@/components/forms/TicketForm";
import Breadcrumb from "@/components/ui/Breadcrumb";

export const metadata: Metadata = {
  title: "Nous contacter",
  description: "Posez une question, signalez un bug ou suggérez une amélioration. Notre équipe vous répond rapidement.",
};

export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Breadcrumb items={[{ label: "Contact" }]} />

      <header className="mt-6 mb-8">
        <h1 className="text-3xl font-bold text-foreground">Nous contacter</h1>
        <p className="mt-2 text-muted">
          Une question, un bug, une suggestion&nbsp;? Envoyez-nous votre demande, l&apos;équipe vous répond dans les plus brefs délais.
        </p>
      </header>

      <Suspense fallback={<div className="text-muted">Chargement du formulaire…</div>}>
        <TicketForm />
      </Suspense>
    </div>
  );
}
