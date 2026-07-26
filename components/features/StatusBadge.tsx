import type { FeatureStatus } from "@/core/lib/types";

const styles: Record<FeatureStatus, string> = {
  Disponible:    "bg-success-bg text-success-text border-success/30",
  Beta:          "bg-processing-bg text-processing-text border-processing/30",
  Prochainement: "bg-unavailable-bg text-unavailable border-unavailable/30",
};

export default function StatusBadge({ status }: { status: FeatureStatus }) {
  // "Disponible" est l'état nominal — pas besoin de l'afficher (ça surcharge
  // visuellement les cartes alors que c'est le cas par défaut de presque toutes
  // les features). On garde le badge pour Beta et Prochainement, qui signalent
  // une info utile à l'utilisateur.
  if (status === "Disponible") return null;

  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-[5px] border ${styles[status] ?? styles.Disponible}`}>
      {status}
    </span>
  );
}
