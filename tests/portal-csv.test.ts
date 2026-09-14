import { describe, expect, it } from "vitest";

import {
  cellToCsv,
  choicesOf,
  convertCell,
  csvExport,
  csvTemplate,
  detectSeparator,
  importableFields,
  matchColumns,
  parseCsv,
  parseDate,
  readImport,
  decodeCsvBytes,
  repairMojibake,
} from "@/modules/marketing/lib/portal-csv";
import { sectionByKey, validateRow, type PortalField } from "@/modules/marketing/lib/portal-sections";

/**
 * Import CSV du dossier de démarrage.
 *
 * Ce module décide de ce qui entre en base à partir d'un fichier qu'on ne
 * contrôle pas : produit par Excel, LibreOffice ou Google Sheets, en français
 * ou non, rempli par quelqu'un qui n'a lu la consigne qu'à moitié. Chaque cas
 * ci-dessous est un fichier qu'on recevra pour de bon.
 */

const salaries = sectionByKey("salaries")!;
const chantiers = sectionByKey("chantiers")!;
const vehicules = sectionByKey("vehicules")!;

describe("le modèle proposé au client", () => {
  it("porte un BOM, sans quoi Excel affiche « SociÃ©tÃ© »", () => {
    // C'est la toute première chose que voit le client en ouvrant le modèle.
    expect(csvTemplate(salaries).charCodeAt(0)).toBe(0xfeff);
  });

  it("sépare par point-virgule, ce qu'attend Excel en français", () => {
    // Avec une virgule, le fichier s'ouvre en UNE colonne et le client croit
    // le modèle cassé.
    const [header] = csvTemplate(salaries).replace(/^﻿/, "").split("\n");
    expect(header).toContain(";");
    expect(header.split(";").length).toBeGreaterThan(2);
  });

  it("signale les colonnes obligatoires dans l'en-tête", () => {
    const [header] = csvTemplate(salaries).replace(/^﻿/, "").split("\n");
    expect(header).toContain("Société (obligatoire)");
    // Et seulement celles-là : marquer tout le monde ne dirait plus rien.
    expect(header).not.toContain("Téléphone (obligatoire)");
  });

  it("n'expose jamais les colonnes réservées à TIM ni les valeurs calculées", () => {
    /**
     * Une colonne `adminOnly` dans le modèle ferait remplir au client une
     * donnée qu'il n'a pas à saisir — et qu'on écraserait ensuite.
     */
    for (const s of [salaries, chantiers, vehicules]) {
      expect(importableFields(s).some((f) => f.adminOnly || f.readOnly)).toBe(false);
    }
  });

  it("donne un exemple sur chaque colonne plutôt qu'une ligne vide", () => {
    const lines = csvTemplate(chantiers).replace(/^﻿/, "").split("\n");
    expect(lines[1].replace(/;/g, "").trim()).not.toBe("");
  });

  it("rappelle les valeurs acceptées des listes de choix", () => {
    const choix = choicesOf(salaries);
    expect(choix.length).toBeGreaterThan(0);
    expect(choix[0].values.length).toBeGreaterThan(0);
  });
});

