"use client";

/**
 * Garde-fou global (ErrorBoundary racine). Remplace tout l'arbre en cas
 * d'erreur non rattrapée — y compris dans le layout racine et l'admin Payload —
 * pour afficher un message lisible plutôt qu'un écran blanc. Le `digest`
 * permet de retrouver la trace complète dans les logs Vercel.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
          background: "#f6f7f9",
          color: "#2b2b2b",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            background: "#fff",
            border: "1px solid #e6e8ec",
            borderRadius: 14,
            padding: 32,
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700 }}>
            Une erreur est survenue
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: 15, lineHeight: 1.6, color: "#505050" }}>
            La page n'a pas pu s'afficher. Vous pouvez réessayer&nbsp;; si le
            problème persiste, communiquez le code ci-dessous au support.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "0 0 20px",
                fontSize: 12,
                color: "#8a8f98",
                fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
              }}
            >
              Réf. : {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              cursor: "pointer",
              border: "none",
              borderRadius: 10,
              padding: "12px 22px",
              fontSize: 15,
              fontWeight: 600,
              color: "#fff",
              background: "#fe5464",
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
