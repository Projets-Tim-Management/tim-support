"use client";

import { useState, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Button from "@/components/ui/Button";
import { burstAt } from "@/core/ui/confetti";
import type { Mission, MissionSubmitResult } from "@/core/lib/types";

const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export default function MissionCard({
  mission,
  partnerCode,
}: {
  mission: Mission;
  partnerCode: string;
}) {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const alreadyDone = mission.partner_status === "approved";
  const pending = mission.partner_status === "pending";

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    setError("");
    const picked = Array.from(e.target.files ?? []);
    const valid: File[] = [];
    for (const f of picked) {
      if (!ACCEPTED.includes(f.type)) {
        setError("Format non supporté (JPG, PNG, GIF ou WebP).");
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        setError("Image trop lourde (5 Mo max).");
        continue;
      }
      valid.push(f);
    }
    setFiles(valid.slice(0, MAX_FILES));
  }

  async function submit() {
    if (loading || files.length === 0) {
      if (files.length === 0) setError("Ajoutez votre capture d'écran.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("mission_id", String(mission.id));
      if (reviewerEmail.trim()) fd.set("reviewer_email", reviewerEmail.trim());
      if (note.trim()) fd.set("note", note.trim());
      files.forEach((f, i) => fd.append(`screenshot_${i}`, f, f.name));

      const res = await fetch("/api/missions/submit", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as MissionSubmitResult;

      if (res.ok && data.success) {
        setDone(data.submission_number ?? 0);
        const r = btnRef.current?.getBoundingClientRect();
        if (r) burstAt(r.left + r.width / 2, r.top + r.height / 2);
        router.refresh();
      } else {
        setError(data.message ?? "L'envoi a échoué. Réessayez.");
      }
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  }

  function copyCode() {
    navigator.clipboard?.writeText(partnerCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <article className="flex flex-col rounded-lg border border-border bg-white overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        {mission.image ? (
          <Image
            src={mission.image}
            alt=""
            width={56}
            height={56}
            className="rounded-md object-contain shrink-0 bg-surface"
          />
        ) : (
          <div className="w-14 h-14 rounded-md bg-surface flex items-center justify-center text-2xl shrink-0">
            {mission.type === "manuelle" ? "🔗" : "📸"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-bold text-foreground">{mission.title}</h2>
            <span className="shrink-0 rounded-full bg-primary-light text-primary text-xs font-extrabold px-2.5 py-1 tabular-nums">
              +{mission.points.toLocaleString("fr-FR")}
            </span>
          </div>
          {mission.description && (
            <div
              className="mt-1 text-sm text-muted [&_p]:m-0 [&_p+p]:mt-1.5 [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
              dangerouslySetInnerHTML={{ __html: mission.description }}
            />
          )}
        </div>
      </div>

      <div className="px-4 pb-4 mt-auto space-y-3">
        {mission.url && (
          <a
            href={mission.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Ouvrir le lien ↗
          </a>
        )}

        {/* ─── Mission de type SUIVI MANUEL : code partenaire ─── */}
        {mission.type === "manuelle" ? (
          <div className="rounded-md bg-surface border border-border p-3">
            <p className="text-xs text-muted mb-1">Votre code partenaire à communiquer :</p>
            <div className="flex items-center gap-2">
              <code className="text-base font-extrabold text-foreground tracking-wider">{partnerCode}</code>
              <button
                onClick={copyCode}
                className="text-xs font-semibold text-primary hover:underline"
                type="button"
              >
                {copied ? "Copié ✓" : "Copier"}
              </button>
            </div>
          </div>
        ) : alreadyDone ? (
          <p className="text-sm font-semibold text-success-text bg-success-bg rounded-md px-3 py-2 text-center">
            ✅ Mission validée
          </p>
        ) : pending && done === null ? (
          <p className="text-sm font-semibold text-processing-text bg-processing-bg rounded-md px-3 py-2 text-center">
            🕓 Preuve envoyée — en cours de vérification
          </p>
        ) : done !== null ? (
          <p className="text-sm font-semibold text-success-text bg-success-bg rounded-md px-3 py-2 text-center">
            ✅ Capture envoyée{done ? ` (n°${done})` : ""} — on vérifie et on crédite vos points !
          </p>
        ) : (
          /* ─── Mission de type PREUVE : upload de capture ─── */
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              multiple
              onChange={onPick}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full text-sm font-semibold text-foreground border border-dashed border-border rounded-md px-3 py-2 hover:bg-surface transition-colors"
            >
              {files.length > 0
                ? `${files.length} capture${files.length > 1 ? "s" : ""} sélectionnée${files.length > 1 ? "s" : ""}`
                : "📎 Ajouter ma capture d'écran"}
            </button>

            {files.length > 0 && (
              <>
                <input
                  type="email"
                  value={reviewerEmail}
                  onChange={(e) => setReviewerEmail(e.target.value)}
                  placeholder="Email de la personne qui a laissé l'avis (optionnel)"
                  className="w-full text-sm border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optionnel)"
                  rows={2}
                  className="w-full text-sm border border-border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button ref={btnRef} onClick={submit} loading={loading} size="sm" className="w-full">
                  Envoyer ma preuve
                </Button>
              </>
            )}
          </div>
        )}

        {error && <p className="text-xs text-danger text-center">{error}</p>}
      </div>
    </article>
  );
}
