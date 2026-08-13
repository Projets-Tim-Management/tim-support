import { FONT, escape, paragraph, refBox, shell } from "@/core/lib/email-template";

/**
 * Code de consultation des accès d'un client, envoyé à l'administrateur qui le
 * demande.
 *
 * Le message dit explicitement ce qui va être tracé. Ce n'est pas une formalité :
 * c'est la trace, plus que le code, qui protège ces mots de passe — encore
 * faut-il que celui qui les consulte le sache au moment de le faire.
 */
export function revealCodeEmail(code: string, clientName?: string | null, ttlMin = 10) {
  const who = clientName ? escape(clientName) : "un client";
  return {
    subject: `Code de consultation des accès — ${clientName ?? "client"}`,
    html: shell({
      heading: "Votre code de consultation",
      preheader: `Valable ${ttlMin} minutes.`,
      bodyHtml:
        paragraph(
          `Vous avez demandé à afficher les mots de passe des accès de <strong>${who}</strong>.`,
        ) +
        refBox("Code", code) +
        paragraph(
          `Il est valable <strong>${ttlMin} minutes</strong> et ne sert qu'une fois.`,
        ) +
        paragraph(
          `<span style="font-family:${FONT};font-size:14px;">Cette consultation est enregistrée à votre nom. Si vous n'êtes pas à l'origine de cette demande, ne saisissez pas ce code et prévenez l'équipe.</span>`,
        ),
    }),
    text:
      `Vous avez demandé à afficher les mots de passe des accès de ${clientName ?? "un client"}.\n\n` +
      `Code : ${code}\n\n` +
      `Valable ${ttlMin} minutes, utilisable une seule fois.\n\n` +
      `Cette consultation est enregistrée à votre nom. Si vous n'êtes pas à l'origine de cette demande, ne saisissez pas ce code et prévenez l'équipe.`,
  };
}
