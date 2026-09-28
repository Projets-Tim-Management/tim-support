import type { GlobalConfig, Payload } from "payload";

import { isAdmin } from "@/core/access";
import {
  DEFAULT_CONTRACT_SECTIONS,
  DEFAULT_CONTRACT_TITLE,
} from "@/modules/partner/lib/contract-template.default";
import { CONTRACT_DEFAULTS } from "@/modules/partner/lib/contract-vars";

/**
 * Système → « Contrat » : le modèle du contrat SaaS et ses valeurs par défaut.
 * L'identité du prestataire et sa banque vivent sur la page « Entreprise »
 * (core/globals/CompanySettings) : elles servent au-delà du contrat.
 *
 * Réservé à TIM. Le modèle est découpé en SECTIONS (parties, articles,
 * annexes), chacune modifiable dans un champ texte ; la syntaxe (variables
 * `{{…}}`, passages `[[si …]]`) est rappelée sous le champ. Chaque
 * enregistrement qui touche au texte incrémente la VERSION du modèle : un
 * contrat généré garde la version dont il est issu.
 *
 * Semé au démarrage depuis contract-template.default.ts quand il est vide,
 * jamais écrasé ensuite.
 */

const SYNTAX_HELP =
  "Paragraphes séparés par une ligne vide. « - » en début de ligne : liste. « ### » : sous-titre. **gras**. " +
  "« Terme :: définition » : ligne du tableau de définitions. « > » en début de ligne : aligné à droite ; « ^ » : centré. " +
  "Variables : {{client.denomination}}, {{client.formeSociale}}, {{client.capital}}, {{client.adresse}}, {{client.villeRcs}}, " +
  "{{client.numeroRcs}}, {{representant.nom}}, {{representant.qualite}}, {{engagement.duree}}, {{denonciation.preavis}}, " +
  "{{tarifs.delaiInformation}}, {{territoire}}, {{tarifPreferentiel.duree}}, {{prelevement.jour}}, {{integration.montant}}, " +
  "{{banque.iban}}, {{banque.bic}}, {{prestataire.…}}. Blocs seuls sur leur ligne : {{licences.tableau}}, {{signatures}}. " +
  "Passage conditionnel : [[si integration.offerte]] … [[sinon]] … [[/si]].";

