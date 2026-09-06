"use client";

import { useState, useRef } from "react";
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { getStockInitialId } from "@/lib/conteneurs";
import { normaliser, trouverOuCreer } from "@/lib/normaliser";
import {
  exporterExcelMisEnForme,
  lireFichierExcel,
} from "@/lib/excel";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { useReferenceData } from "@/lib/hooks/useReferenceData";

const COLONNES_MODELE = [
  "Désignation",
  "Catégorie",
  "Sous-catégorie",
  "Marque",
  "Fournisseur",
  "Quantité en stock",
  "Stock minimum",
  "Prix de vente conseillé",
  "Emplacement",
  "Numéro de lot",
  "Date d'expiration",
  "Statut",
  "Observations",
];

type LigneImport = {
  index: number;
  data: Record<string, unknown>;
  erreurs: string[];
  valide: boolean;
};

export function ImportExportManager() {
  const supabase = createClient();
  const { categories, sousCategories, fournisseurs, emplacements, statutsArticle } =
    useReferenceData();

  const [exportingType, setExportingType] = useState<string | null>(null);
  const [lignes, setLignes] = useState<LigneImport[]>([]);
  const [importing, setImporting] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function exporterTable(
    type: string,
    nomAffiche: string,
    table: string,
    select: string,
    mapper: (row: Record<string, unknown>) => Record<string, unknown>,
    champTotal?: string
  ) {
    setExportingType(type);
    const { data } = await supabase.from(table).select(select);
    if (data) {
      const lignesExport = (data as unknown as Record<string, unknown>[]).map(mapper);
      if (champTotal && lignesExport.length > 0) {
        const total = lignesExport.reduce(
          (s, l) => s + (Number(l[champTotal]) || 0),
          0
        );
        const ligneTotal: Record<string, unknown> = {};
        for (const cle of Object.keys(lignesExport[0])) ligneTotal[cle] = "";
        ligneTotal[Object.keys(lignesExport[0])[0]] = "TOTAL";
        ligneTotal[champTotal] = total;
        lignesExport.push(ligneTotal);
      }
      await exporterExcelMisEnForme(
        `Export_${nomAffiche.replace(/\s+/g, "_")}_Onyx_Pharm`,
        nomAffiche,
        lignesExport.length > 0 ? Object.keys(lignesExport[0]) : [],
        lignesExport
      );
    }
    setExportingType(null);
  }

  function telechargerModele() {
    exporterExcelMisEnForme(
      "Modèle_Articles_Onyx_Pharm",
      "Modèle",
      COLONNES_MODELE,
      []
    );
  }

  function validerLignes(brutes: Record<string, unknown>[]): LigneImport[] {
    const designationsVues = new Set<string>();

    return brutes.map((row, i) => {
      const erreurs: string[] = [];
      const designation = String(row["Désignation"] ?? "").trim();
      const quantite = row["Quantité en stock"];
      const stockMin = row["Stock minimum"];
      const prixVente = row["Prix de vente conseillé"];
      const dateExpiration = String(row["Date d'expiration"] ?? "").trim();

      if (!designation) erreurs.push("Désignation vide");
      if (designation && designationsVues.has(normaliser(designation))) {
        erreurs.push("Doublon dans le fichier");
      }
      if (designation) designationsVues.add(normaliser(designation));

      if (quantite !== "" && quantite !== undefined && Number.isNaN(Number(quantite))) {
        erreurs.push("Quantité invalide");
      }
      if (stockMin !== "" && stockMin !== undefined && Number.isNaN(Number(stockMin))) {
        erreurs.push("Stock minimum invalide");
      }
      if (prixVente !== "" && prixVente !== undefined && Number.isNaN(Number(prixVente))) {
        erreurs.push("Prix de vente invalide");
      }

      // Catégorie, sous-catégorie, fournisseur et emplacement ne sont
      // plus des erreurs bloquantes : s'ils n'existent pas déjà (une
      // fois la casse et les accents ignorés), ils seront créés
      // automatiquement à l'import.
      if (dateExpiration && Number.isNaN(Date.parse(dateExpiration))) {
        erreurs.push("Date d'expiration incorrecte");
      }

      return { index: i + 2, data: row, erreurs, valide: erreurs.length === 0 };
    });
  }

  async function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErreurGenerale(null);
    setResultat(null);
    try {
      const brutes = await lireFichierExcel(file);
      if (brutes.length === 0) {
        setErreurGenerale("Le fichier est vide ou illisible.");
        setLignes([]);
        return;
      }
      const colonnesFichier = Object.keys(brutes[0]);
      if (!colonnesFichier.includes("Désignation")) {
        setErreurGenerale(
          "Colonne manquante : \"Désignation\". Vérifiez que vous utilisez bien le modèle fourni."
        );
        setLignes([]);
        return;
      }
      setLignes(validerLignes(brutes));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[ONYX PHARM] Erreur lecture fichier import articles", e);
      setErreurGenerale("Impossible de lire ce fichier. Utilisez le modèle .xlsx fourni.");
    }
  }

  async function confirmerImport() {
    const valides = lignes.filter((l) => l.valide);
    if (valides.length === 0) return;

    setImporting(true);
    setErreurGenerale(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const stockInitialId = await getStockInitialId(supabase);

    // Copies de travail : ce qui est créé pendant cet import s'y ajoute
    // au fur et à mesure, pour que les lignes suivantes du même fichier
    // le retrouvent sans le recréer en double.
    const categoriesTravail = [...categories];
    const sousCategoriesTravail = [...sousCategories];
    const fournisseursTravail = [...fournisseurs];
    const emplacementsTravail = [...emplacements];

    let reussies = 0;
    let echouees = 0;

    for (const ligne of valides) {
      const row = ligne.data;

      const categorieId = await trouverOuCreer(
        String(row["Catégorie"] ?? ""),
        categoriesTravail,
        async (nomSaisi) => {
          const { data } = await supabase
            .from("categories")
            .insert({ nom: nomSaisi })
            .select("id, nom")
            .single();
          return data;
        }
      );

      const sousCategorieId = categorieId
        ? await trouverOuCreer(
            String(row["Sous-catégorie"] ?? ""),
            sousCategoriesTravail.filter((sc) => sc.categorie_id === categorieId),
            async (nomSaisi) => {
              const { data } = await supabase
                .from("sous_categories")
                .insert({ nom: nomSaisi, categorie_id: categorieId })
                .select("id, nom, categorie_id")
                .single();
              return data;
            }
          )
        : null;

      const fournisseurId = await trouverOuCreer(
        String(row["Fournisseur"] ?? ""),
        fournisseursTravail,
        async (nomSaisi) => {
          const { data } = await supabase
            .from("fournisseurs")
            .insert({ nom: nomSaisi })
            .select("id, nom")
            .single();
          return data;
        }
      );

      const emplacementId = await trouverOuCreer(
        String(row["Emplacement"] ?? ""),
        emplacementsTravail,
        async (nomSaisi) => {
          const { data } = await supabase
            .from("emplacements")
            .insert({ nom: nomSaisi })
            .select("id, nom")
            .single();
          return data;
        }
      );

      const statutValeur = String(row["Statut"] ?? "Actif").trim();
      const statutFinal = statutsArticle.some(
        (s) => normaliser(s.valeur) === normaliser(statutValeur)
      )
        ? statutsArticle.find((s) => normaliser(s.valeur) === normaliser(statutValeur))!.valeur
        : "Actif";

      const { data: article, error } = await supabase
        .from("articles")
        .insert({
          designation: String(row["Désignation"]).trim(),
          categorie_id: categorieId,
          sous_categorie_id: sousCategorieId,
          marque: String(row["Marque"] ?? "").trim() || null,
          fournisseur_id: fournisseurId,
          stock_minimum: Number(row["Stock minimum"]) || 0,
          prix_vente_conseille: Number(row["Prix de vente conseillé"]) || 0,
          numero_lot: String(row["Numéro de lot"] ?? "").trim() || null,
          date_expiration: String(row["Date d'expiration"] ?? "").trim() || null,
          statut: statutFinal,
          observations: String(row["Observations"] ?? "").trim() || null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();

      if (error || !article) {
        logSupabaseError(
          { table: "articles", operation: "insert (import Excel)" },
          error,
          ""
        );
        echouees += 1;
        continue;
      }

      const quantiteInitiale = Number(row["Quantité en stock"]) || 0;
      if (quantiteInitiale > 0 && emplacementId) {
        const { error: stockErr } = await supabase.from("stocks").upsert(
          {
            article_id: article.id,
            emplacement_id: emplacementId,
            conteneur_id: stockInitialId,
            quantite: quantiteInitiale,
          },
          { onConflict: "article_id,emplacement_id,conteneur_id" }
        );
        if (stockErr) {
          logSupabaseError(
            { table: "stocks", operation: "upsert (import Excel)" },
            stockErr,
            ""
          );
        }
        const { error: mouvementErr } = await supabase.from("mouvements_stock").insert({
          article_id: article.id,
          emplacement_id: emplacementId,
          type: "autre_entree",
          quantite: quantiteInitiale,
          document_type: "import_excel",
          observation: "Import Excel initial",
          created_by: user?.id ?? null,
        });
        if (mouvementErr) {
          logSupabaseError(
            { table: "mouvements_stock", operation: "insert (import Excel)" },
            mouvementErr,
            ""
          );
        }
      }
      reussies += 1;
    }

    setImporting(false);
    setResultat(
      `${reussies} article(s) importé(s) avec succès${
        echouees > 0 ? `, ${echouees} échec(s)` : ""
      }.`
    );
    setLignes([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const nbValides = lignes.filter((l) => l.valide).length;
  const nbErreurs = lignes.length - nbValides;

  return (
    <div>
      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        Import / Export
      </h1>
      <p className="mt-1 text-sm text-onyx-500">
        Exportez vos données en Excel, ou importez une liste d&apos;articles.
      </p>

      <div className="mt-6 rounded-xl border border-onyx-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-onyx-800">Exporter</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <SecondaryButton
            onClick={() =>
              exporterTable(
                "articles",
                "Articles",
                "articles",
                "designation, marque, prix_vente_conseille, stock_minimum, statut",
                (r) => ({
                  Désignation: r.designation,
                  Marque: r.marque,
                  "Prix de vente référence": r.prix_vente_conseille,
                  "Stock minimum": r.stock_minimum,
                  Statut: r.statut,
                })
              )
            }
            loading={exportingType === "articles"}
            className="min-h-0 px-3 py-1.5 text-xs"
          >
            <Download size={14} />
            Articles
          </SecondaryButton>

          <SecondaryButton
            onClick={() =>
              exporterTable(
                "ventes",
                "Ventes",
                "ventes",
                "reference, date_vente, montant_total, montant_paye, statut",
                (r) => ({
                  Référence: r.reference,
                  Date: r.date_vente,
                  Total: r.montant_total,
                  Payé: r.montant_paye,
                  Statut: r.statut,
                }),
                "Total"
              )
            }
            loading={exportingType === "ventes"}
            className="min-h-0 px-3 py-1.5 text-xs"
          >
            <Download size={14} />
            Ventes
          </SecondaryButton>

          <SecondaryButton
            onClick={() =>
              exporterTable(
                "conteneurs",
                "Conteneurs",
                "conteneurs",
                "code, date_arrivee, montant_achat_global, montant_paye, statut",
                (r) => ({
                  Code: r.code,
                  Date: r.date_arrivee,
                  "Montant d'achat": r.montant_achat_global,
                  Payé: r.montant_paye,
                  Statut: r.statut,
                }),
                "Montant d'achat"
              )
            }
            loading={exportingType === "conteneurs"}
            className="min-h-0 px-3 py-1.5 text-xs"
          >
            <Download size={14} />
            Conteneurs
          </SecondaryButton>

          <SecondaryButton
            onClick={() =>
              exporterTable(
                "encaissements",
                "Encaissements",
                "encaissements",
                "reference, date_operation, montant, categorie, description",
                (r) => ({
                  Référence: r.reference,
                  Date: r.date_operation,
                  Montant: r.montant,
                  Catégorie: r.categorie,
                  Description: r.description,
                }),
                "Montant"
              )
            }
            loading={exportingType === "encaissements"}
            className="min-h-0 px-3 py-1.5 text-xs"
          >
            <Download size={14} />
            Encaissements
          </SecondaryButton>

          <SecondaryButton
            onClick={() =>
              exporterTable(
                "decaissements",
                "Décaissements",
                "decaissements",
                "reference, date_operation, montant, categorie, description",
                (r) => ({
                  Référence: r.reference,
                  Date: r.date_operation,
                  Montant: r.montant,
                  Catégorie: r.categorie,
                  Description: r.description,
                }),
                "Montant"
              )
            }
            loading={exportingType === "decaissements"}
            className="min-h-0 px-3 py-1.5 text-xs"
          >
            <Download size={14} />
            Décaissements
          </SecondaryButton>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-onyx-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-onyx-800">
          Importer des articles
        </h2>
        <p className="mt-1 text-xs text-onyx-400">
          Téléchargez le modèle, remplissez-le, puis importez-le. Chaque
          ligne est contrôlée avant import.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <SecondaryButton
            onClick={telechargerModele}
            className="min-h-0 px-3 py-1.5 text-xs"
          >
            <FileSpreadsheet size={14} />
            Télécharger le modèle Excel
          </SecondaryButton>
          <SecondaryButton
            onClick={() => fileInputRef.current?.click()}
            className="min-h-0 px-3 py-1.5 text-xs"
          >
            <Upload size={14} />
            Choisir un fichier
          </SecondaryButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFichier}
            className="hidden"
          />
        </div>

        {erreurGenerale && (
          <div className="mt-3">
            <InlineBanner message={erreurGenerale} />
          </div>
        )}
        {resultat && (
          <div className="mt-3">
            <InlineBanner type="success" message={resultat} />
          </div>
        )}

        {lignes.length > 0 && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-onyx-50/50 px-3.5 py-2.5 text-sm">
              <span className="text-onyx-600">
                {lignes.length} ligne{lignes.length > 1 ? "s" : ""} détectée
                {lignes.length > 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 size={14} /> {nbValides} valide{nbValides > 1 ? "s" : ""}
              </span>
              {nbErreurs > 0 && (
                <span className="flex items-center gap-1 text-red-500">
                  <AlertCircle size={14} /> {nbErreurs} en erreur
                </span>
              )}
            </div>

            <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-onyx-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-onyx-50">
                  <tr className="text-left text-onyx-400">
                    <th className="px-3 py-2">Ligne</th>
                    <th className="px-3 py-2">Désignation</th>
                    <th className="px-3 py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.index} className="border-t border-onyx-50">
                      <td className="px-3 py-2 text-onyx-400">{l.index}</td>
                      <td className="px-3 py-2 text-onyx-700">
                        {String(l.data["Désignation"] ?? "—")}
                      </td>
                      <td className="px-3 py-2">
                        {l.valide ? (
                          <span className="text-emerald-600">Valide</span>
                        ) : (
                          <span className="text-red-500">
                            {l.erreurs.join(" · ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3">
              <PrimaryButton
                onClick={confirmerImport}
                loading={importing}
                disabled={nbValides === 0}
              >
                Importer {nbValides} article{nbValides > 1 ? "s" : ""}
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
