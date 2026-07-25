"use client";

import { useState } from "react";

/** Envoie un vote de feedback à l'API Payload (silencieux en cas d'échec). */
async function sendFeedback(postId: number, helpful: boolean, comment?: string) {
  try {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, helpful, comment }),
    });
  } catch {
    /* silencieux */
  }
}

export default function FeedbackWidget({ postId }: { postId: number }) {
  const [choice, setChoice]   = useState<"helpful" | "not_helpful" | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent]       = useState(false);

  async function handleVote(helpful: boolean) {
    if (sent) return;
    setChoice(helpful ? "helpful" : "not_helpful");
    if (helpful) {
      await sendFeedback(postId, true);
      setSent(true);
    }
  }

  async function handleSubmitComment() {
    await sendFeedback(postId, false, comment);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-12 pt-6 border-t border-border">
        <p className="text-sm text-muted text-center">
          Merci pour votre retour !
        </p>
      </div>
    );
  }

  return (
    <div className="mt-12 pt-6 border-t border-border">
      <p className="text-sm font-medium text-foreground mb-3">
        Cette documentation vous a-t-elle aidé ?
      </p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => handleVote(true)}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border transition-all ${
            choice === "helpful"
              ? "bg-emerald-50 border-emerald-300 text-emerald-700"
              : "border-border text-foreground hover:border-emerald-300 hover:bg-emerald-50"
          }`}
        >
          👍 Oui
        </button>
        <button
          onClick={() => handleVote(false)}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border transition-all ${
            choice === "not_helpful"
              ? "bg-red-50 border-red-300 text-red-700"
              : "border-border text-foreground hover:border-red-300 hover:bg-red-50"
          }`}
        >
          👎 Non
        </button>
      </div>

      {choice === "not_helpful" && (
        <div className="flex flex-col gap-2 max-w-md">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Qu'est-ce qui manque ou n'est pas clair ? (optionnel)"
            rows={3}
            className="w-full text-sm px-3 py-2 rounded-md border border-border focus:outline-none focus:border-primary resize-none"
          />
          <button
            onClick={handleSubmitComment}
            className="self-start text-sm px-4 py-1.5 rounded-md bg-primary text-white hover:bg-primary-dark transition-colors"
          >
            Envoyer
          </button>
        </div>
      )}
    </div>
  );
}
