import {
  CRON_GRACE_MINUTES,
  nextCronPass,
  raisonSansObjet,
  type SendFacts,
} from "@/modules/marketing/lib/due-emails";

/**
 * Croiser ce que le parcours a PRÉVU avec ce que Brevo a réellement fait.
 *
 * La barre d'étapes dit « envoyé » ou « à envoyer ». C'est ce que le logiciel
 * croit — pas ce que le client a reçu. Un message parti puis rejeté par le
 * serveur d'en face y figure comme envoyé, et personne ne l'apprend. Cette
 * fonction met les deux côte à côte.
 */

/** Une ligne d'envoi du parcours. */
export type EnvoiPrevu = {
  key?: string | null;
  subject?: string | null;
  audience?: string | null;
  scheduledAt?: string | null;
  sentAt?: string | null;
};

/** Un évènement Brevo, réduit à ce qui nous sert. */
export type EvenementBrevo = {
  date: string;
  event: string;
  subject?: string;
  messageId?: string;
  reason?: string;
};

/**
 * Le sort d'un envoi, du pire au meilleur.
 *
 * L'ordre n'est pas décoratif : Brevo rend une SUITE d'évènements pour un même
 * message (« requests », puis « delivered », puis « opened »…). On retient le
 * plus avancé, sauf en cas d'échec — un rejet prime sur tout le reste, c'est la
 * seule chose qui demande une action.
 */
export type Sort =
  /** Programmé pour plus tard. */
  | "a-venir"
  /**
   * L'heure est passée et rien n'est parti.
   *
   * Le signal le plus utile de cet onglet : il ne se déduit d'aucun autre
   * écran. La barre d'étapes affiche « à envoyer », ce qui se lit « ça va
   * partir » alors que l'échéance est derrière nous — le cron abandonne au-delà
   * de 36 h de retard (voir LATE_GRACE_HOURS).
   */
  | "non-parti"
  /**
   * L'heure est passée, mais le cron n'est pas encore repassé.
   *
   * Il tourne à l'heure pile : un envoi calé à 10:30 part à 11:00. Entre les
   * deux, tout est normal — c'est « en attente », pas « manqué ».
   */
  | "en-attente"
  /** Aucune date : l'envoi est déclenché par un évènement, pas par le calendrier. */
  | "non-programme"
  /**
   * Programmé, mais le cron l'écartera : ce qu'il demande est déjà fait.
   *
   * « Réservez votre session » face à une session déjà calée. Le message ne
   * partira pas — c'est voulu — mais l'écran l'annonçait comme à venir, puis
   * comme non parti. Deux mensonges successifs sur une bonne nouvelle.
   */
  | "sans-objet"
  | "envoye"
  | "remis"
  | "ouvert"
  | "clique"
  | "echec";

/** Évènements Brevo qui signalent un échec — ils l'emportent sur le reste. */
const ECHECS = new Set([
  "hardBounces",
  "softBounces",
  "blocked",
  "spam",
  "invalid",
  "deferred",
  "error",
]);

/** Progression : plus le rang est haut, plus l'envoi est allé loin. */
const RANG: Record<string, number> = {
  requests: 1,
  delivered: 2,
  opened: 3,
  uniqueOpened: 3,
  clicks: 4,
  uniqueClicks: 4,
};

/** Ce qu'on affiche pour une ligne d'envoi. */
export type EnvoiCroise = {
  key: string;
  subject: string;
  audience: string;
  sort: Sort;
  /** Date la plus parlante : celle de l'évènement retenu, ou la programmation. */
  date: string | null;
  /** Motif d'échec rendu par Brevo, quand il y en a un. */
  raison: string | null;
  /** Passage du cron qui l'emportera, tant qu'il n'est pas encore passé. */
  partA: string | null;
  ouvert: boolean;
  clics: number;
};

/**
 * Le sort d'un ensemble d'évènements portant sur le MÊME message.
 * Rend `null` s'il n'y a rien à en dire.
 */
export function sortDesEvenements(
  evenements: EvenementBrevo[],
): { sort: Sort; date: string; raison: string | null; ouvert: boolean; clics: number } | null {
  if (evenements.length === 0) return null;

  const echec = evenements.find((e) => ECHECS.has(e.event));
  if (echec) {
    return {
      sort: "echec",
      date: echec.date,
      raison: echec.reason ?? null,
      ouvert: false,
      clics: 0,
    };
  }

  let meilleur = evenements[0];
  let rang = RANG[meilleur.event] ?? 0;
  for (const e of evenements) {
    const r = RANG[e.event] ?? 0;
    if (r > rang) {
      rang = r;
      meilleur = e;
    }
  }

  const sort: Sort = rang >= 4 ? "clique" : rang >= 3 ? "ouvert" : rang >= 2 ? "remis" : "envoye";
  return {
    sort,
    date: meilleur.date,
    raison: null,
    ouvert: rang >= 3,
    clics: evenements.filter((e) => e.event === "clicks").length,
  };
}

/** Normalise un objet pour le rapprochement : la casse et les espaces varient. */
const cle = (s?: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Rapproche chaque envoi prévu de ses évènements.
 *
 * Deux niveaux, dans cet ordre :
 *
 *  1. par OBJET du message. C'est le lien le plus sûr dont on dispose pour les
 *     envois antérieurs au marquage — et il y en a : les parcours en cours ont
 *     déjà reçu leurs premiers messages ;
 *  2. à défaut, la ligne garde l'état que le parcours en dit (envoyé, prévu,
 *     non programmé). Mieux vaut une information partielle qu'un « inconnu »
 *     qui laisserait croire à un problème.
 *
 * Les évènements qu'on ne sait rattacher à aucune ligne ne sont pas jetés :
 * ils ressortent à part (voir `evenementsOrphelins`), parce qu'un message reçu
 * par le client compte, même si on ne sait plus lequel c'était.
 */