/** « Article 12 – Données personnelles » → « article-12-donnees-personnelles ». */
const slugOf = (title: unknown): string =>
  String(title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "section";

/**
 * Une section ajoutée dans l'admin arrive sans clé (le champ est en lecture
 * seule) : elle en reçoit une, unique, tirée de son titre. Sans clé, un contrat
 * ne pourrait pas la personnaliser (les versions propres à un client sont
 * rangées par clé).
 */
export function withSectionKeys<T extends { key?: string | null; title?: string | null }>(sections: T[]): T[] {
  const taken = new Set(sections.map((sec) => sec.key).filter(Boolean));
  // Une ligne DUPLIQUÉE dans l'admin copie la clé : la première garde la
  // sienne (ses personnalisations suivent), la copie en reçoit une neuve.
  const seen = new Set<string>();
  return sections.map((sec) => {
    if (sec.key && !seen.has(sec.key)) {
      seen.add(sec.key);
      return sec;
    }
    const base = slugOf(sec.title);
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
    taken.add(key);
    seen.add(key);
    return { ...sec, key };
  });
}

export const ContractSettings: GlobalConfig = {
  slug: "contract-settings",
  label: "Contrat",
  admin: {
    group: "Système",
    description:
      "Le modèle du contrat SaaS : le texte, section par section, et ses valeurs par défaut. L'identité du prestataire et ses coordonnées bancaires se règlent sur la page « Entreprise ». Réservé à TIM.",
  },
  access: { read: isAdmin, update: isAdmin },
  hooks: {
    beforeChange: [
      ({ data }) =>
        Array.isArray(data?.sections) ? { ...data, sections: withSectionKeys(data.sections) } : data,
      // Nouvelle version du modèle dès que le texte change.
      ({ data, originalDoc }) => {
        const before = JSON.stringify({ t: originalDoc?.title, s: originalDoc?.sections ?? [] });
        // Une mise à jour partielle (sans le texte) ne change pas de version.
        const after = JSON.stringify({ t: data?.title ?? originalDoc?.title, s: data?.sections ?? originalDoc?.sections ?? [] });
        const version = Number(originalDoc?.templateVersion ?? 0) || 0;
        return before === after ? data : { ...data, templateVersion: version + 1 };
      },
    ],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Modèle",
          fields: [
            { name: "title", type: "text", label: "Titre du contrat", required: true },
            {
              name: "templateVersion",
              type: "number",
              label: "Version du modèle",
              admin: { readOnly: true, description: "Incrémentée à chaque modification du texte." },
            },
            {
              name: "sections",
              type: "array",
              label: "Sections",
              labels: { singular: "Section", plural: "Sections" },
              admin: { description: SYNTAX_HELP, initCollapsed: true },
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "title", type: "text", label: "Titre", admin: { width: "60%" } },
                    {
                      name: "kind",
                      type: "select",
                      label: "Type",
                      defaultValue: "article",
                      options: [
                        { label: "Préambule", value: "preambule" },
                        { label: "Article", value: "article" },
                        { label: "Annexe (nouvelle page)", value: "annexe" },
                      ],
                      admin: { width: "20%" },
                    },
                    { name: "key", type: "text", label: "Clé", admin: { width: "20%", readOnly: true } },
                  ],
                },
                { name: "body", type: "textarea", label: "Texte", admin: { rows: 14 } },
              ],
            },
          ],
        },
        {
          label: "Valeurs par défaut",
          fields: [
            {
              name: "defaults",
              type: "group",
              label: false,
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "noticePeriod",
                      type: "text",
                      label: "Préavis de dénonciation",
                      defaultValue: CONTRACT_DEFAULTS.noticePeriod,
                      admin: { width: "50%" },
                    },
                    {
                      name: "priceNoticeDelay",
                      type: "text",
                      label: "Délai d'information tarifaire",
                      defaultValue: CONTRACT_DEFAULTS.priceNoticeDelay,
                      admin: { width: "50%" },
                    },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "debitDay",
                      type: "number",
                      label: "Jour de prélèvement",
                      defaultValue: CONTRACT_DEFAULTS.debitDay,
                      min: 1,
                      max: 28,
                      admin: { width: "50%" },
                    },
                    {
                      name: "territory",
                      type: "text",
                      label: "Territoire par défaut",
                      defaultValue: CONTRACT_DEFAULTS.territory,
                      admin: { width: "50%" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** Sème le modèle livré avec le code si la page est vide. Jamais d'écrasement. */
export async function seedContractSettings(payload: Payload): Promise<void> {
  try {
    const current = (await payload.findGlobal({ slug: "contract-settings", depth: 0, overrideAccess: true })) as {
      sections?: unknown[];
    };
    if (current?.sections?.length) return;
    await payload.updateGlobal({
      slug: "contract-settings",
      overrideAccess: true,
      data: {
        title: DEFAULT_CONTRACT_TITLE,
        sections: DEFAULT_CONTRACT_SECTIONS.map((s) => ({ key: s.key, title: s.title, kind: s.kind, body: s.body })),
        defaults: {
          noticePeriod: CONTRACT_DEFAULTS.noticePeriod,
          priceNoticeDelay: CONTRACT_DEFAULTS.priceNoticeDelay,
          debitDay: CONTRACT_DEFAULTS.debitDay,
          territory: CONTRACT_DEFAULTS.territory,
        },
      } as never,
    });
    payload.logger.info(`[contrat] modèle semé (${DEFAULT_CONTRACT_SECTIONS.length} sections).`);
  } catch (err) {
    // Cas normal avant la migration : la table n'existe pas encore.
    payload.logger.error(`[contrat] seed du modèle échoué : ${err}`);
  }
}
