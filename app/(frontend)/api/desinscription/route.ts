import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { escape } from "@/core/lib/email-template";
import { readUnsubscribeToken, suppress } from "@/core/lib/email-suppression";

/**
 * Désinscription des envois commerciaux.
 *
 * Deux entrées, la même conséquence :
 *  - `GET ?t=…`  : le lien cliqué dans un e-mail, qui renvoie une page ;
 *  - `POST`      : le bouton natif « Se désabonner » de Gmail et d'Apple Mail
 *                  (RFC 8058), appelé SANS interaction de la personne.
 *
 * Aucune authentification : quelqu'un qui veut qu'on cesse de lui écrire ne doit
 * pas avoir de compte à créer pour l'obtenir. La signature du jeton suffit —
 * sans elle, on désinscrirait n'importe qui en devinant une adresse.
 *
 * Le POST ne doit RIEN demander de plus : Gmail l'appelle en arrière-plan, et
 * une page de confirmation à valider ferait échouer la désinscription en
 * silence, alors que le bouton aura dit à la personne que c'était fait.
 */

export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://support.tim-management.co").replace(/\/$/, "");

const page = (title: string, message: string, tone: "ok" | "ko"): string => `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#eef0f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:48px 20px;">
    <div style="background:#ffffff;border:1px solid #e6e8ef;border-radius:18px;padding:36px 32px;text-align:center;">
      <div style="width:54px;height:54px;margin:0 auto 20px;border-radius:50%;background:${tone === "ok" ? "#e3f5e9" : "#fdf0dd"};line-height:54px;font-size:26px;">${tone === "ok" ? "✓" : "!"}</div>
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#22242c;">${title}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a4d57;">${message}</p>
      <a href="${SITE}/contact" style="display:inline-block;padding:12px 24px;background:#fe5464;border-radius:9px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Nous contacter</a>
    </div>
    <p style="margin:20px 0 0;text-align:center;font-size:12px;color:#8a8f98;">TIM MANAGEMENT · 44 quai Jayr, 69009 Lyon</p>
  </div>
</body></html>`;

const html = (body: string, status = 200) =>
  new NextResponse(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });

/** @returns l'adresse désinscrite, ou `null` si le jeton ne vaut rien. */
async function unsubscribe(token: string | null): Promise<string | null> {
  const email = readUnsubscribeToken(token);
  if (!email) return null;
  const payload = await payloadClient();
  await suppress(payload, email, "desinscription", "Lien de désinscription");
  return email;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t");
  try {
    const email = await unsubscribe(token);
    if (!email) {
      return html(
        page(
          "Ce lien n'est plus valable",
          "Nous n'avons pas pu identifier l'adresse à désinscrire. Écrivez-nous et nous nous en chargeons.",
          "ko",
        ),
        400,
      );
    }
    return html(
      page(
        "C'est fait",
        `<strong>${escape(email)}</strong> ne recevra plus nos messages commerciaux.<br><br>` +
          "Vous continuerez de recevoir les réponses à vos demandes et les messages liés à votre dossier — ceux-là répondent à une action de votre part.",
        "ok",
      ),
    );
  } catch (err) {
    console.error("[désinscription] échec :", err);
    return html(
      page(
        "Une erreur est survenue",
        "Votre demande n'a pas pu être enregistrée. Écrivez-nous, nous la traiterons à la main.",
        "ko",
      ),
      503,
    );
  }
}

/**
 * Désinscription en un clic (RFC 8058). Réponse volontairement muette : c'est le
 * client de messagerie qui affiche la confirmation, pas nous.
 */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("t");
  try {
    const email = await unsubscribe(token);
    return NextResponse.json(
      email ? { ok: true } : { error: "invalid_token" },
      { status: email ? 200 : 400, headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[désinscription] échec (un clic) :", err);
    return NextResponse.json({ error: "server_error" }, { status: 503 });
  }
}
