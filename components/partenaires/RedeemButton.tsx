"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { burstAt } from "@/lib/confetti";
import type { RedeemResult } from "@/lib/types";

interface Props {
  rewardId:  number;
  title:     string;
  cost:      number;
  canAfford: boolean;
}

export default function RedeemButton({ rewardId, title, cost, canAfford }: Props) {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState<number | null>(null); // n° de commande
  const [error, setError]     = useState("");

  async function handleClick() {
    if (loading || done) return;
    if (!confirm(`Échanger ${cost} points contre « ${title} » ?`)) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rewards/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reward_id: rewardId }),
      });
      const data = (await res.json().catch(() => ({}))) as RedeemResult;

      if (res.ok && data.success) {
        setDone(data.order_number ?? 0);
        // Confettis depuis le centre du bouton 🎉
        const r = btnRef.current?.getBoundingClientRect();
        if (r) burstAt(r.left + r.width / 2, r.top + r.height / 2);
        // Rafraîchit le solde affiché (Server Component).
        router.refresh();
      } else {
        setError(data.message ?? "L'échange a échoué. Réessayez.");
      }
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  }

  if (done !== null) {
    return (
      <p className="text-sm font-semibold text-success-text bg-success-bg rounded-md px-3 py-2 text-center">
        ✅ Demande enregistrée{done ? ` (n°${done})` : ""} — on vous recontacte&nbsp;!
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button
        ref={btnRef}
        onClick={handleClick}
        loading={loading}
        disabled={!canAfford}
        size="sm"
        className="w-full"
      >
        {canAfford ? "Échanger" : "Points insuffisants"}
      </Button>
      {error && <p className="text-xs text-danger text-center">{error}</p>}
    </div>
  );
}
