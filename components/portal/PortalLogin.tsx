"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Connexion à l'espace client, en deux temps : l'adresse e-mail, puis le code
 * reçu. Aucun mot de passe — le client n'a rien à retenir, et il n'y a rien à
 * voler.
 *
 * Le message après l'envoi est volontairement neutre (« si un compte existe ») :
 * il reprend mot pour mot ce que renvoie l'API, qui ne dit jamais si l'adresse
 * est connue.
 */
/**
 * Au-delà, on considère que le serveur ne répondra pas.
 *
 * Sans cette limite, `fetch` attend indéfiniment : une base injoignable laissait
 * le bouton sur « Envoi… » pour toujours, sans message, sans recours — le seul
 * état d'interface dont l'utilisateur ne peut pas sortir. Vingt secondes, c'est
 * bien plus qu'il n'en faut pour poser un code et envoyer un e-mail, et assez
 * peu pour qu'on comprenne vite que quelque chose ne va pas.
 */
const TIMEOUT_MS = 20_000;

const postJson = async (url: string, body: unknown): Promise<Response> => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

export default function PortalLogin() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await postJson("/api/portal/request", { email });
      const body = await res.json();
      if (res.status === 429) {
        setError("Trop de demandes. Réessayez dans une heure.");
      } else if (!res.ok) {
        setError("L'envoi a échoué. Réessayez dans un instant.");
      } else {
        setNotice(body?.message ?? null);
        setStep("code");
      }
    } catch (err) {
      // Un abandon sur délai n'est pas une panne de réseau : dire « vérifiez
      // votre connexion » enverrait le client chercher un problème chez lui.
      setError(
        (err as Error)?.name === "AbortError"
          ? "Le serveur ne répond pas. Réessayez dans un instant."
          : "Connexion impossible. Vérifiez votre réseau.",
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await postJson("/api/portal/verify", { email, code });
      if (!res.ok) {
        setError("Code incorrect ou expiré. Demandez-en un nouveau si besoin.");
        return;
      }
      router.replace("/espace-client/accueil");
      router.refresh();
    } catch (err) {
      setError(
        (err as Error)?.name === "AbortError"
          ? "Le serveur ne répond pas. Réessayez dans un instant."
          : "Connexion impossible. Vérifiez votre réseau.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-white p-6">
      {step === "email" ? (
        <form onSubmit={requestCode} className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-foreground">Votre adresse e-mail</span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="prenom.nom@entreprise.fr"
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground outline-none focus:border-primary"
            />
          </label>
          <p className="text-sm text-muted">
            Nous vous envoyons un code à 6 chiffres. Pas de mot de passe à retenir.
          </p>
          <button
            type="submit"
            disabled={busy || !email}
            className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? "Envoi…" : "Recevoir mon code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          {notice && <p className="text-sm text-muted">{notice}</p>}
          <label className="block">
            <span className="text-sm font-semibold text-foreground">Code à 6 chiffres</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-center text-2xl tracking-[0.4em] text-foreground outline-none focus:border-primary"
            />
          </label>
          <p className="text-sm text-muted">Valable 15 minutes, utilisable une seule fois.</p>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? "Vérification…" : "Me connecter"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="w-full text-sm text-muted underline"
          >
            Changer d&apos;adresse e-mail
          </button>
        </form>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-foreground" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
