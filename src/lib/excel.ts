import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

/**
 * Export Excel avec mise en forme réelle (police Arial Narrow 12, colonnes
 * alignées et justifiées, largeurs ajustées). Utilise exceljs, seule
 * bibliothèque du projet capable d'écrire un style qui persiste
 * réellement dans le fichier — contrairement à la bibliothèque "xlsx"
 * utilisée pour les exports simples ci-dessous.
 */
export async function exporterExcelMisEnForme(
  nomFichier: string,
  nomFeuille: string,
  colonnes: string[],
  lignes: Record<string, unknown>[]
) {
  const classeur = new ExcelJS.Workbook();
  const feuille = classeur.addWorksheet(nomFeuille.slice(0, 31));

  feuille.columns = colonnes.map((c) => ({
    header: c,
    key: c,
    width: Math.min(Math.max(c.length + 4, 14), 40),
  }));

  const ligneEntete = feuille.getRow(1);
  ligneEntete.eachCell((cell) => {
    cell.font = { name: "Arial Narrow", size: 12, bold: true };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });

  for (const ligne of lignes) {
    const row = feuille.addRow(ligne);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Arial Narrow", size: 12 };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });
  }

  const buffer = await classeur.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomFichier}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exporterExcel(
  nomFichier: string,
  feuilles: { nom: string; lignes: Record<string, unknown>[] }[]
) {
  const classeur = XLSX.utils.book_new();

  for (const feuille of feuilles) {
    const worksheet = XLSX.utils.json_to_sheet(feuille.lignes);
    // Largeur de colonnes raisonnable, calculée depuis les en-têtes
    const largeurs = Object.keys(feuille.lignes[0] ?? {}).map((cle) => ({
      wch: Math.min(Math.max(cle.length, 12), 40),
    }));
    worksheet["!cols"] = largeurs;
    XLSX.utils.book_append_sheet(classeur, worksheet, feuille.nom.slice(0, 31));
  }

  XLSX.writeFile(classeur, `${nomFichier}.xlsx`);
}

export function telechargerModeleExcel(
  nomFichier: string,
  colonnes: string[],
  exemple?: Record<string, unknown>
) {
  const classeur = XLSX.utils.book_new();
  const lignes = exemple ? [exemple] : [];
  const worksheet = XLSX.utils.json_to_sheet(lignes, { header: colonnes });
  worksheet["!cols"] = colonnes.map((c) => ({ wch: Math.max(c.length, 16) }));
  XLSX.utils.book_append_sheet(classeur, worksheet, "Modèle");
  XLSX.writeFile(classeur, `${nomFichier}.xlsx`);
}

export async function lireFichierExcel(
  file: File
): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const classeur = XLSX.read(buffer, { type: "array" });
  const premiereFeuille = classeur.Sheets[classeur.SheetNames[0]];
  return XLSX.utils.sheet_to_json(premiereFeuille, { defval: "" });
}
