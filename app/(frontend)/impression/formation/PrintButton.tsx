"use client";

/** Bouton « Imprimer » — pour les pages qu'on règle avant d'imprimer (étiquettes). */
export default function PrintButton({ label = "Imprimer" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
    >
      {label}
    </button>
  );
}