describe("lecture d'un fichier qu'on ne contrôle pas", () => {
  it("devine le séparateur au lieu de l'imposer", () => {
    expect(detectSeparator("a;b;c")).toBe(";");
    expect(detectSeparator("a,b,c")).toBe(",");
    expect(detectSeparator("a\tb\tc")).toBe("\t");
    // Une seule colonne : aucun séparateur à deviner, on retombe sur le nôtre.
    expect(detectSeparator("Nom")).toBe(";");
  });

  it("ne compte pas un séparateur enfermé dans des guillemets", () => {
    // « Dupont, Jean » est UNE cellule : sinon toutes les colonnes se décalent.
    expect(detectSeparator('"Nom, prénom";Société')).toBe(";");
  });

  it("respecte les guillemets doublés à l'intérieur d'un champ", () => {
    const rows = parseCsv('Nom;Note\n"Société ""Le Toit""";ok\n');
    expect(rows[1]).toEqual(['Société "Le Toit"', "ok"]);
  });

  it("accepte les fins de ligne Windows et les BOM", () => {
    expect(parseCsv('﻿a;b\r\n1;2\r\n')).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("ignore les lignes vides qu'un tableur laisse traîner", () => {
    // Les signaler comme fautives noierait les vraies erreurs.
    expect(parseCsv("a;b\n1;2\n;\n\n")).toHaveLength(2);
  });
});

describe("correspondance des colonnes", () => {
  it("reconnaît un libellé quels que soient casse, accents et mention d'obligation", () => {
    const found = matchColumns(salaries, ["SOCIETE (obligatoire)", "prénom", "  Nom  "]);
    expect(found.map((f) => f?.name)).toEqual(["company", "firstName", "lastName"]);
  });

  it("accepte aussi le nom technique, pour un export venu d'un autre logiciel", () => {
    expect(matchColumns(salaries, ["firstName"])[0]?.name).toBe("firstName");
  });

  it("ne rattache pas une colonne inconnue au hasard", () => {
    expect(matchColumns(salaries, ["Couleur préférée"])[0]).toBeNull();
  });
});

describe("conversion des cellules", () => {
  const champ = (over: Partial<PortalField>): PortalField =>
    ({ name: "x", label: "X", type: "text", ...over }) as PortalField;

  it("lit les dates au format français comme au format ISO", () => {
    expect(parseDate("31/12/2026")?.slice(0, 10)).toBe("2026-12-31");
    expect(parseDate("2026-12-31")?.slice(0, 10)).toBe("2026-12-31");
    expect(parseDate("31-12-2026")?.slice(0, 10)).toBe("2026-12-31");
  });

  it("REFUSE une date impossible au lieu de la décaler", () => {
    /**
     * `new Date(2026, 1, 31)` ne se plaint pas : il renvoie le 3 mars. Une
     * saisie fautive deviendrait donc une date plausible, et personne ne le
     * verrait jamais.
     */
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("bientôt")).toBeNull();
  });

  it("traduit une liste de choix par son libellé ou par sa valeur", () => {
    const f = champ({ type: "select", options: [{ label: "Chef d'équipe", value: "chef" }] });
    expect(convertCell(f, "chef d'equipe").value).toBe("chef");
    expect(convertCell(f, "CHEF").value).toBe("chef");
  });

  it("dit ce qui était attendu quand la valeur n'est pas dans la liste", () => {
    const f = champ({ type: "select", options: [{ label: "Oui", value: "o" }] });
    const r = convertCell(f, "peut-être");
    expect(r.error).toContain("Oui");
  });

  it("accepte les façons courantes d'écrire oui et non", () => {
    const f = champ({ type: "checkbox" });
    expect(convertCell(f, "Oui").value).toBe(true);
    expect(convertCell(f, "X").value).toBe(true);
    expect(convertCell(f, "non").value).toBe(false);
    expect(convertCell(f, "bof").error).toBeTruthy();
  });

  it("lit un nombre écrit à la française", () => {
    const f = champ({ type: "number" });
    expect(convertCell(f, "1 234,5").value).toBe(1234.5);
    expect(convertCell(f, "douze").error).toBeTruthy();
  });
});

describe("le rapport, avant toute écriture", () => {
  const csv = (lines: string[]) => lines.join("\n") + "\n";

  it("compte ce qui passe et ce qui ne passe pas, sans rien enregistrer", () => {
    const rapport = readImport(
      salaries,
      csv(["Société;Prénom;Nom", "BTP Sud;Luis;Martin", "BTP Sud;;Durand"]),
      validateRow,
    );
    expect(rapport.ok).toBe(1);
    expect(rapport.ko).toBe(1);
    expect(rapport.rows[1].errors.firstName).toBeTruthy();
  });

  it("garde le bon numéro de ligne après une ligne vide", () => {
    /**
     * Un client vide le contenu d'une ligne au lieu de la supprimer : le
     * tableur laisse la ligne, nous l'écartions sans la compter, et tout ce
     * qui suivait se décalait d'un cran. Le rapport désignait alors une ligne
     * que le client ne voyait pas fautive à l'écran.
     */
    const rapport = readImport(
      salaries,
      csv(["Société;Prénom;Nom", "BTP Sud;Luis;Martin", ";;", "BTP Sud;;Durand"]),
      validateRow,
    );
    expect(rapport.rows.map((r) => r.line)).toEqual([2, 4]);
  });

  it("désigne la ligne telle que le tableur la numérote", () => {
    // Un message qui dit « ligne 2 » quand le client en voit une autre à
    // l'écran est plus coûteux qu'un message absent.
    const rapport = readImport(salaries, csv(["Société;Prénom;Nom", "A;B;C"]), validateRow);
    expect(rapport.rows[0].line).toBe(2);
  });

  it("signale une colonne obligatoire absente du fichier", () => {
    const rapport = readImport(salaries, csv(["Prénom;Nom", "Luis;Martin"]), validateRow);
    expect(rapport.missingRequired).toContain("Société");
  });

  it("ignore une colonne en trop sans rejeter le fichier", () => {
    // Un export tiré d'un autre logiciel en contient toujours : les refuser
    // obligerait le client à nettoyer son fichier avant de pouvoir l'envoyer.
    const rapport = readImport(
      salaries,
      csv(["Société;Prénom;Nom;Matricule interne", "BTP Sud;Luis;Martin;X-12"]),
      validateRow,
    );
    expect(rapport.unknownColumns).toEqual(["Matricule interne"]);
    expect(rapport.ok).toBe(1);
  });

  it("applique les MÊMES règles que le formulaire, et bloque sur l'obligatoire", () => {
    /**
     * `validateRow` est la source d'autorité de l'API et de l'écran. L'import
     * s'y branche au lieu de refaire des contrôles en parallèle : sans ça, un
     * fichier accepté ici serait refusé à l'enregistrement.
     */
    const rapport = readImport(
      chantiers,
      csv(["Nom du chantier;Adresse du chantier;Date de début;Date de fin",
           "Tour A;12 rue des Lilas;01/03/2026;01/01/2026"]),
      validateRow,
    );
    expect(rapport.ko).toBe(1);
  });

  it("VIDE la case fautive au lieu de perdre la ligne", () => {
    /**
     * Le choix qui compte. Un salarié dont la nationalité est mal orthographiée
     * reste un salarié : on l'importe sans sa nationalité, et on dit laquelle
     * a été écartée. Le rejeter ferait payer une ligne entière pour une case.
     */
    const rapport = readImport(
      salaries,
      csv(["Société;Prénom;Nom;Nationalité", "BTP Sud;Luis;Martin;Atlantide"]),
      validateRow,
    );
    expect(rapport.ok).toBe(1);
    expect(rapport.rows[0].dropped.nationality).toBeTruthy();
    expect(rapport.rows[0].data.nationality).toBeUndefined();
    // Le reste de la ligne est intact.
    expect(rapport.rows[0].data.firstName).toBe("Luis");
    expect(rapport.droppedCount).toBe(1);
  });

  it("REFUSE la ligne quand c'est une colonne obligatoire qui est fautive", () => {
    // On ne peut pas vider ce qui doit être rempli : sans société, il n'y a
    // pas de salarié à créer.
    const rapport = readImport(salaries, csv(["Société;Prénom;Nom", ";Luis;Martin"]), validateRow);
    expect(rapport.ko).toBe(1);
    expect(rapport.rows[0].errors.company).toBeTruthy();
  });

  it("ne rend rien pour un fichier vide", () => {
    expect(readImport(salaries, "", validateRow).rows).toEqual([]);
  });
});

describe("le fichier tel qu'un tableur le rend", () => {
  const utf8 = (t: string) => new TextEncoder().encode(t);

  it("lit un fichier réenregistré en Windows-1252", () => {
    /**
     * Excel propose « CSV » avant « CSV UTF-8 », et le client prend le premier.
     * Lu en UTF-8, l'octet 0xE9 de « Société » n'est pas un caractère : sans
     * repli, la colonne obligatoire passait pour absente et tout était refusé.
     */
    const bytes = Uint8Array.from([...'Soci\u00e9t\u00e9;Pr\u00e9nom'].map((c) => c.charCodeAt(0)));
    expect(decodeCsvBytes(bytes)).toBe("Société;Prénom");
  });

  it("lit un fichier UTF-8 avec marque d'ordre des octets", () => {
    expect(decodeCsvBytes(utf8("\ufeffSociété;Prénom"))).toBe("Société;Prénom");
  });

  it("lit un fichier enregistré en UTF-16", () => {
    // « Texte Unicode » dans Excel : deux octets par caractère, illisible en UTF-8.
    const texte = "Société;Prénom";
    const b = new Uint8Array(2 + texte.length * 2);
    b[0] = 0xff;
    b[1] = 0xfe;
    for (let i = 0; i < texte.length; i += 1) {
      const c = texte.charCodeAt(i);
      b[2 + i * 2] = c & 0xff;
      b[3 + i * 2] = c >> 8;
    }
    expect(decodeCsvBytes(b)).toBe(texte);
  });

  it("répare les accents passés par un aller-retour d'encodage", () => {
    // Le fichier contient POUR DE BON « SociÃ©tÃ© » : le tableur a relu notre
    // UTF-8 comme du latin-1, puis l'a sauvé tel quel.
    const abime = "\ufeffSoci\u00c3\u00a9t\u00c3\u00a9;Pr\u00c3\u00a9nom";
    expect(repairMojibake(abime)).toBe("\ufeffSociété;Prénom");
  });

  it("ne touche pas à un texte sain", () => {
    // La réparation ne doit jamais s'inventer un travail : elle relit des
    // octets, et sur un texte correct elle casserait les accents.
    const sain = "Société;Prénom;Nationalité\nBTP Sud;Luis;Côte d'Ivoire";
    expect(repairMojibake(sain)).toBe(sain);
  });

  it("répare l'en-tête même si une ligne reste illisible", () => {
    /**
     * La relecture des octets est tout ou rien. Une seule ligne abîmée
     * autrement — caractère perdu, ligne recopiée à la main — ferait renoncer
     * sur le fichier entier, alors que c'est l'en-tête qui décide si l'import
     * est possible.
     */
    const rapport = readImport(
      salaries,
      "\ufeffSoci\u00c3\u00a9t\u00c3\u00a9 (obligatoire);Pr\u00c3\u00a9nom (obligatoire);Nom (obligatoire)\n" +
        "BTP Sud;Luis;Marti\u00e2n\n",
      validateRow,
    );
    expect(rapport.missingRequired).toEqual([]);
    expect(rapport.ok).toBe(1);
  });

  it("accepte le modèle qu'on vient de servir, tel quel", () => {
    // Le premier trajet du client : télécharger, ouvrir, redéposer. S'il
    // échoue, la fonctionnalité n'existe pas.
    const rapport = readImport(salaries, csvTemplate(salaries), validateRow);
    expect(rapport.missingRequired).toEqual([]);
    expect(rapport.ko).toBe(0);
    expect(rapport.ok).toBe(1);
  });
});

/**
 * Export : ce qu'on télécharge se ROUVRE dans Excel et se RÉIMPORTE tel quel.
 * Un export qui ne repasserait pas par l'import serait un fichier de plus à
 * corriger à la main.
 */
describe("export des lignes saisies", () => {
  const fields = importableFields(salaries);
  const rows = [
    {
      company: "BTP Sud",
      firstName: "Luis",
      lastName: "Martin; fils",
      contractType: "cdi",
      birthDate: "1988-04-12T00:00:00.000Z",
      nationality: "FR",
    },
  ];

  it("écrit les libellés des listes, les dates en français, et protège le séparateur", () => {
    const csv = csvExport(fields, rows);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lignes = csv.trim().split("\n");
    expect(lignes[0]).toContain("Société (obligatoire)");
    expect(lignes[1]).toContain("CDI");
    expect(lignes[1]).toContain("12/04/1988");
    expect(lignes[1]).toContain('"Martin; fils"');
  });

  it("se réimporte sans perte", () => {
    const rapport = readImport(salaries, csvExport(fields, rows), validateRow);
    expect(rapport.unknownColumns).toEqual([]);
    expect(rapport.ok).toBe(1);
    const data = rapport.rows[0].data;
    expect(data.company).toBe("BTP Sud");
    expect(data.lastName).toBe("Martin; fils");
    expect(data.contractType).toBe("cdi");
    expect(String(data.birthDate)).toMatch(/^1988-04-12/);
  });

  it("une case vide reste vide, une case cochée dit oui", () => {
    const check = { name: "x", label: "X", type: "checkbox" } as PortalField;
    expect(cellToCsv(check, true)).toBe("oui");
    expect(cellToCsv(check, false)).toBe("non");
    expect(cellToCsv({ name: "y", label: "Y", type: "text" } as PortalField, null)).toBe("");
  });
});
