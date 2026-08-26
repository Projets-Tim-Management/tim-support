import type { Payload } from "payload";

import { ROLES } from "@/core/access";
import { eur } from "@/modules/partner/lib/format";
import { PROFILS } from "@/modules/partner/lib/pricing";
import { adminUrl, escape, internalNotice } from "@/core/lib/email-template";

/**
 * Notifications internes du parcours — envoyées sur événement, pas par le cron.
 *
 * Celles-ci ne peuvent pas attendre la séquence programmée : une demande de
 * phase de test attend une décision de TIM, et personne ne va consulter le
 * back-office « au cas où ».
 *
 * ⚠️ La FABRICATION du message est séparée de son ENVOI (`build…` / `notify…`).
 * L'aperçu du back-office appelle les mêmes `build…` : ce qu'on voit à l'écran
 * est littéralement ce qui partira, pas une maquette qui dériverait avec le
 * temps.
 *
 * Principe de rédaction : un e-mail de validation doit permettre de DÉCIDER
 * sans ouvrir le back-office, ou d'y aller directement au bon endroit. On y met
 * donc les faits (qui, combien, quand), ce qu'il reste à vérifier, et les liens
 * vers chaque fiche concernée — pas seulement « une demande vous attend ».
 */

/** Message prêt à partir — ou à afficher en aperçu. */
export type BuiltEmail = { subject: string; text: string; html: string };


/**
 * Adresses de tous les admins et super-admins, SANS DOUBLON.
 *
 * Le dédoublonnage n'est pas une précaution : `roles` est un select `hasMany`,
 * donc une table à part, et une recherche « roles in (admin, super-admin) »
 * renvoie une ligne PAR RÔLE correspondant. Un compte qui porte les deux — le
 * cas normal d'un super-admin, puisque le rôle `admin` est la valeur par défaut
 * — ressort donc deux fois, son adresse figure deux fois dans le `to`, et il
 * reçoit chaque alerte en double.
 *
 * Comparaison en minuscules et sans espaces : deux comptes distincts écrits
 * « Jean@… » et « jean@… » sont la même boîte aux lettres.
 */
