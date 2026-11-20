"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { RunNowButton } from "@/modules/ai-team/admin/RunNowButton";

type Account = { platform: "youtube" | "meta"; label: string; igUsername: string | null; accountEmail: string | null; status: string; lastError: string | null };

const YT_NOTICE: Record<string, string> = {
  connecte: "Chaîne YouTube branchée.",
  annule: "Connexion annulée chez Google — rien n'a changé.",
  etat_invalide: "La demande a expiré ou ne vient pas de vous : relancez « Brancher YouTube ».",
  sans_jeton_durable: "Google n'a pas donné d'accès durable : retirez « TIM Support » des applications de votre compte Google, puis rebranchez.",
  aucune_chaine: "Ce compte Google n'a pas de chaîne YouTube : choisissez le compte (ou la chaîne de marque) de TIM à l'écran Google.",
  echec: "La connexion a échoué.",
};

/** « Lancer maintenant » : le rapport réseaux & vidéo de Cléo (une à deux minutes). */
export function SocialButton({ name }: { name: string }) {
  return (
    <RunNowButton<{ findings?: number }>
      url="/api/admin/ai-team/social"
      intro={
        <>
          🎬 <strong>Réseaux & vidéo</strong> : chaque semaine, {name} lit vos comptes, regarde ce que publient les concurrents, et vous donne les contenus à faire et les personnes à relancer.
        </>
      }
      label="Lancer maintenant"
      busyLabel={`${name} lit vos réseaux… (1 à 3 minutes)`}
      done={(d) => `${d.findings ?? 0} action${(d.findings ?? 0) > 1 ? "s" : ""} — Sergey les reprendra dans vos objectifs.`}
      failed="Le rapport n'a pas pu être fait."
    />
  );
}

/** Brancher / débrancher YouTube (consentement Google) et Facebook + Instagram (jeton d'utilisateur système). */
export function SocialConnect({ accounts, youtubeReady, notice }: { accounts: Account[]; youtubeReady: boolean; notice: string | null }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(notice ? (YT_NOTICE[notice] ?? null) : null);
  const yt = accounts.find((a) => a.platform === "youtube");
  const meta = accounts.find((a) => a.platform === "meta");

  const call = async (method: "POST" | "DELETE", body: Record<string, unknown>, ok: (d: Record<string, unknown>) => string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ai-team/social/accounts", { method, credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "La demande a échoué.");
      setMsg(ok(data));
      setToken("");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "La demande a échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ait-score">
      <h3 className="ait-h3">🔌 Les comptes qu&apos;elle lit</h3>
      <ul className="ait-score__headlines">
        <li>
          <strong>YouTube</strong> —{" "}
          {yt ? (
            <>
              {yt.label}
              {/* Une chaîne de marque a une adresse technique (…@pages.plusgoogle.com) : elle ne dit rien à personne. */}
              {yt.accountEmail && !yt.accountEmail.endsWith("@pages.plusgoogle.com") ? ` (autorisé par ${yt.accountEmail})` : ""}
              {yt.status === "erreur" && <span className="ait-score__rate"> · ⚠️ {yt.lastError}</span>}{" "}
              <button type="button" className="ait-review__btn" disabled={busy} onClick={() => call("DELETE", { platform: "youtube" }, () => "YouTube débranché.")}>
                Débrancher
              </button>
            </>
          ) : youtubeReady ? (
            <a className="ait-review__btn" href="/api/admin/ai-team/social/youtube/connect">
              Brancher YouTube
            </a>
          ) : (
            "l'application OAuth YouTube n'est pas configurée (YOUTUBE_CLIENT_ID)."
          )}
        </li>
        <li>
          <strong>Facebook & Instagram</strong> —{" "}
          {meta ? (
            <>
              page {meta.label}
              {meta.igUsername ? ` · Instagram @${meta.igUsername}` : " · aucun compte Instagram relié à la page"}
              {meta.status === "erreur" && <span className="ait-score__rate"> · ⚠️ {meta.lastError}</span>}{" "}
              <button type="button" className="ait-review__btn" disabled={busy} onClick={() => call("DELETE", { platform: "meta" }, () => "Facebook et Instagram débranchés.")}>
                Débrancher
              </button>
            </>
          ) : (
            "pas encore branchés."
          )}
        </li>
        <li>
          <strong>LinkedIn</strong> — en attente de la validation de LinkedIn ; d&apos;ici là, Cléo lit ce que LinkedIn amène sur le site (visites, leads, clients).
        </li>
      </ul>
      {!meta && (
        <form
          className="ait-chat__form"
          onSubmit={(e) => {
            e.preventDefault();
            void call("POST", { token }, (d) => `Page ${String(d.page)} branchée${d.instagram ? `, avec Instagram @${String(d.instagram)}` : " (aucun Instagram relié)"}.`);
          }}
        >
          <input className="ait-chat__input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Jeton d'utilisateur système Meta (pages et Instagram en lecture)" aria-label="Jeton d'utilisateur système Meta" />
          <button type="submit" className="ait-chat__send" disabled={busy || !token.trim()}>
            Brancher Facebook & Instagram
          </button>
        </form>
      )}
      {msg && (
        <p className="ait-review__msg" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