export function croiserEnvois(
  prevus: EnvoiPrevu[],
  evenements: EvenementBrevo[],
  maintenant: number = Date.now(),
  /** Ce qui s'est passé depuis la programmation : créneau réservé, dossier transmis… */
  faits: SendFacts = {},
): EnvoiCroise[] {
  const parObjet = new Map<string, EvenementBrevo[]>();
  for (const e of evenements) {
    const k = cle(e.subject);
    if (!k) continue;
    const liste = parObjet.get(k) ?? [];
    liste.push(e);
    parObjet.set(k, liste);
  }

  return prevus
    .filter((p): p is EnvoiPrevu & { key: string } => Boolean(p?.key))
    .map((p) => {
      const constate = sortDesEvenements(parObjet.get(cle(p.subject)) ?? []);
      if (constate) {
        return {
          key: p.key,
          subject: p.subject ?? p.key,
          audience: p.audience ?? "client",
          partA: null,
          ...constate,
        };
      }

      // Rien chez Brevo, et le message ne partira jamais : la chose qu'il
      // réclamait est faite. On le dit ici plutôt que de laisser l'écran
      // l'annoncer, puis le compter comme manquant.
      const sansObjet = p.sentAt ? null : raisonSansObjet(p.key, faits);
      if (sansObjet) {
        return {
          key: p.key,
          subject: p.subject ?? p.key,
          audience: p.audience ?? "client",
          sort: "sans-objet" as Sort,
          date: p.scheduledAt ?? null,
          raison: sansObjet,
          partA: null,
          ouvert: false,
          clics: 0,
        };
      }

      // Rien chez Brevo : on rapporte ce que le parcours en sait.
      const prevu = p.scheduledAt ? Date.parse(p.scheduledAt) : null;
      // Le cron ne passe qu'à l'heure pile : entre l'échéance et ce passage,
      // l'envoi est en attente, pas manqué.
      const passage = nextCronPass(p.scheduledAt);
      const enAttente =
        passage !== null && maintenant < passage + CRON_GRACE_MINUTES * 60_000;

      const sort: Sort = p.sentAt
        ? "envoye"
        : prevu === null || Number.isNaN(prevu)
          ? "non-programme"
          : prevu > maintenant
            ? "a-venir"
            : enAttente
              ? "en-attente"
              : "non-parti";
      return {
        key: p.key,
        subject: p.subject ?? p.key,
        audience: p.audience ?? "client",
        sort,
        date: p.sentAt ?? p.scheduledAt ?? null,
        raison: null,
        partA: sort === "en-attente" && passage !== null ? new Date(passage).toISOString() : null,
        ouvert: false,
        clics: 0,
      };
    });
}

/** Les évènements qu'aucune ligne d'envoi ne revendique. */
export function evenementsOrphelins(
  prevus: EnvoiPrevu[],
  evenements: EvenementBrevo[],
): EvenementBrevo[] {
  const objetsConnus = new Set(prevus.map((p) => cle(p.subject)).filter(Boolean));
  return evenements.filter((e) => !objetsConnus.has(cle(e.subject)));
}

/**
 * Groupes d'affichage, dans l'ordre où on veut les lire.
 *
 * L'ordre du MODÈLE n'est pas le bon ici : il mêle ce qui est arrivé, ce qui
 * viendra, et les alertes internes déclenchées par un évènement. On cherche
 * « qu'est-ce qui a été délivré ou non » — donc d'abord ce qui s'est passé, le
 * plus récent en tête, avec les problèmes qu'on ne peut pas manquer ; ensuite
 * ce qui est programmé, le plus proche d'abord ; le reste à la fin.
 */
const GROUPE: Record<Sort, 0 | 1 | 2 | 3> = {
  echec: 0,
  "non-parti": 0,
  clique: 0,
  ouvert: 0,
  remis: 0,
  envoye: 0,
  // Imminent : il part au prochain passage du cron, donc en tête de l'avenir.
  "en-attente": 1,
  "a-venir": 1,
  "non-programme": 2,
  // Bon dernier, et GROUPÉS : rien à faire, rien à surveiller. Éparpillés
  // parmi les envois sur évènement, ils obligeaient à lire chaque ligne pour
  // vérifier qu'aucune ne demandait une action.
  "sans-objet": 3,
};

/** Trie pour la lecture. Ne modifie pas le tableau reçu. */
export function ordonnerEnvois(envois: EnvoiCroise[]): EnvoiCroise[] {
  return [...envois].sort((a, b) => {
    const ga = GROUPE[a.sort] ?? 2;
    const gb = GROUPE[b.sort] ?? 2;
    if (ga !== gb) return ga - gb;
    // Au-delà de l'avenir daté, la date ne dit plus rien d'utile : on garde
    // l'ordre du modèle, qui est celui de la séquence.
    if (ga >= 2) return 0;

    const da = a.date ? Date.parse(a.date) : 0;
    const db = b.date ? Date.parse(b.date) : 0;
    // Le passé du plus récent au plus ancien ; l'avenir du plus proche au plus
    // lointain — dans les deux cas, ce qui compte le plus est en haut.
    return ga === 0 ? db - da : da - db;
  });
}