async function adminEmails(payload: Payload): Promise<string[]> {
  const res = await payload.find({
    collection: "users",
    where: { roles: { in: [ROLES.admin, ROLES.superAdmin] } },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  });

  const seen = new Set<string>();
  const out: string[] = [];
  for (const doc of res.docs) {
    const email = (doc as { email?: string }).email?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

const frDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "à définir";

/** Jour ET heure, en heure de Paris : pour un rendez-vous, la date seule ne dit rien. */
const frDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        weekday: "long",
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

export type TestRequestContext = {
  client: {
    id?: number | string;
    companyName?: string | null;
    siren?: string | null;
    email?: string | null;
    totalLicences?: number | null;
    caPaye?: number | null;
  } | null;
  partner: {
    id?: number | string;
    displayName?: string | null;
    societe?: string | null;
    email?: string | null;
  } | null;
  /** Ce qu'il faut contrôler avant de trancher — repris de l'étape du parcours. */
  checklist?: string | null;
};

/**
 * Prévient TIM qu'une phase de test attend son Go / No-Go.
 *
 * Ne lève jamais : un serveur d'e-mail indisponible ne doit pas faire échouer la
 * création du parcours. L'échec est journalisé, la demande reste visible dans le
 * back-office — c'est la notification qui manque, pas la donnée.
 */
export function buildTestRequestEmail(
  run: { id: number | string; startDate?: string | null; endDate?: string | null },
  ctx: TestRequestContext,
): BuiltEmail {
  {
    const client = ctx.client?.companyName ?? "Client";
    const partner = ctx.partner?.displayName ?? ctx.partner?.societe ?? "un partenaire";

    const links = {
      run: adminUrl(`/collections/journey-runs/${run.id}`),
      client: ctx.client?.id ? adminUrl(`/collections/partner-clients/${ctx.client.id}`) : null,
      partner: ctx.partner?.id ? adminUrl(`/collections/partners/${ctx.partner.id}`) : null,
    };

    // Faits utiles à la décision. Une ligne n'apparaît que si l'information
    // existe : un tableau à moitié vide donne l'impression d'un bug.
    const facts: [string, string][] = [
      ["Client", client],
      ...(ctx.client?.siren ? ([["SIREN", ctx.client.siren]] as [string, string][]) : []),
      ...(ctx.client?.email ? ([["Contact", ctx.client.email]] as [string, string][]) : []),
      ["Partenaire", partner],
      ...(ctx.client?.totalLicences
        ? ([["Licences demandées", String(ctx.client.totalLicences)]] as [string, string][])
        : []),
      ...(ctx.client?.caPaye
        ? ([["CA mensuel estimé", `${eur.format(ctx.client.caPaye)} HT`]] as [string, string][])
        : []),
      ["Démarrage prévu", frDate(run.startDate)],
      ["Fin prévue", frDate(run.endDate)],
    ];

    const textLinks = [
      `Valider la demande : ${links.run}`,
      links.client ? `Fiche client      : ${links.client}` : null,
      links.partner ? `Fiche partenaire  : ${links.partner}` : null,
    ].filter(Boolean);

    return {
      subject: `Go / No-Go — phase de test ${client}`,
      text: [
        `${partner} demande une phase de test pour ${client}.`,
        "",
        ...facts.map(([k, v]) => `${k.padEnd(20)}: ${v}`),
        "",
        ...(ctx.checklist ? ["À vérifier avant de valider :", ctx.checklist, ""] : []),
        "Tant que l'étape « Validation TIM » n'est pas validée, le parcours reste en",
        "préparation : aucun accès n'est créé et aucun e-mail ne part chez le client.",
        "",
        ...textLinks,
      ].join("\n"),
      html: `
        <div style="font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#505050;line-height:1.5;max-width:560px">
          <p><strong>${partner}</strong> demande une phase de test pour <strong>${client}</strong>.</p>

          <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
            ${facts
              .map(
                ([k, v]) =>
                  `<tr><td style="padding:3px 16px 3px 0;color:#8a8f98;white-space:nowrap">${k}</td><td><strong>${v}</strong></td></tr>`,
              )
              .join("")}
          </table>

          ${
            ctx.checklist
              ? `<div style="background:#f8f9fb;border-left:3px solid #fe5464;padding:10px 14px;margin:16px 0">
                   <p style="margin:0 0 4px;font-weight:700">À vérifier avant de valider</p>
                   <p style="margin:0;font-size:14px">${ctx.checklist}</p>
                 </div>`
              : ""
          }

          <p style="font-size:14px">Tant que l'étape « Validation TIM » n'est pas validée, le parcours
             reste en préparation : <strong>aucun accès n'est créé et aucun e-mail ne part chez le
             client</strong>.</p>

          <p style="margin-top:24px">
            <a href="${links.run}" style="background:#fe5464;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">
              Valider la demande
            </a>
          </p>

          <p style="font-size:13px;color:#8a8f98;margin-top:16px">
            ${links.client ? `<a href="${links.client}" style="color:#8a8f98">Fiche client</a>` : ""}
            ${links.client && links.partner ? " · " : ""}
            ${links.partner ? `<a href="${links.partner}" style="color:#8a8f98">Fiche partenaire</a>` : ""}
          </p>
        </div>`,
    };
  }
}

/**
 * Prévient TIM qu'une phase de test attend son Go / No-Go.
 *
 * Ne lève jamais : un serveur d'e-mail indisponible ne doit pas faire échouer la
 * création du parcours. L'échec est journalisé, la demande reste visible dans le
 * back-office — c'est la notification qui manque, pas la donnée.
 */
export async function notifyAdminsTestRequested(
  payload: Payload,
  run: { id: number | string; startDate?: string | null; endDate?: string | null },
  ctx: TestRequestContext,
): Promise<void> {
  try {
    const to = await adminEmails(payload);
    if (to.length === 0) {
      payload.logger.warn("[parcours] aucune adresse admin : demande de phase de test non notifiée.");
      return;
    }
    await payload.sendEmail({ to: to.join(","), ...buildTestRequestEmail(run, ctx) });
    payload.logger.info(`[parcours] demande de phase de test notifiée à ${to.length} admin(s).`);
  } catch (err) {
    payload.logger.error(`[parcours] notification de la demande de phase de test échouée : ${err}`);
  }
}

export type QuoteContext = {
  client: {
    id?: number | string;
    companyName?: string | null;
    siren?: string | null;
    email?: string | null;
    raisonSociale?: string | null;
    billingAddress?: string | null;
    caPaye?: number | null;
    /** Quantités et prix par profil, saisis sur la fiche client. */
    licences?: Record<string, number | undefined> | null;
  } | null;
  partner: { id?: number | string; displayName?: string | null; email?: string | null } | null;
};

/**
 * Demande à TIM de rédiger le devis.
 *
 * Le partenaire transmet le devis à son client, mais c'est TIM qui l'établit :
 * sans cet envoi, personne ne saurait qu'il y a un document à produire, et
 * l'étape « Devis transmis » resterait bloquée en attendant que quelqu'un s'en
 * aperçoive.
 *
 * L'e-mail porte le périmètre chiffré ligne à ligne — c'est exactement ce qu'il
 * faut recopier dans le devis, sans rouvrir la fiche.
 */
export function buildQuoteEmail(
  run: { id: number | string; endDate?: string | null },
  ctx: QuoteContext,
): BuiltEmail {
  {
    const client = ctx.client?.companyName ?? "Client";
    const partner = ctx.partner?.displayName ?? "le partenaire";
    const lic = ctx.client?.licences ?? {};

    // Une ligne par profil réellement commandé : un devis à zéro licence sur
    // trois profils n'apprend rien et allonge la lecture.
    const lines = PROFILS.map((profil) => {
      const qty = Number(lic[`${profil.key}Qty`] ?? 0);
      const price = Number(lic[`${profil.key}Price`] ?? 0);
      return { label: profil.label, qty, price, total: qty * price };
    }).filter((l) => l.qty > 0);

    const totalQty = lines.reduce((n, l) => n + l.qty, 0);
    const totalHT = lines.reduce((n, l) => n + l.total, 0);

    const links = {
      client: ctx.client?.id ? adminUrl(`/collections/partner-clients/${ctx.client.id}`) : null,
      run: adminUrl(`/collections/journey-runs/${run.id}`),
    };

    const facts: [string, string][] = [
      ["Client", client],
      ...(ctx.client?.raisonSociale ? ([["Raison sociale", ctx.client.raisonSociale]] as [string, string][]) : []),
      ...(ctx.client?.siren ? ([["SIREN", ctx.client.siren]] as [string, string][]) : []),
      ...(ctx.client?.billingAddress ? ([["Facturation", ctx.client.billingAddress]] as [string, string][]) : []),
      ...(ctx.client?.email ? ([["E-mail de facturation", ctx.client.email]] as [string, string][]) : []),
      ["À transmettre par", partner],
      ["Fin du test", frDate(run.endDate)],
    ];

    const lineText = lines.length
      ? lines.map((l) => `  ${l.label.padEnd(20)} ${String(l.qty).padStart(3)} × ${eur.format(l.price)} = ${eur.format(l.total)}`)
      : ["  (aucune licence saisie sur la fiche client)"];

    return {
      subject: `Devis à rédiger — ${client}`,
      text: [
        `${client} souhaite continuer après sa phase de test.`,
        `Le devis est à établir par TIM ; ${partner} le transmettra au client.`,
        "",
        ...facts.map(([k, v]) => `${k.padEnd(22)}: ${v}`),
        "",
        "Périmètre à chiffrer :",
        ...lineText,
        `  ${"TOTAL".padEnd(20)} ${String(totalQty).padStart(3)} licences   ${eur.format(totalHT)} HT / mois`,
        "",
        ...(links.client ? [`Fiche client (licences) : ${links.client}`] : []),
        `Phase de test           : ${links.run}`,
      ].join("\n"),
      html: `
        <div style="font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#505050;line-height:1.5;max-width:560px">
          <p><strong>${client}</strong> souhaite continuer après sa phase de test.</p>
          <p style="font-size:14px">Le devis est à établir par <strong>TIM</strong> ;
             <strong>${partner}</strong> le transmettra au client.</p>

          <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
            ${facts
              .map(
                ([k, v]) =>
                  `<tr><td style="padding:3px 16px 3px 0;color:#8a8f98;white-space:nowrap">${k}</td><td><strong>${v}</strong></td></tr>`,
              )
              .join("")}
          </table>

          <p style="margin:16px 0 6px;font-weight:700">Périmètre à chiffrer</p>
          <table style="border-collapse:collapse;font-size:14px;width:100%">
            <thead>
              <tr style="color:#8a8f98;font-size:12px;text-transform:uppercase">
                <th align="left" style="padding:4px 8px 4px 0">Profil</th>
                <th align="right" style="padding:4px 8px">Qté</th>
                <th align="right" style="padding:4px 8px">Prix</th>
                <th align="right" style="padding:4px 0 4px 8px">Sous-total</th>
              </tr>
            </thead>
            <tbody>
              ${
                lines.length
                  ? lines
                      .map(
                        (l) =>
                          `<tr style="border-top:1px solid #eceef2">
                             <td style="padding:4px 8px 4px 0">${l.label}</td>
                             <td align="right" style="padding:4px 8px">${l.qty}</td>
                             <td align="right" style="padding:4px 8px">${eur.format(l.price)}</td>
                             <td align="right" style="padding:4px 0 4px 8px">${eur.format(l.total)}</td>
                           </tr>`,
                      )
                      .join("")
                  : `<tr><td colspan="4" style="padding:8px 0;color:#8a8f98">Aucune licence saisie sur la fiche client.</td></tr>`
              }
              <tr style="border-top:2px solid #d2d2d6;font-weight:700">
                <td style="padding:6px 8px 6px 0">Total</td>
                <td align="right" style="padding:6px 8px">${totalQty}</td>
                <td></td>
                <td align="right" style="padding:6px 0 6px 8px">${eur.format(totalHT)} HT / mois</td>
              </tr>
            </tbody>
          </table>

          <p style="margin-top:24px">
            ${
              links.client
                ? `<a href="${links.client}" style="background:#fe5464;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Ouvrir la fiche client</a>`
                : ""
            }
          </p>
          <p style="font-size:13px;color:#8a8f98">
            <a href="${links.run}" style="color:#8a8f98">Voir la phase de test</a>
          </p>
        </div>`,
    };
  }
}

/** Demande à TIM de rédiger le devis. Silencieux en cas d'échec d'envoi. */
export async function notifyAdminsQuoteNeeded(
  payload: Payload,
  run: { id: number | string; endDate?: string | null },
  ctx: QuoteContext,
): Promise<void> {
  try {
    const to = await adminEmails(payload);
    if (to.length === 0) {
      payload.logger.warn("[parcours] aucune adresse admin : devis à rédiger non notifié.");
      return;
    }
    await payload.sendEmail({ to: to.join(","), ...buildQuoteEmail(run, ctx) });
    payload.logger.info(`[parcours] devis à rédiger notifié à ${to.length} admin(s).`);
  } catch (err) {
    payload.logger.error(`[parcours] notification « devis à rédiger » échouée : ${err}`);
  }
}

/** Contexte commun aux deux alertes internes restantes. */
export type SimpleNoticeContext = {
  clientName?: string | null;
  partnerName?: string | null;
  clientId?: number | string | null;
};

/** TIM doit contrôler le dossier de démarrage que le client vient de transmettre. */
export function buildDossierToCheckEmail(
  run: { id: number | string },
  ctx: SimpleNoticeContext,
): BuiltEmail {
  const client = ctx.clientName ?? "Un client";
  const rows: [string, string][] = [
    ["Client", client],
    ...(ctx.partnerName ? ([["Partenaire", ctx.partnerName]] as [string, string][]) : []),
  ];
  return {
    subject: `Dossier de démarrage à vérifier — ${client}`,
    text: [
      `${client} vient de transmettre son dossier de démarrage.`,
      "",
      "À contrôler avant de créer les comptes : cohérence des licences déclarées,",
      "identités des salariés, chantiers renseignés.",
      "",
      "Le dossier est copiable tableau par tableau depuis l'onglet « Dossier & accès » :",
      ctx.clientId
        ? adminUrl(`/collections/partner-clients/${ctx.clientId}`)
        : adminUrl(`/collections/journey-runs/${run.id}`),
    ].join("\n"),
    html: internalNotice({
      heading: "Dossier de démarrage à vérifier",
      rows,
      message:
        "À contrôler avant de créer les comptes : cohérence des licences déclarées, identités des salariés, chantiers renseignés.",
      // Le bouton mène à la FICHE CLIENT, pas à la phase de test : le travail qui
      // suit ce message est de recopier le dossier dans TIM et de créer les
      // accès, et c'est là que ça se fait (onglet « Dossier & accès »).
      // Le parcours ne sert qu'à suivre l'avancement.
      cta: ctx.clientId
        ? { label: "Préparer les accès", url: adminUrl(`/collections/partner-clients/${ctx.clientId}`) }
        : { label: "Ouvrir la phase de test", url: adminUrl(`/collections/journey-runs/${run.id}`) },
      links: [{ label: "Phase de test", url: adminUrl(`/collections/journey-runs/${run.id}`) }],
    }),
  };
}

/** Le partenaire demande à TIM d'établir le contrat. */
export function buildContractRequestEmail(
  run: { id: number | string },
  ctx: SimpleNoticeContext,
): BuiltEmail {
  const client = ctx.clientName ?? "Un client";
  const partner = ctx.partnerName ?? "Le partenaire";
  return {
    subject: `Contrat à établir — ${client}`,
    text: [
      `${partner} demande le contrat pour ${client}.`,
      "",
      "Le devis a été transmis et accepté. Le contrat est à rédiger par TIM :",
      "mode de paiement, conditions de règlement, TVA.",
      "",
      `${adminUrl(`/collections/journey-runs/${run.id}`)}`,
    ].join("\n"),
    html: internalNotice({
      heading: "Contrat à établir",
      rows: [
        ["Client", client],
        ["Demandé par", partner],
      ],
      message:
        "Le devis a été transmis et accepté. Le contrat est à rédiger par TIM : mode de paiement, conditions de règlement, TVA.",
      cta: { label: "Ouvrir la phase de test", url: adminUrl(`/collections/journey-runs/${run.id}`) },
      links: ctx.clientId
        ? [{ label: "Fiche client (onglet Contrat)", url: adminUrl(`/collections/partner-clients/${ctx.clientId}`) }]
        : [],
    }),
  };
}

/**
 * Le partenaire vient de demander le contrat : TIM doit le rédiger.
 *
 * Cet envoi est la CONTREPARTIE de l'étape « Demande de contrat à TIM » : c'est
 * ce qui fait que la valider soit un geste et pas une coche. Sans lui, le
 * partenaire déclarait sa demande dans une fiche que personne ne surveille.
 */
export async function notifyAdminsContractNeeded(
  payload: Payload,
  run: { id: number | string },
  ctx: SimpleNoticeContext,
): Promise<void> {
  try {
    const to = await adminEmails(payload);
    if (to.length === 0) {
      payload.logger.warn("[parcours] aucune adresse admin : demande de contrat non notifiée.");
      return;
    }
    await payload.sendEmail({ to: to.join(","), ...buildContractRequestEmail(run, ctx) });
    payload.logger.info(`[parcours] demande de contrat notifiée à ${to.length} admin(s).`);
  } catch (err) {
    payload.logger.error(`[parcours] notification « contrat à établir » échouée : ${err}`);
  }
}

/**
 * Le client vient de transmettre son dossier : TIM doit le contrôler avant de
 * créer les comptes. L'accusé de réception part au client, celui-ci à TIM.
 */
export async function notifyAdminsDossierToCheck(
  payload: Payload,
  run: { id: number | string },
  ctx: SimpleNoticeContext,
): Promise<void> {
  try {
    const to = await adminEmails(payload);
    if (to.length === 0) {
      payload.logger.warn("[parcours] aucune adresse admin : dossier à vérifier non notifié.");
      return;
    }
    await payload.sendEmail({ to: to.join(","), ...buildDossierToCheckEmail(run, ctx) });
    payload.logger.info(`[parcours] dossier à vérifier notifié à ${to.length} admin(s).`);
  } catch (err) {
    payload.logger.error(`[parcours] notification « dossier à vérifier » échouée : ${err}`);
  }
}

/**
 * Un client vient de réserver sa session de prise en main.
 *
 * L'équipe l'apprenait en ouvrant la fiche, c'est-à-dire souvent après coup. Or
 * c'est l'étape qui décide de la première semaine du test : savoir qu'elle est
 * calée — et avec qui — permet de s'en occuper avant, pas de le constater après.
 */
export async function notifyAdminsSessionBooked(
  payload: Payload,
  run: { id: number | string },
  ctx: SimpleNoticeContext & {
    when?: string | null;
    modality?: string | null;
    attendees?: string[];
  },
): Promise<void> {
  try {
    const to = await adminEmails(payload);
    if (to.length === 0) {
      payload.logger.warn("[parcours] aucune adresse admin : créneau réservé non notifié.");
      return;
    }

    const client = ctx.clientName ?? "Un client";
    const when = ctx.when ? frDateTime(ctx.when) : null;
    const people = (ctx.attendees ?? []).filter((a) => a && a.trim() && !a.startsWith(" —"));
    const url = adminUrl(`/collections/journey-runs/${run.id}`);

    await payload.sendEmail({
      to: to.join(","),
      subject: `Prise en main calée — ${client}`,
      text: [
        `${client} a réservé sa session de prise en main.`,
        "",
        when ? `Quand : ${when}` : "",
        ctx.modality ? `Où    : ${ctx.modality}` : "",
        ctx.partnerName ? `Anime : ${ctx.partnerName}` : "",
        "",
        ...(people.length ? ["Participants annoncés :", ...people.map((p) => `  • ${p}`), ""] : []),
        url,
      ]
        .filter((l) => l !== "")
        .join("\n"),
      html: internalNotice({
        heading: "Prise en main calée",
        rows: [
          ["Client", escape(client)],
          ...(when ? ([["Quand", escape(when)]] as [string, string][]) : []),
          ...(ctx.modality ? ([["Où", escape(ctx.modality)]] as [string, string][]) : []),
          ...(ctx.partnerName ? ([["Animée par", escape(ctx.partnerName)]] as [string, string][]) : []),
        ],
        message: people.length
          ? `Participants annoncés : ${people.map(escape).join(" · ")}`
          : "Aucun participant n'a été déclaré au moment de la réservation.",
        cta: { label: "Ouvrir la phase de test", url },
        links: ctx.clientId
          ? [{ label: "Fiche client", url: adminUrl(`/collections/partner-clients/${ctx.clientId}`) }]
          : [],
      }),
    });
  } catch (err) {
    payload.logger.error(`[parcours] notification « prise en main calée » échouée : ${err}`);
  }
}

/**
 * Les accès d'un client devaient partir aujourd'hui — ils n'existent pas.
 *
 * Le cron retient l'envoi plutôt que d'annoncer des identifiants inexistants un
 * matin de démarrage. Cette alerte est le pendant nécessaire de cette retenue :
 * sans elle, la rétention serait silencieuse et personne ne créerait les comptes.
 */
export async function notifyAdminsAccessMissing(
  payload: Payload,
  run: { id: number | string; startDate?: string | null },
  clientName?: string | null,
): Promise<void> {
  try {
    const to = await adminEmails(payload);
    if (to.length === 0) return;

    const url = adminUrl(`/collections/journey-runs/${run.id}`);
    const html = internalNotice({
      heading: "Accès à créer aujourd'hui",
      rows: [
        ["Client", escape(clientName ?? "—")],
        ["Démarrage", frDate(run.startDate)],
      ],
      message:
        "L'e-mail de remise des accès devait partir maintenant, mais aucun identifiant n'a été créé pour ce client. L'envoi est RETENU : il repartira tout seul dès que les accès seront enregistrés.",
      cta: { label: "Créer les accès", url },
    });

    await payload.sendEmail({
      to: to.join(","),
      subject: `⚠️ Accès manquants — ${clientName ?? `parcours ${run.id}`}`,
      html,
      text:
        `Les accès de ${clientName ?? `parcours ${run.id}`} devaient être remis aujourd'hui, ` +
        `mais aucun identifiant n'existe. L'envoi est retenu jusqu'à leur création.\n\n${url}`,
    });
  } catch (err) {
    payload.logger.error(`[parcours] alerte « accès manquants » échouée : ${err}`);
  }
}
