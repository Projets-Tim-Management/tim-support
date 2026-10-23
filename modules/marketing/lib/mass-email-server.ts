import type { Payload } from "payload";

import { partnerIdOf } from "@/core/access";
import { MASS_EMAIL_TEMPLATES, type MassEmailTemplate } from "@/modules/marketing/lib/mass-email";
import { renderSignature, signatureFromPartner, signatureText } from "@/modules/partner/lib/signature";
import { getDomainStatus, getSenders } from "@/modules/support/lib/brevo";

/**
 * E-mail de masse — ce qui se lit côté serveur : les expéditeurs possibles, la
 * signature et les modèles enregistrés. Partagé par l'écran (rendu serveur, rien à attendre
 * à l'ouverture) et par la route d'envoi (qui revérifie tout au moment d'agir).
 */

export type MassSender = { email: string; name: string | null };

/**
 * Les adresses d'où l'on PEUT envoyer : inscrites et actives chez Brevo, ET
 * dont le domaine est authentifié — sans quoi le message part droit dans les
 * indésirables. C'est la liste proposée à l'écran, et la seule que la route
 * accepte : on ne fait pas confiance au choix envoyé par le navigateur.
 */
export async function availableSenders(): Promise<MassSender[]> {
  const senders = await getSenders({ fresh: true }).catch(() => []);
  const domains = new Map<string, boolean>();
  const out: MassSender[] = [];
  for (const s of senders) {
    const email = s.email.trim().toLowerCase();
    const domain = email.split("@")[1] ?? "";
    if (!domains.has(domain)) {
      domains.set(domain, Boolean((await getDomainStatus(domain).catch(() => null))?.authenticated));
    }
    if (domains.get(domain)) out.push({ email, name: s.name ?? null });
  }
  return out.sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * L'expéditeur retenu pour un envoi : celui demandé s'il est dans la liste
 * autorisée, sinon l'adresse du compte connecté si elle y est. Rien d'autre —
 * pas de repli silencieux vers une adresse que la personne n'a pas choisie.
 */
export function pickSender(list: MassSender[], wanted?: string | null, userEmail?: string | null): MassSender | null {
  const find = (e?: string | null) => (e ? list.find((s) => s.email === e.trim().toLowerCase()) : undefined);
  return find(wanted) ?? (wanted ? null : (find(userEmail) ?? null));
}

/**
 * La signature de la fiche partenaire liée au compte (bloc « Signature
 * e-mail ») — la même que dans les séquences et le composeur d'une opportunité.
 */
export async function signatureOf(payload: Payload, user: unknown) {
  const partnerId = partnerIdOf(user);
  if (partnerId == null) return { html: "", text: "" };
  const fiche = (await payload
    .findByID({ collection: "partners", id: partnerId, depth: 1, overrideAccess: true })
    .catch(() => null)) as Record<string, unknown> | null;
  if (!fiche) return { html: "", text: "" };
  const sig = signatureFromPartner(fiche);
  return { html: renderSignature(sig), text: signatureText(sig) };
}

/**
 * La fiche partenaire qui SIGNE pour une adresse d'expédition : celle du compte
 * qui porte cette adresse, sinon une fiche à cette adresse. La signature suit
 * l'expéditeur choisi, pas le compte connecté — un admin connecté en
 * `direction@` qui envoie depuis `cpiancatelli@` signe en Charlie Piancatelli.
 */
async function partnerForAddress(payload: Payload, email: string): Promise<number | string | null> {
  const account = await payload
    .find({ collection: "users", where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
    .catch(() => null);
  const fromAccount = partnerIdOf(account?.docs[0]);
  if (fromAccount != null) return fromAccount;
  const fiche = await payload
    .find({ collection: "partners", where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
    .catch(() => null);
  return fiche?.docs[0]?.id ?? null;
}

/** Signature à poser pour un envoi depuis `senderEmail` (repli : le compte connecté). */
export async function signatureForSender(payload: Payload, senderEmail: string | null | undefined, user: unknown) {
  const partnerId = senderEmail ? await partnerForAddress(payload, senderEmail.trim().toLowerCase()) : null;
  return signatureOf(payload, partnerId != null ? { partner: partnerId } : user);
}

/**
 * Les modèles enregistrés depuis l'écran — et tous ceux de la collection
 * « Modèles d'e-mail » que ce compte voit : les modèles TIM et les siens.
 * Une seule réserve de modèles dans le logiciel, plutôt qu'une seconde à tenir.
 */
export async function savedTemplates(payload: Payload, user: unknown): Promise<MassEmailTemplate[]> {
  const partnerId = partnerIdOf(user);
  const res = await payload
    .find({
      collection: "email-templates",
      where: {
        or: [
          { scope: { equals: "tim" } },
          ...(partnerId != null ? [{ partner: { equals: partnerId } }] : []),
        ],
      },
      sort: "name",
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null);
  return (res?.docs ?? []).map((d) => {
    const doc = d as { id: number | string; name?: string; subject?: string; body?: string; scope?: string };
    return {
      key: `saved-${doc.id}`,
      label: doc.name ?? "Modèle",
      description: doc.scope === "tim" ? "Modèle TIM enregistré" : "Votre modèle enregistré",
      subject: doc.subject ?? "",
      body: doc.body ?? "",
      closing: "Bien cordialement,",
    };
  });
}

export type DirectoryEntry = {
  email: string;
  name: string | null;
  firstName: string | null;
  company: string | null;
  /** Statut de la fiche (clientStatus) — sert aux filtres « Clients », « Prospects »… */
  status: string | null;
  /** Désinscrit : affiché, mais ne peut pas être ajouté. */
  suppressed: boolean;
};

type Ref = { id?: number | string } | number | string | null | undefined;
const idOf = (ref: Ref): string | null =>
  ref == null ? null : String(typeof ref === "object" ? (ref.id ?? "") : ref) || null;

/**
 * Le carnet d'adresses : tous ceux à qui la base permet d'écrire — les contacts
 * des fiches, l'adresse de chaque fiche, les comptes de l'espace client.
 *
 * Une ligne par ADRESSE : la même personne présente comme contact et comme
 * adresse de sa fiche n'apparaît qu'une fois, avec son nom quand on le connaît.
 * Chaque adresse porte la société et le statut de sa fiche, pour choisir par
 * groupe (« tous les clients ») plutôt qu'un par un.
 *
 * Quelques centaines de lignes : chargées d'un bloc à l'ouverture, la recherche
 * se fait ensuite dans le navigateur, sans attendre.
 */
export async function contactDirectory(payload: Payload): Promise<DirectoryEntry[]> {
  const all = (collection: string) =>
    payload
      .find({ collection: collection as never, limit: 5000, depth: 0, overrideAccess: true, pagination: false })
      .then((r) => r.docs as Record<string, unknown>[])
      .catch(() => [] as Record<string, unknown>[]);

  const [clients, contacts, accounts, suppressions] = await Promise.all([
    all("partner-clients"),
    all("client-contacts"),
    all("client-portal-accounts"),
    all("email-suppressions"),
  ]);

  const clientById = new Map(clients.map((c) => [String(c.id), c]));
  const suppressed = new Set(suppressions.map((s) => String(s.email ?? "").trim().toLowerCase()));
  const byEmail = new Map<string, DirectoryEntry>();

  const add = (raw: unknown, firstName: unknown, lastName: unknown, client: Ref) => {
    const email = String(raw ?? "").trim().toLowerCase();
    if (!email.includes("@")) return;
    const fiche = clientById.get(idOf(client) ?? "");
    const first = String(firstName ?? "").trim() || null;
    const name = [first, String(lastName ?? "").trim()].filter(Boolean).join(" ") || null;
    const prev = byEmail.get(email);
    byEmail.set(email, {
      email,
      // Le nom le plus complet l'emporte : un contact nommé vaut mieux que l'adresse nue de la fiche.
      name: prev?.name ?? name,
      firstName: prev?.firstName ?? first,
      company: prev?.company ?? ((fiche?.companyName as string | undefined) || null),
      status: prev?.status ?? ((fiche?.clientStatus as string | undefined) || null),
      suppressed: suppressed.has(email),
    });
  };

  for (const c of contacts) add(c.email, c.firstName, c.lastName, c.client as Ref);
  for (const a of accounts) add(a.email, a.firstName, a.lastName, a.client as Ref);
  for (const c of clients) add(c.email, null, null, c.id as Ref);

  return [...byEmail.values()].sort(
    (a, b) => (a.company ?? "~").localeCompare(b.company ?? "~", "fr") || a.email.localeCompare(b.email),
  );
}

/**
 * Expéditeur présélectionné : sa propre adresse si elle signe ; sinon la
 * première adresse qui a une signature (connecté en `direction@`, sans fiche,
 * on part de `cpiancatelli@`) ; à défaut sa propre adresse, puis la première.
 */
function defaultSenderOf(senders: MassSender[], signatures: Record<string, boolean>, userEmail?: string | null) {
  const own = pickSender(senders, null, userEmail)?.email ?? null;
  if (own && signatures[own]) return own;
  return senders.find((s) => signatures[s.email])?.email ?? own ?? senders[0]?.email ?? null;
}

/** Tout ce que l'écran affiche à l'ouverture. */
export async function massEmailContext(payload: Payload, user: { email?: string | null } & Record<string, unknown>) {
  const [senders, saved, directory] = await Promise.all([
    availableSenders(),
    savedTemplates(payload, user),
    contactDirectory(payload),
  ]);
  // Pour chaque expéditeur possible : une signature existe-t-elle ? (l'interrupteur s'y règle)
  const signatures = Object.fromEntries(
    await Promise.all(
      senders.map(async (s) => [s.email, Boolean((await signatureForSender(payload, s.email, user)).html)] as const),
    ),
  );
  return {
    directory,
    templates: [...MASS_EMAIL_TEMPLATES, ...saved],
    senders,
    defaultSender: defaultSenderOf(senders, signatures, user.email),
    signatures,
  };
}
