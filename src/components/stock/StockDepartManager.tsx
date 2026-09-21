"use client";

import { useState, useRef, useEffect } from "react";
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
import { exporterExcelMisEnForme, lireFichierExcel } from "@/lib/excel";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { useReferenceData } from "@/lib/hooks/useReferenceData";
import { useExporterTable } from "@/lib/hooks/useExporterTable";

// Colonnes fixes du modèle. Les emplacements s'insèrent dynamiquement
// entre les deux groupes (une colonne par emplacement actif du site),
// suivis de "Stock Disponible (contrôle uniquement)" — une colonne de contrôle qui doit
// correspondre à la somme des emplacements, pour repérer une erreur de
// saisie avant même d'importer.
const COLONNES_AVANT_EMPLACEMENT = [
  "Désignation",
  "Catégorie",
  "Sous-catégorie",
  "Marque",
  "Fournisseur",
  "Stock Alerte",
  "Prix de vente conseillé",
];
const COLONNES_APRES_EMPLACEMENT = [
  "Stock Disponible (contrôle uniquement)",
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

/**
 * "Stock de départ" — sert uniquement à la mise en place initiale du
 * catalogue (ce qu'on possédait déjà avant d'utiliser le site), séparé
 * volontairement de "Commande" qui sert aux arrivages ultérieurs. Voir
 * aussi Ventes > Ventes (import de ventes) et Tiers > Annuaire (import
 * clients/fournisseurs) pour les autres imports, chacun dans sa zone.
 */
export function StockDepartManager() {
  const supabase = createClient();
  const { categories, sousCategories, fournisseurs, emplacements, statutsArticle, loading: refDataLoading } =
    useReferenceData();
  const { exportingType, exporterTable } = useExporterTable();

  const [lignes, setLignes] = useState<LigneImport[]>([]);
  const [colonnesEmplacementFichier, setColonnesEmplacementFichier] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progression, setProgression] = useState({ actuel: 0, total: 0 });
  const [resultat, setResultat] = useState<string | null>(null);
  const [resultatErreur, setResultatErreur] = useState(false);
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  type LigneHistorique = {
    reference_document: string;
    created_at: string;
    designation: string;
    emplacement_nom: string;
    quantite: number;
  };
  const [historique, setHistorique] = useState<LigneHistorique[]>([]);
  const [historiqueOuvert, setHistoriqueOuvert] = useState<string | null>(null);
  const [historiqueLoading, setHistoriqueLoading] = useState(false);

  async function chargerHistorique() {
    setHistoriqueLoading(true);
    const { data } = await supabase
      .from("mouvements_stock")
      .select(
        "reference_document, created_at, quantite, articles(designation), emplacements(nom)"
      )
      .eq("document_type", "import_excel")
      .not("reference_document", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data) {
      setHistorique(
        (data as unknown as {
          reference_document: string;
          created_at: string;
          quantite: number;
          articles: { designation: string } | null;
          emplacements: { nom: string } | null;
        }[]).map((l) => ({
          reference_document: l.reference_document,
          created_at: l.created_at,
          designation: l.articles?.designation ?? "—",
          emplacement_nom: l.emplacements?.nom ?? "—",
          quantite: l.quantite,
        }))
      );
    }
    setHistoriqueLoading(false);
  }

  useEffect(() => {
    chargerHistorique();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function telechargerModele() {
    const emplacementsActifs = emplacements.filter((e) => e.actif);
    if (emplacementsActifs.length === 0) {
      setErreurGenerale(
        refDataLoading
          ? "Les emplacements sont encore en cours de chargement — patientez un instant puis réessayez."
          : "Aucun emplacement actif trouvé dans Paramètres > Emplacements. Créez-en au moins un avant de télécharger le modèle."
      );
      return;
    }
    const colonnes = [
      ...COLONNES_AVANT_EMPLACEMENT,
      ...emplacementsActifs.map((e) => e.nom),
      ...COLONNES_APRES_EMPLACEMENT,
    ];

    const ligneExemple: Record<string, string | number> = {
      Désignation: "Table d'opération",
      Catégorie: "Equipement",
      "Sous-catégorie": "Chirurgie",
      Marque: "",
      Fournisseur: "RAINY",
      "Stock Alerte": 2,
      "Prix de vente conseillé": 500000,
      "Numéro de lot": "",
      "Date d'expiration": "",
      Statut: "Actif",
      Observations: "",
    };
    // Une colonne par emplacement : la quantité de cet article s'y
    // saisit directement, sur cette seule ligne. "Stock Disponible (contrôle uniquement)" est
    // une colonne de contrôle, facultative — si elle est remplie, elle
    // doit correspondre à la somme des emplacements ; sinon l'import
    // signale l'écart avant de continuer.
    let total = 0;
    emplacementsActifs.forEach((e, i) => {
      const qte = i === 0 ? 5 : i === 1 ? 3 : 0;
      ligneExemple[e.nom] = qte;
      total += qte;
    });
    ligneExemple["Stock Disponible (contrôle uniquement)"] = total;

    exporterExcelMisEnForme("Modèle_Articles_Onyx_Pharm", "Modèle", colonnes, [
      ligneExemple,
    ]);
  }

  function validerLignes(
    brutes: Record<string, unknown>[],
    designationsExistantes: Set<string>,
    colonnesEmplacement: string[]
  ): LigneImport[] {
    const designationsVues = new Set<string>();

    return brutes.map((row, i) => {
      const erreurs: string[] = [];
      const designation = String(row["Désignation"] ?? "").trim();
      const stockAlerte = row["Stock Alerte"];
      const prixVente = row["Prix de vente conseillé"];
      const dateExpiration = String(row["Date d'expiration"] ?? "").trim();

      if (!designation) erreurs.push("Désignation vide");
      if (designation && designationsExistantes.has(normaliser(designation))) {
        erreurs.push("Cet article existe déjà dans le catalogue");
      }
      if (designation && designationsVues.has(normaliser(designation))) {
        erreurs.push("Doublon dans le fichier (deux lignes pour le même article)");
      }
      if (designation) designationsVues.add(normaliser(designation));

      if (stockAlerte !== "" && stockAlerte !== undefined && Number.isNaN(Number(stockAlerte))) {
        erreurs.push("Stock Alerte invalide");
      }
      if (prixVente !== "" && prixVente !== undefined && Number.isNaN(Number(prixVente))) {
        erreurs.push("Prix de vente invalide");
      }
      if (dateExpiration && Number.isNaN(Date.parse(dateExpiration))) {
        erreurs.push("Date d'expiration incorrecte");
      }

      // Chaque colonne du fichier qui n'est pas une colonne fixe est
      // traitée comme un emplacement — qu'il existe déjà dans
      // Paramètres ou non (il sera créé automatiquement à l'import,
      // comme partout ailleurs dans le site). Seule la valeur doit
      // être un nombre positif ou vide.
      let sommeEmplacements = 0;
      for (const nomColonne of colonnesEmplacement) {
        const valeur = row[nomColonne];
        if (valeur === undefined || valeur === "") continue;
        const nombre = Number(valeur);
        if (Number.isNaN(nombre) || nombre < 0) {
          erreurs.push(`Quantité invalide pour "${nomColonne}"`);
        } else {
          sommeEmplacements += nombre;
        }
      }

      // "Stock Disponible (contrôle uniquement)" est une colonne de contrôle facultative :
      // si elle est remplie, elle doit correspondre exactement à la
      // somme des emplacements — sinon, c'est très probablement une
      // erreur de saisie quelque part, signalée avant d'importer quoi
      // que ce soit.
      const stockDisponible = row["Stock Disponible (contrôle uniquement)"];
      if (stockDisponible !== "" && stockDisponible !== undefined) {
        const attendu = Number(stockDisponible);
        if (Number.isNaN(attendu)) {
          erreurs.push('"Stock Disponible (contrôle uniquement)" invalide');
        } else if (attendu !== sommeEmplacements) {
          erreurs.push(
            `"Stock Disponible (contrôle uniquement)" indique ${attendu}, mais seulement ${sommeEmplacements} a été réparti dans les colonnes d'emplacement ci-dessus. Corrigez la quantité dans le bon emplacement — cette colonne ne remplace jamais la répartition, elle la vérifie.`
          );
        }
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
        setColonnesEmplacementFichier([]);
        return;
      }
      const colonnesFichier = Object.keys(brutes[0]);
      if (!colonnesFichier.includes("Désignation")) {
        setErreurGenerale(
          "Colonne manquante : \"Désignation\". Vérifiez que vous utilisez bien le modèle fourni."
        );
        setLignes([]);
        setColonnesEmplacementFichier([]);
        return;
      }
      // Toute colonne du fichier qui n'est ni une colonne fixe ni
      // "Stock Disponible (contrôle uniquement)" est un emplacement — connu ou nouveau, peu
      // importe : il sera créé automatiquement à l'import s'il
      // n'existe pas encore (comme pour catégorie/fournisseur).
      // Comparaison normalisée (accents/majuscules ignorés) pour
      // qu'une colonne fixe légèrement mal tapée (ex : "designation"
      // sans accent) reste bien reconnue comme fixe — et ne soit
      // jamais prise à tort pour un emplacement à créer.
      const colonnesFixesNormalisees = new Set(
        [...COLONNES_AVANT_EMPLACEMENT, ...COLONNES_APRES_EMPLACEMENT].map(normaliser)
      );
      const colonnesEmplacement = colonnesFichier.filter(
        (c) => !colonnesFixesNormalisees.has(normaliser(c))
      );
      setColonnesEmplacementFichier(colonnesEmplacement);

      // Vérifie aussi les articles déjà existants en base, pour éviter
      // de créer des doublons — pas seulement les doublons internes au
      // fichier.
      const { data: articlesExistants } = await supabase
        .from("articles")
        .select("designation");
      const designationsExistantes = new Set(
        (articlesExistants ?? []).map((a) => normaliser(a.designation))
      );
      setLignes(validerLignes(brutes, designationsExistantes, colonnesEmplacement));
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
    setProgression({ actuel: 0, total: valides.length });
    setErreurGenerale(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const stockInitialId = await getStockInitialId(supabase);
    // Une seule référence pour tout cet import — permet de retrouver
    // exactement ce qui a été importé ensemble, à tout moment, même
    // après que le stock ait bougé depuis (ventes, corrections...).
    const referenceImport = `IMPORT-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;

    // Copies de travail : ce qui est créé pendant cet import s'y ajoute
    // au fur et à mesure, pour que les lignes suivantes du même fichier
    // le retrouvent sans le recréer en double.
    const categoriesTravail = [...categories];
    const sousCategoriesTravail = [...sousCategories];
    const fournisseursTravail = [...fournisseurs];
    const emplacementsTravail = [...emplacements];

    let reussies = 0;
    let echouees = 0;
    let totalQuantiteImportee = 0;
    const erreursEmplacement: string[] = [];

    for (const [indexBoucle, ligne] of Array.from(valides.entries())) {
      setProgression({ actuel: indexBoucle + 1, total: valides.length });
      const row = ligne.data;
      const designation = String(row["Désignation"]).trim();

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
        },
        async (nomSaisi) => {
          const { data } = await supabase
            .from("categories")
            .select("id, nom")
            .ilike("nom", nomSaisi)
            .limit(1)
            .maybeSingle();
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
            },
            async (nomSaisi) => {
              const { data } = await supabase
                .from("sous_categories")
                .select("id, nom, categorie_id")
                .eq("categorie_id", categorieId)
                .ilike("nom", nomSaisi)
                .limit(1)
                .maybeSingle();
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
        },
        async (nomSaisi) => {
          const { data } = await supabase
            .from("fournisseurs")
            .select("id, nom")
            .ilike("nom", nomSaisi)
            .limit(1)
            .maybeSingle();
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
          designation,
          categorie_id: categorieId,
          sous_categorie_id: sousCategorieId,
          marque: String(row["Marque"] ?? "").trim() || null,
          fournisseur_id: fournisseurId,
          stock_minimum: Number(row["Stock Alerte"]) || 0,
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

      // Une colonne par emplacement, telle que trouvée dans le fichier
      // (pas seulement celles déjà connues) : celle qui n'existe pas
      // encore dans Paramètres est créée automatiquement ici, avant
      // d'y écrire la quantité — exactement comme catégorie ou
      // fournisseur plus haut.
      for (const nomColonne of colonnesEmplacementFichier) {
        const valeurBrute = row[nomColonne];
        const quantite = Number(valeurBrute) || 0;
        if (quantite <= 0) continue;

        const emplacementId = await trouverOuCreer(
          nomColonne,
          emplacementsTravail,
          async (nomSaisi) => {
            const { data } = await supabase
              .from("emplacements")
              .insert({ nom: nomSaisi })
              .select("id, nom")
              .single();
            return data;
          },
          async (nomSaisi) => {
            const { data } = await supabase
              .from("emplacements")
              .select("id, nom")
              .ilike("nom", nomSaisi)
              .limit(1)
              .maybeSingle();
            return data;
          }
        );
        if (!emplacementId) {
          erreursEmplacement.push(nomColonne);
          continue;
        }

        const { error: stockErr } = await supabase.rpc(
          "ajouter_quantite_stock",
          {
            p_article_id: article.id,
            p_emplacement_id: emplacementId,
            p_conteneur_id: stockInitialId,
            p_quantite: quantite,
          }
        );
        if (stockErr) {
          logSupabaseError(
            { table: "stocks", operation: "rpc ajouter_quantite_stock (import Excel)" },
            stockErr,
            ""
          );
          erreursEmplacement.push(`${nomColonne} (${designation})`);
          continue;
        }
        const { error: mouvementErr } = await supabase.from("mouvements_stock").insert({
          article_id: article.id,
          emplacement_id: emplacementId,
          type: "autre_entree",
          quantite,
          document_type: "import_excel",
          reference_document: referenceImport,
          observation: `Import Excel initial — ${nomColonne}`,
          created_by: user?.id ?? null,
        });
        if (mouvementErr) {
          logSupabaseError(
            { table: "mouvements_stock", operation: "insert (import Excel)" },
            mouvementErr,
            ""
          );
        }
        totalQuantiteImportee += quantite;
      }

      reussies += 1;
    }

    setImporting(false);
    setResultatErreur(echouees > 0 || erreursEmplacement.length > 0);
    setResultat(
      `${reussies} article(s) importé(s) avec succès${
        echouees > 0 ? `, ${echouees} échec(s)` : ""
      } — ${totalQuantiteImportee} unité(s) au total réparties dans le stock. Référence de cet import : ${referenceImport} (retrouvable ci-dessous, à tout moment).` +
        (erreursEmplacement.length > 0
          ? ` ⚠️ ${erreursEmplacement.length} quantité(s) N'ONT PAS pu être enregistrées (emplacement introuvable ou erreur) : ${erreursEmplacement.slice(0, 5).join(", ")}${erreursEmplacement.length > 5 ? "..." : ""}`
          : "")
    );
    setLignes([]);
    setColonnesEmplacementFichier([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    chargerHistorique();
  }

  const nbValides = lignes.filter((l) => l.valide).length;
  const nbErreurs = lignes.length - nbValides;

  return (
    <div>
      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        Stock de départ
      </h1>
      <p className="mt-1 text-sm text-onyx-500">
        Pour la mise en place initiale du catalogue — ce que vous
        possédiez déjà avant d&apos;utiliser le site. Pour un nouvel
        arrivage, utilisez plutôt Stock &gt; Commandes.
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
                  "Stock Alerte": r.stock_minimum,
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
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-onyx-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-onyx-800">
          Importer des articles
        </h2>
        <p className="mt-1 text-xs text-onyx-400">
          Une ligne par article. Chaque emplacement a sa propre colonne —
          indiquez-y la quantité présente à cet endroit. &quot;Stock
          Disponible&quot; est facultatif : si rempli, il doit
          correspondre à la somme des emplacements, sinon l&apos;écart
          est signalé avant import.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <SecondaryButton
            onClick={telechargerModele}
            disabled={refDataLoading}
            className="min-h-0 px-3 py-1.5 text-xs"
          >
            <FileSpreadsheet size={14} />
            {refDataLoading
              ? "Chargement des emplacements..."
              : "Télécharger le modèle Excel"}
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
            <InlineBanner type={resultatErreur ? "error" : "success"} message={resultat} />
          </div>
        )}

        {lignes.length > 0 && (
          <div className="mt-4">
            {colonnesEmplacementFichier.length > 0 && (
              <div className="mb-3 rounded-lg border border-accent-200 bg-accent-50 px-3.5 py-2.5 text-sm text-accent-800">
                <strong>Emplacements détectés dans ce fichier :</strong>{" "}
                {colonnesEmplacementFichier.join(", ")}
                <br />
                <span className="text-xs text-accent-700">
                  Vérifiez cette liste — c&apos;est ce qui sera créé ou
                  utilisé comme emplacement. Une colonne mal orthographiée
                  ici serait créée en tant que nouvel emplacement par
                  erreur.
                </span>
              </div>
            )}
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
              {importing && progression.total > 0 && (
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-onyx-100">
                    <div
                      className="h-full rounded-full bg-accent-500 transition-all duration-200"
                      style={{
                        width: `${Math.round(
                          (progression.actuel / progression.total) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-onyx-400">
                    {progression.actuel} / {progression.total} traité
                    {progression.actuel > 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-onyx-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-onyx-800">
          Historique de mes imports
        </h2>
        <p className="mt-1 text-xs text-onyx-400">
          Exactement ce qui a été importé, à chaque fois — figé pour
          toujours, même si le stock a changé depuis (ventes,
          corrections...). Ce n&apos;est pas le stock actuel.
        </p>

        {historiqueLoading ? (
          <p className="mt-3 text-sm text-onyx-400">Chargement...</p>
        ) : historique.length === 0 ? (
          <p className="mt-3 text-sm text-onyx-400">
            Aucun import effectué pour le moment.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {Array.from(new Set(historique.map((l) => l.reference_document)))
              .map((ref) => {
                const lignesRef = historique.filter((l) => l.reference_document === ref);
                const totalRef = lignesRef.reduce((s, l) => s + l.quantite, 0);
                const dateRef = lignesRef[0]?.created_at;
                const estOuvert = historiqueOuvert === ref;
                return (
                  <div key={ref} className="rounded-lg border border-onyx-100">
                    <button
                      onClick={() => setHistoriqueOuvert(estOuvert ? null : ref)}
                      className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-onyx-50/50"
                    >
                      <span className="text-sm font-medium text-onyx-800">
                        {ref}
                      </span>
                      <span className="text-xs text-onyx-400">
                        {dateRef &&
                          new Date(dateRef).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                        · {lignesRef.length} ligne{lignesRef.length > 1 ? "s" : ""} ·{" "}
                        {totalRef} unité{totalRef > 1 ? "s" : ""} au total
                      </span>
                    </button>
                    {estOuvert && (
                      <div className="border-t border-onyx-50 px-3.5 py-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-onyx-400">
                              <th className="py-1.5">Article</th>
                              <th className="py-1.5">Emplacement</th>
                              <th className="py-1.5 text-right">Quantité</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lignesRef.map((l, i) => (
                              <tr key={i} className="border-t border-onyx-50">
                                <td className="py-1.5 text-onyx-700">{l.designation}</td>
                                <td className="py-1.5 text-onyx-500">{l.emplacement_nom}</td>
                                <td className="py-1.5 text-right text-onyx-600">
                                  {l.quantite}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
