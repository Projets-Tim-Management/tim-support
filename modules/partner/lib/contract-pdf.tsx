import { join } from "node:path";

import { Document, Font, Image, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { brandColorsOf, type BrandColors } from "@/core/lib/brand";
import type { PriceRow } from "@/modules/partner/lib/contract-vars";
import type { Block, RenderedContract, Run } from "@/modules/partner/lib/contract-render";
import { winAnsi } from "@/modules/partner/lib/e-signature";
import type { SignerRole } from "@/modules/partner/lib/sign-fields";
import {
  extractSlots,
  parapheBox,
  slotHref,
  writeLayout,
  type SignatureField,
} from "@/modules/partner/lib/signature-layout";

/**
 * Le contrat en PDF, aux couleurs de TIM — mise en page du contenu rendu par
 * contract-render (qui, lui, ne sait rien du PDF).
 *
 * Les polices sont lues sur le disque (assets/…) : elles sont embarquées dans
 * la fonction déployée par `outputFileTracingIncludes` (next.config.ts).
 *
 * Logo et couleurs de marque : ceux de TIM Management, réglés dans Système →
 * Apparence (`theme`, `logo`). Les gris et les surlignages de relecture sont
 * repris des tokens de l'interface (un PDF ne lit pas le CSS).
 */

const ASSETS = join(process.cwd(), "assets");

Font.register({
  family: "Lato",
  fonts: [
    { src: join(ASSETS, "fonts/contract/Lato-Regular.ttf") },
    { src: join(ASSETS, "fonts/contract/Lato-Bold.ttf"), fontWeight: 700 },
    { src: join(ASSETS, "fonts/contract/Lato-Italic.ttf"), fontStyle: "italic" },
    { src: join(ASSETS, "fonts/contract/Lato-BoldItalic.ttf"), fontWeight: 700, fontStyle: "italic" },
  ],
});
// Pas de césure automatique : un terme juridique coupé en deux se lit mal.
Font.registerHyphenationCallback((word) => [word]);

const C = {
  ink: "#333438",
  muted: "#8a8f98", // --tim-muted
  border: "#d2d2d6", // --tim-border
  surface: "#f8f9fb", // --tim-surface
  missingBg: "#fdf0dd", // --tim-amber-bg
  missingInk: "#b45309", // --tim-amber
  filledBg: "#e0f2fe", // --tim-sky-bg
  filledInk: "#0369a1", // --tim-sky
};

const s = StyleSheet.create({
  page: { fontFamily: "Lato", fontSize: 9.5, lineHeight: 1.45, color: C.ink, paddingTop: 56, paddingBottom: 60, paddingHorizontal: 56 },
  header: { position: "absolute", top: 22, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerLogo: { height: 22 },
  headerBrand: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6 },
  headerText: { fontSize: 7.5, color: C.muted },
  coverBand: { height: 4, marginBottom: 28 },
  coverTitle: { fontSize: 17, fontWeight: 700, lineHeight: 1.3, marginBottom: 10 },
  coverSub: { fontSize: 10, color: C.muted, marginBottom: 26 },
  sectionTitle: { fontSize: 11.5, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  annexeTitle: { fontSize: 14, fontWeight: 700, textAlign: "center", marginBottom: 14 },
  h: { fontSize: 10, fontWeight: 700, marginTop: 8, marginBottom: 3 },
  p: { marginBottom: 6, textAlign: "justify" },
  li: { flexDirection: "row", marginBottom: 3, paddingLeft: 6 },
  bullet: { width: 10 },
  liText: { flex: 1, textAlign: "justify" },
  table: { borderWidth: 0.5, borderColor: C.border, marginVertical: 6 },
  tr: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: C.border },
  trFirst: { flexDirection: "row" },
  th: { backgroundColor: C.surface, fontWeight: 700 },
  tdTerm: { width: "32%", padding: 5, fontWeight: 700, borderRightWidth: 0.5, borderRightColor: C.border },
  tdDef: { width: "68%", padding: 5, textAlign: "justify" },
  tdProfile: { width: "40%", padding: 5, borderRightWidth: 0.5, borderRightColor: C.border },
  tdPrice: { width: "60%", padding: 5 },
  missing: { backgroundColor: C.missingBg, color: C.missingInk, fontWeight: 700 },
  filled: { backgroundColor: C.filledBg, color: C.filledInk },
  draftNote: {
    marginBottom: 18,
    padding: 8,
    borderWidth: 0.5,
    borderColor: C.border,
    backgroundColor: C.surface,
    fontSize: 8,
    color: C.muted,
  },
  sigRow: { flexDirection: "row", marginTop: 14, gap: 16 },
  sigCol: { flex: 1, borderWidth: 0.5, borderColor: C.border, padding: 10 },
  sigTitle: { fontWeight: 700, marginBottom: 2 },
  sigCompany: { marginBottom: 6 },
  sigLine: { flexDirection: "row", alignItems: "flex-end", marginTop: 5 },
  sigLabel: { width: 62, fontSize: 8, color: C.muted },
  sigValue: { flex: 1 },
  // Zones remplies à la signature : un trait pointillé à compléter.
  slot: { flex: 1, height: 13, borderBottomWidth: 0.5, borderBottomColor: C.border, borderBottomStyle: "dashed" },
  slotSign: { height: 44, marginTop: 3, borderWidth: 0.5, borderColor: C.border, borderStyle: "dashed" },
  sigHint: { marginTop: 6, fontSize: 7, color: C.muted, fontStyle: "italic" },
});

/**
 * Aperçu de travail : les variables remplies sont surlignées (jamais dans le
 * PDF envoyé). Passé en paramètre : pas de contexte React dans une route serveur.
 */
function Runs({ runs, highlight }: { runs: Run[]; highlight?: boolean }) {
  return (
    <>
      {runs.map((r, i) => (
        <Text
          key={i}
          style={[r.bold ? { fontWeight: 700 } : {}, r.missing ? s.missing : highlight && r.filled ? s.filled : {}]}
        >
          {r.text}
        </Text>
      ))}
    </>
  );
}

/** Une valeur de la fiche hors du texte (tarifs, signataires). */
function Hl({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return <Text style={on ? s.filled : {}}>{children}</Text>;
}

type ContractPdfInput = {
  contract: RenderedContract;
  priceRows: PriceRow[];
  reference: string;
  clientName: string;
  providerName: string;
  /**
   * Blocs de signature : la société de chaque partie. Nom, fonction, date et
   * signature se remplissent à la signature (zones `tim-sig://`).
   */
  signatories: {
    provider: { company: string };
    client: { company: string };
  };
  /**
   * Aperçu de travail : surligne les informations venues des variables pour
   * les relire. Jamais pour le PDF envoyé au client.
   */
  highlight?: boolean;
  /** Couleurs de TIM Management (Système → Apparence). */
  theme?: BrandColors;
  /** Logo de TIM Management (PNG ou JPEG) ; sans lui, le nom en toutes lettres. */
  logo?: { data: Buffer; format: "png" | "jpg" } | null;
};

const DEFAULT_THEME: BrandColors = brandColorsOf(null);

function BlockView({ block, input }: { block: Block; input: ContractPdfInput }) {
  switch (block.type) {
    case "p":
      return (
        <Text style={[s.p, block.align ? { textAlign: block.align } : {}]}>
          <Runs runs={block.runs} highlight={input.highlight} />
        </Text>
      );
    case "h":
      return (
        <Text style={s.h} minPresenceAhead={40}>
          <Runs runs={block.runs} highlight={input.highlight} />
        </Text>
      );
    case "list":
      return (
        <View style={{ marginBottom: 6 }}>
          {block.items.map((item, i) => (
            <View key={i} style={s.li} wrap={false}>
              <Text style={s.bullet}>–</Text>
              <Text style={s.liText}>
                <Runs runs={item} highlight={input.highlight} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "defs":
      return (
        <View style={s.table}>
          {block.rows.map((row, i) => (
            <View key={i} style={i === 0 ? s.trFirst : s.tr} wrap={false}>
              <Text style={s.tdTerm}>
                <Runs runs={row.term} highlight={input.highlight} />
              </Text>
              <Text style={s.tdDef}>
                <Runs runs={row.def} highlight={input.highlight} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "prices":
      return (
        <View style={s.table} wrap={false}>
          <View style={[s.trFirst, s.th, { backgroundColor: (input.theme ?? DEFAULT_THEME).secondary }]}>
            <Text style={s.tdProfile}>Profil</Text>
            <Text style={s.tdPrice}>Tarif</Text>
          </View>
          {input.priceRows.length ? (
            input.priceRows.map((r) => (
              <View key={r.profile} style={s.tr}>
                <Text style={s.tdProfile}>{r.profile}</Text>
                <Text style={s.tdPrice}>
                  <Hl on={input.highlight}>{r.unitPrice}</Hl>
                </Text>
              </View>
            ))
          ) : (
            <View style={s.tr}>
              <Text style={[s.tdProfile, s.missing]}>[à compléter]</Text>
              <Text style={[s.tdPrice, s.missing]}>Licences à renseigner sur la fiche</Text>
            </View>
          )}
        </View>
      );
    case "signatures": {
      const { provider, client } = input.signatories;
      // Une zone à remplir à la signature : son lien `tim-sig://` donne son
      // emplacement exact, relevé puis retiré après le rendu (signature-layout).
      const slot = (role: SignerRole, field: SignatureField, style: Style = s.slot) => (
        <Link src={slotHref(role, field)} style={style}>
          <View />
        </Link>
      );
      const line = (label: string, content: React.ReactNode) => (
        <View style={s.sigLine}>
          <Text style={s.sigLabel}>{label}</Text>
          {content}
        </View>
      );
      return (
        <View style={s.sigRow} wrap={false}>
          <View style={s.sigCol}>
            <Text style={s.sigTitle}>Le Prestataire</Text>
            <Text style={s.sigCompany}>
              Pour la société <Hl on={input.highlight}>{provider.company}</Hl>
            </Text>
            {/* Nom et fonction : ceux de la personne qui CONTRESIGNE,
                remplis à ce moment-là (pas le représentant de la fiche
                Entreprise, qui n'est pas forcément le signataire). */}
            {line("Nom et prénom", slot("provider", "name"))}
            {line("Fonction", slot("provider", "role"))}
            {line("Date", slot("provider", "date"))}
            <Text style={[s.sigLabel, { marginTop: 5, width: "auto" }]}>Signature</Text>
            {slot("provider", "signature", s.slotSign)}
          </View>
          <View style={s.sigCol}>
            <Text style={s.sigTitle}>Le Client</Text>
            <Text style={s.sigCompany}>
              Pour la société <Hl on={input.highlight}>{client.company}</Hl>
            </Text>
            {line("Nom et prénom", slot("client", "name"))}
            {line("Fonction", slot("client", "role"))}
            {line("Date", slot("client", "date"))}
            <Text style={[s.sigLabel, { marginTop: 5, width: "auto" }]}>Signature</Text>
            {slot("client", "signature", s.slotSign)}
            <Text style={s.sigHint}>Signature électronique — voir le certificat de signature.</Text>
          </View>
        </View>
      );
    }
  }
}

function ContractDocument({ input }: { input: ContractPdfInput }) {
  const { contract } = input;
  const theme = input.theme ?? DEFAULT_THEME;
  const body = contract.sections.filter((x) => x.kind !== "annexe");
  const annexes = contract.sections.filter((x) => x.kind === "annexe");

  const chrome = (
    <>
      <View style={s.header} fixed>
        {input.logo ? (
          // Image de react-pdf (dans un PDF), pas une balise <img> : pas d'attribut alt.
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={input.logo} style={s.headerLogo} />
        ) : (
          <Text style={[s.headerBrand, { color: theme.primary }]}>TIM MANAGEMENT</Text>
        )}
        <Text style={s.headerText}>
          {input.clientName} · réf. {input.reference}
        </Text>
      </View>
    </>
  );

  return (
    <Document title={`${contract.title} — ${input.clientName}`} author={input.providerName} creator="TIM Management">
      <Page size="A4" style={s.page} wrap>
        {chrome}
        <View style={[s.coverBand, { backgroundColor: theme.red }]} />
        <Text style={[s.coverTitle, { color: theme.primary }]}>{contract.title}</Text>
        <Text style={s.coverSub}>
          Entre {input.providerName} et {input.clientName} · réf. {input.reference}
        </Text>
        {input.highlight ? (
          <Text style={[s.draftNote, { backgroundColor: theme.other }]}>
            Aperçu de travail : <Text style={s.filled}> informations issues de la fiche </Text> à vérifier,{" "}
            <Text style={s.missing}> [à compléter] </Text> manquantes. Ce marquage n'apparaît pas dans le contrat
            envoyé.
          </Text>
        ) : null}
        {body.map((section) => (
          <View key={section.key}>
            {section.title ? (
              <Text style={[s.sectionTitle, { color: theme.primary }]} minPresenceAhead={60}>
                {section.title}
              </Text>
            ) : null}
            {section.blocks.map((b, i) => (
              <BlockView key={i} block={b} input={input} />
            ))}
          </View>
        ))}
      </Page>
      {annexes.map((section) => (
        <Page key={section.key} size="A4" style={s.page} wrap>
          {chrome}
          <Text style={[s.annexeTitle, { color: theme.primary }]}>{section.title}</Text>
          {section.blocks.map((b, i) => (
            <BlockView key={i} block={b} input={input} />
          ))}
        </Page>
      ))}
    </Document>
  );
}

/**
 * Le pied de page (« Contrat SaaS – … · Page x sur y ») est posé APRÈS le
 * rendu, avec pdf-lib : le positionnement en bas de page de react-pdf ne
 * s'affichait pas, et le total des pages n'est de toute façon connu qu'une
 * fois le document mis en page.
 *
 * Même passage : la case « Paraphe » de chaque page, et le plan des zones de
 * signature (signature-layout) rangé dans le PDF pour la signature en ligne.
 */
async function stampFooter(bytes: Uint8Array, left: string): Promise<Buffer> {
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const color = rgb(0.54, 0.56, 0.6);
  const line = rgb(0.82, 0.82, 0.84);
  const safeLeft = winAnsi(left);
  const slots = extractSlots(doc);
  const paraphe = parapheBox(pages[0]?.getSize().width ?? 595.28);
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const box = parapheBox(width);
    const pageText = `Page ${i + 1} sur ${pages.length}`;
    page.drawLine({ start: { x: 56, y: 40 }, end: { x: width - 56, y: 40 }, thickness: 0.5, color: line });
    page.drawText(safeLeft, { x: 56, y: 22, size: 7.5, font, color });
    page.drawText(pageText, { x: box.x - 16 - font.widthOfTextAtSize(pageText, 7.5), y: 22, size: 7.5, font, color });
    page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, borderColor: line, borderWidth: 0.5 });
    page.drawText("Paraphe", { x: box.x + 4, y: box.y + box.h - 8, size: 5.5, font, color });
    // Un trait au milieu : le client à gauche, TIM à droite.
    page.drawLine({
      start: { x: box.x + box.w / 2, y: box.y + 4 },
      end: { x: box.x + box.w / 2, y: box.y + box.h - 10 },
      thickness: 0.5,
      color: line,
    });
  });
  writeLayout(doc, { v: 1, paraphe, slots, pages: pages.length });
  return Buffer.from(await doc.save());
}

export async function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  const raw = await renderToBuffer(<ContractDocument input={input} />);
  return stampFooter(new Uint8Array(raw), `Contrat SaaS - ${input.providerName} / TIM MANAGEMENT`);
}
