"use client";

import { useEffect, useState, useCallback } from "react";
import { Package2, Plus, ArrowLeft, Pencil, Trash2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { lireFichierExcel, exporterExcelMisEnForme } from "@/lib/excel";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/FormControls";
import { StatutBadge, InlineBanner } from "@/components/ui/Badges";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { PinModal } from "@/components/securite/PinModal";
import { FournisseurSelect } from "@/components/tiers/FournisseurSelect";
import { useReferenceData } from "@/lib/hooks/useReferenceData";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

type ConteneurRow = {
  id: string;
  code: string;
  date_arrivee: string;
  montant_achat_global: number | null;
  montant_paye: number;
  statut: string;
  observation: string | null;
  fournisseurs: { nom: string } | null;
};

const COLONNES_MODELE = [
  "Désignation",
  "Catégorie",
  "Sous-catégorie",
  "Marque",
  "Fournisseur",
  "Prix de vente conseillé",
  "Date d'expiration",
  "Statut",
  "Observations",
  "Quantité",
  "Emplacement",
];

type ArticleOption = { id: string; designation: string };

type LigneManuelle = {
  article_id: string;
  designation: string;
  quantite: string;
  emplacement_id: string;
};

type LigneImportee = {
  index: number;
  data: Record<string, unknown>;
  erreurs: string[];
  valide: boolean;
  articleExistantId?: string;
};

export function ConteneursManager() {
  const [vue, setVue] = useState<"liste" | "creation" | "detail">("liste");
  const [conteneurOuvertId, setConteneurOuvertId] = useState<string | null>(null);

  if (vue === "creation") {
    return <NouveauConteneur onDone={() => setVue("liste")} />;
  }

  if (vue === "detail" && conteneurOuvertId) {
    return (
      <ConteneurDetail
        conteneurId={conteneurOuvertId}
        onBack={() => setVue("liste")}
      />
    );
  }

  return (
    <ListeConteneurs
      onCreate={() => setVue("creation")}
      onOpen={(id) => {
        setConteneurOuvertId(id);
        setVue("detail");
      }}
    />
  );
}

function ListeConteneurs({
  onCreate,
  onOpen,
}: {
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  const supabase = createClient();
  const [conteneurs, setConteneurs] = useState<ConteneurRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockParConteneur, setStockParConteneur] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [conteneursRes, stocksRes] = await Promise.all([
      supabase
        .from("conteneurs")
        .select("id, code, date_arrivee, montant_achat_global, montant_paye, statut, observation, fournisseurs(nom)")
        .order("date_arrivee", { ascending: false }),
      supabase.from("stocks").select("conteneur_id, quantite"),
    ]);
    if (conteneursRes.data) setConteneurs(conteneursRes.data as unknown as ConteneurRow[]);
    if (stocksRes.data) {
      const totals: Record<string, number> = {};
      for (const s of stocksRes.data) {
        totals[s.conteneur_id] = (totals[s.conteneur_id] || 0) + s.quantite;
      }
      setStockParConteneur(totals);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(["conteneurs", "stocks"], load);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
            Conteneurs
          </h1>
          <p className="mt-1 text-sm text-onyx-500">
            Chaque arrivée de marchandise est un lot indépendant, avec son
            propre prix d&apos;achat global. Le stock affiché ailleurs reste
            toujours la somme de tous les conteneurs.
          </p>
        </div>
        <PrimaryButton onClick={onCreate} className="shrink-0">
          <Plus size={17} />
          Nouveau conteneur
        </PrimaryButton>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-onyx-400">Chargement...</p>
        ) : conteneurs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-onyx-200 bg-white py-14 text-center">
            <p className="text-sm font-medium text-onyx-600">
              Aucun conteneur trouvé
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {conteneurs.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="block w-full rounded-xl border border-onyx-100 bg-white p-4 text-left hover:bg-onyx-50/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-onyx-50 text-onyx-500">
                      <Package2 size={16} />
                    </div>
                    <div>
                      <p className="font-medium text-onyx-900">{c.code}</p>
                      <p className="text-xs text-onyx-400">
                        {c.fournisseurs?.nom || "Sans fournisseur"} ·{" "}
                        {new Date(c.date_arrivee).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>
                  <StatutBadge statut={c.statut} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-onyx-400">Montant d&apos;achat global</p>
                    <p className="text-sm font-medium text-onyx-700">
                      {c.montant_achat_global !== null
                        ? `${c.montant_achat_global.toLocaleString("fr-FR")} FCFA`
                        : "Non renseigné"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-onyx-400">Stock restant (tous articles)</p>
                    <p className="text-sm font-medium text-onyx-700">
                      {stockParConteneur[c.id] || 0} unité{(stockParConteneur[c.id] || 0) > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {c.observation && (
                  <p className="mt-2 text-xs text-onyx-400">{c.observation}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function NouveauConteneur({ onDone }: { onDone: () => void }) {
  const supabase = createClient();
  const { emplacements, categories, sousCategories, fournisseurs, statutsArticle } =
    useReferenceData();
  const emplacementsActifs = emplacements.filter((e) => e.actif);

  const [code, setCode] = useState("");
  const [fournisseurId, setFournisseurId] = useState("");
  const [dateArrivee, setDateArrivee] = useState(new Date().toISOString().slice(0, 10));
  const [montant, setMontant] = useState("");
  const [observation, setObservation] = useState("");

  const [articlesOptions, setArticlesOptions] = useState<ArticleOption[]>([]);
  const [lignesManuelles, setLignesManuelles] = useState<LigneManuelle[]>([]);

  const [lignesImportees, setLignesImportees] = useState<LigneImportee[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("articles")
      .select("id, designation")
      .order("designation")
      .then(({ data }) => {
        if (data) setArticlesOptions(data as ArticleOption[]);
      });
    genererCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function genererCode() {
    const { data } = await supabase.rpc("generer_numero_document", { p_prefixe: "CTN" });
    if (data) setCode(data);
  }

  function ajouterLigneManuelle() {
    setLignesManuelles([
      ...lignesManuelles,
      { article_id: "", designation: "", quantite: "1", emplacement_id: emplacementsActifs[0]?.id ?? "" },
    ]);
  }

  function majLigneManuelle(index: number, patch: Partial<LigneManuelle>) {
    setLignesManuelles(lignesManuelles.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function supprimerLigneManuelle(index: number) {
    setLignesManuelles(lignesManuelles.filter((_, i) => i !== index));
  }

  function choisirArticleManuel(index: number, articleId: string) {
    const article = articlesOptions.find((a) => a.id === articleId);
    majLigneManuelle(index, { article_id: articleId, designation: article?.designation ?? "" });
  }

  function telechargerModele() {
    exporterExcelMisEnForme(
      "Modèle_Conteneur_Onyx_Pharm",
      "Modèle",
      COLONNES_MODELE,
      []
    );
  }

  function validerLignesImport(brutes: Record<string, unknown>[]): LigneImportee[] {
    return brutes.map((row, i) => {
      const erreurs: string[] = [];
      const designation = String(row["Désignation"] ?? "").trim();
      const categorie = String(row["Catégorie"] ?? "").trim();
      const sousCategorie = String(row["Sous-catégorie"] ?? "").trim();
      const fournisseur = String(row["Fournisseur"] ?? "").trim();
      const emplacement = String(row["Emplacement"] ?? "").trim();
      const quantite = row["Quantité"];
      const dateExpiration = String(row["Date d'expiration"] ?? "").trim();

      if (!designation) erreurs.push("Désignation vide");
      if (!emplacement) erreurs.push("Emplacement obligatoire");
      if (
        emplacement &&
        !emplacements.some((e) => e.nom.toLowerCase() === emplacement.toLowerCase())
      ) {
        erreurs.push(`Emplacement inexistant : "${emplacement}"`);
      }
      if (!quantite || Number.isNaN(Number(quantite)) || Number(quantite) <= 0) {
        erreurs.push("Quantité invalide");
      }
      if (categorie && !categories.some((c) => c.nom.toLowerCase() === categorie.toLowerCase())) {
        erreurs.push(`Catégorie inexistante : "${categorie}"`);
      }
      if (
        sousCategorie &&
        !sousCategories.some((sc) => sc.nom.toLowerCase() === sousCategorie.toLowerCase())
      ) {
        erreurs.push(`Sous-catégorie inexistante : "${sousCategorie}"`);
      }
      if (
        fournisseur &&
        !fournisseurs.some((f) => f.nom.toLowerCase() === fournisseur.toLowerCase())
      ) {
        erreurs.push(`Fournisseur inexistant : "${fournisseur}"`);
      }
      if (dateExpiration && Number.isNaN(Date.parse(dateExpiration))) {
        erreurs.push("Date d'expiration incorrecte");
      }

      const articleExistant = articlesOptions.find(
        (a) => a.designation.toLowerCase() === designation.toLowerCase()
      );

      return {
        index: i + 2,
        data: row,
        erreurs,
        valide: erreurs.length === 0,
        articleExistantId: articleExistant?.id,
      };
    });
  }

  async function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const brutes = await lireFichierExcel(file);
      if (brutes.length === 0) {
        setError("Le fichier est vide ou illisible.");
        return;
      }
      if (!Object.keys(brutes[0]).includes("Désignation")) {
        setError('Colonne manquante : "Désignation". Utilisez le modèle fourni.');
        return;
      }
      setLignesImportees(validerLignesImport(brutes));
    } catch {
      setError("Impossible de lire ce fichier. Utilisez le modèle .xlsx fourni.");
    }
    setFileInputKey((k) => k + 1);
  }

  const montantNumerique = montant.trim() ? Number(montant) : null;
  const nbLignesValides =
    lignesManuelles.filter((l) => l.article_id && Number(l.quantite) > 0).length +
    lignesImportees.filter((l) => l.valide).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!code.trim()) {
      setError("Le code du conteneur est obligatoire.");
      return;
    }
    if (nbLignesValides === 0) {
      setError("Ajoutez au moins un article (manuellement ou par import Excel).");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const lignesImporteesValides = lignesImportees.filter((l) => l.valide);
    const articlesACreer = lignesImporteesValides.filter((l) => !l.articleExistantId);
    const idsCrees = new Map<number, string>();

    for (const ligne of articlesACreer) {
      const row = ligne.data;
      const categorieId = categories.find(
        (c) => c.nom.toLowerCase() === String(row["Catégorie"] ?? "").trim().toLowerCase()
      )?.id;
      const sousCategorieId = sousCategories.find(
        (sc) => sc.nom.toLowerCase() === String(row["Sous-catégorie"] ?? "").trim().toLowerCase()
      )?.id;
      const fournisseurArticleId = fournisseurs.find(
        (f) => f.nom.toLowerCase() === String(row["Fournisseur"] ?? "").trim().toLowerCase()
      )?.id;
      const statutValeur = String(row["Statut"] ?? "Actif").trim();
      const statutFinal = statutsArticle.some(
        (s) => s.valeur.toLowerCase() === statutValeur.toLowerCase()
      )
        ? statutValeur
        : "Actif";

      const { data: article, error: articleError } = await supabase
        .from("articles")
        .insert({
          designation: String(row["Désignation"]).trim(),
          categorie_id: categorieId ?? null,
          sous_categorie_id: sousCategorieId ?? null,
          marque: String(row["Marque"] ?? "").trim() || null,
          fournisseur_id: fournisseurArticleId ?? null,
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

      if (articleError || !article) {
        setError(
          logSupabaseError(
            { table: "articles", operation: "insert (conteneur)" },
            articleError,
            `Impossible de créer l'article "${row["Désignation"]}". Le conteneur n'a pas été créé.`
          )
        );
        setSaving(false);
        return;
      }
      idsCrees.set(ligne.index, article.id);
    }

    const lignesFinal: { article_id: string; emplacement_id: string; quantite: number }[] = [];

    for (const l of lignesManuelles) {
      if (l.article_id && Number(l.quantite) > 0) {
        lignesFinal.push({
          article_id: l.article_id,
          emplacement_id: l.emplacement_id,
          quantite: Number(l.quantite),
        });
      }
    }

    for (const ligne of lignesImporteesValides) {
      const articleId = ligne.articleExistantId ?? idsCrees.get(ligne.index);
      if (!articleId) continue;
      const emplacementNom = String(ligne.data["Emplacement"] ?? "").trim();
      const emplacement = emplacements.find(
        (e) => e.nom.toLowerCase() === emplacementNom.toLowerCase()
      );
      if (!emplacement) continue;
      lignesFinal.push({
        article_id: articleId,
        emplacement_id: emplacement.id,
        quantite: Number(ligne.data["Quantité"]),
      });
    }

    const { error: rpcError } = await supabase.rpc("creer_conteneur", {
      p_code: code.trim(),
      p_fournisseur_id: fournisseurId || null,
      p_date_arrivee: dateArrivee,
      p_montant_achat_global: montantNumerique,
      p_observation: observation.trim() || null,
      p_lignes: lignesFinal,
      p_utilisateur_id: user?.id ?? null,
    });

    setSaving(false);

    if (rpcError) {
      setError(
        logSupabaseError(
          { table: "conteneurs", operation: "rpc creer_conteneur" },
          rpcError,
          rpcError.code === "23505"
            ? "Ce code de conteneur existe déjà."
            : "Impossible de créer le conteneur. Réessayez."
        )
      );
      return;
    }

    onDone();
  }

  const nbErreursImport = lignesImportees.length - lignesImportees.filter((l) => l.valide).length;

  return (
    <div>
      <button
        onClick={onDone}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-onyx-500 hover:text-onyx-800"
      >
        <ArrowLeft size={16} />
        Retour aux conteneurs
      </button>

      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        Nouveau conteneur
      </h1>
      <p className="mt-1 text-sm text-onyx-500">
        Un seul montant d&apos;achat global pour tout le conteneur — aucun
        prix par article.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        {error && <InlineBanner message={error} />}

        <div className="grid grid-cols-1 gap-4 rounded-xl border border-onyx-100 bg-white p-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-onyx-700">
              Code du conteneur
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <FournisseurSelect value={fournisseurId} onChange={setFournisseurId} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-onyx-700">
              Date d&apos;arrivée
            </label>
            <input
              type="date"
              required
              value={dateArrivee}
              onChange={(e) => setDateArrivee(e.target.value)}
              className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-onyx-700">
              Montant d&apos;achat global (FCFA) — optionnel
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Laissez vide si non renseigné"
              className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-onyx-700">
              Observation
            </label>
            <input
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
            />
          </div>
        </div>

        <div className="rounded-xl border border-onyx-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-onyx-800">
            Ajouter des articles par import Excel
          </h2>
          <p className="mt-1 text-xs text-onyx-400">
            Méthode recommandée pour un conteneur avec plusieurs articles —
            évite la saisie manuelle répétitive. Les articles inconnus du
            catalogue sont créés automatiquement.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <SecondaryButton onClick={telechargerModele} type="button" className="min-h-0 px-3 py-1.5 text-xs">
              <FileSpreadsheet size={14} />
              Télécharger le modèle
            </SecondaryButton>
            <label className="flex min-h-0 cursor-pointer items-center gap-1.5 rounded-lg border border-onyx-200 px-3 py-1.5 text-xs font-medium text-onyx-700 hover:bg-onyx-50">
              <Upload size={14} />
              Choisir un fichier
              <input
                key={fileInputKey}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFichier}
                className="hidden"
              />
            </label>
          </div>

          {lignesImportees.length > 0 && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-onyx-50/50 px-3.5 py-2.5 text-sm">
                <span className="text-onyx-600">{lignesImportees.length} ligne(s) détectée(s)</span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 size={14} /> {lignesImportees.filter((l) => l.valide).length} valide(s)
                </span>
                {nbErreursImport > 0 && (
                  <span className="flex items-center gap-1 text-red-500">
                    <AlertCircle size={14} /> {nbErreursImport} en erreur
                  </span>
                )}
              </div>
              <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-onyx-100">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-onyx-50">
                    <tr className="text-left text-onyx-400">
                      <th className="px-3 py-2">Ligne</th>
                      <th className="px-3 py-2">Désignation</th>
                      <th className="px-3 py-2">Qté</th>
                      <th className="px-3 py-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesImportees.map((l) => (
                      <tr key={l.index} className="border-t border-onyx-50">
                        <td className="px-3 py-2 text-onyx-400">{l.index}</td>
                        <td className="px-3 py-2 text-onyx-700">
                          {String(l.data["Désignation"] ?? "—")}
                          {l.valide && !l.articleExistantId && (
                            <span className="ml-1.5 rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-700">
                              nouvel article
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-onyx-500">{String(l.data["Quantité"] ?? "—")}</td>
                        <td className="px-3 py-2">
                          {l.valide ? (
                            <span className="text-emerald-600">Valide</span>
                          ) : (
                            <span className="text-red-500">{l.erreurs.join(" · ")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-onyx-100 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-onyx-800">
              Ajouter un article manuellement
            </h2>
            <SecondaryButton
              type="button"
              onClick={ajouterLigneManuelle}
              className="min-h-0 px-3 py-1.5 text-xs"
            >
              <Plus size={14} />
              Ajouter une ligne
            </SecondaryButton>
          </div>

          {lignesManuelles.length > 0 && (
            <div className="mt-3 space-y-2">
              {lignesManuelles.map((l, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-onyx-100 bg-onyx-50/40 p-3 sm:grid-cols-12 sm:items-end"
                >
                  <div className="sm:col-span-5">
                    <label className="mb-1 block text-xs font-medium text-onyx-500">Article</label>
                    <select
                      value={l.article_id}
                      onChange={(e) => choisirArticleManuel(i, e.target.value)}
                      required
                      className="w-full rounded-md border border-onyx-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                    >
                      <option value="">— Article existant —</option>
                      {articlesOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.designation}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-onyx-500">Quantité</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={l.quantite}
                      onChange={(e) => majLigneManuelle(i, { quantite: e.target.value })}
                      className="w-full rounded-md border border-onyx-200 px-2.5 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="mb-1 block text-xs font-medium text-onyx-500">Emplacement</label>
                    <select
                      value={l.emplacement_id}
                      onChange={(e) => majLigneManuelle(i, { emplacement_id: e.target.value })}
                      required
                      className="w-full rounded-md border border-onyx-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                    >
                      {emplacementsActifs.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end sm:col-span-1">
                    <button
                      type="button"
                      onClick={() => supprimerLigneManuelle(i)}
                      className="rounded-md p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-onyx-100 bg-onyx-50/40 p-4">
          <p className="text-sm text-onyx-600">
            {nbLignesValides} article(s) prêt(s) à entrer en stock
            {montantNumerique !== null && (
              <>
                {" "}
                · Montant global :{" "}
                <span className="font-medium">
                  {montantNumerique.toLocaleString("fr-FR")} FCFA
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex gap-3">
          <SecondaryButton type="button" onClick={onDone} className="flex-1">
            Annuler
          </SecondaryButton>
          <PrimaryButton type="submit" loading={saving} className="flex-1">
            Créer le conteneur
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

function ConteneurDetail({
  conteneurId,
  onBack,
}: {
  conteneurId: string;
  onBack: () => void;
}) {
  const supabase = createClient();
  const [conteneur, setConteneur] = useState<
    (ConteneurRow & { fournisseur_id: string | null }) | null
  >(null);
  const [lignes, setLignes] = useState<
    {
      id: string;
      quantite: number;
      articles: { designation: string } | null;
      emplacements: { nom: string } | null;
    }[]
  >([]);
  const [paiements, setPaiements] = useState<
    { id: string; montant: number; mode_paiement: string; date_paiement: string }[]
  >([]);
  const [coutRevient, setCoutRevient] = useState<{
    stock_restant: number;
    revenu_realise: number;
    marge: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [paiementModalOpen, setPaiementModalOpen] = useState(false);
  const [montantPaiement, setMontantPaiement] = useState("");
  const [modePaiement, setModePaiement] = useState("Espèces");

  const [editionOuverte, setEditionOuverte] = useState(false);
  const [editCode, setEditCode] = useState("");
  const [editFournisseurId, setEditFournisseurId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editMontant, setEditMontant] = useState("");
  const [editObservation, setEditObservation] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [suppressionOuverte, setSuppressionOuverte] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [conteneurRes, lignesRes, paiementsRes, coutRevientRes] = await Promise.all([
      supabase
        .from("conteneurs")
        .select(
          "id, code, date_arrivee, montant_achat_global, montant_paye, statut, observation, fournisseur_id, fournisseurs(nom)"
        )
        .eq("id", conteneurId)
        .single(),
      supabase
        .from("stocks")
        .select("id, quantite, articles(designation), emplacements(nom)")
        .eq("conteneur_id", conteneurId)
        .gt("quantite", 0),
      supabase
        .from("paiements_conteneurs")
        .select("id, montant, mode_paiement, date_paiement")
        .eq("conteneur_id", conteneurId)
        .order("date_paiement", { ascending: false }),
      supabase
        .from("v_cout_revient_conteneurs")
        .select("stock_restant, revenu_realise, marge")
        .eq("conteneur_id", conteneurId)
        .maybeSingle(),
    ]);

    if (conteneurRes.data)
      setConteneur(conteneurRes.data as unknown as ConteneurRow & { fournisseur_id: string | null });
    if (lignesRes.data) setLignes(lignesRes.data as unknown as typeof lignes);
    if (paiementsRes.data) setPaiements(paiementsRes.data);
    if (coutRevientRes.data) setCoutRevient(coutRevientRes.data);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteneurId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAjouterPaiement(e: React.FormEvent) {
    e.preventDefault();
    if (!conteneur || conteneur.montant_achat_global === null) return;
    const montant = Number(montantPaiement);
    const reste = conteneur.montant_achat_global - conteneur.montant_paye;
    if (!montant || montant <= 0) {
      setError("Montant invalide.");
      return;
    }
    if (montant > reste) {
      setError(`Le montant dépasse le reste à payer (${reste.toLocaleString("fr-FR")} FCFA).`);
      return;
    }

    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("paiements_conteneurs").insert({
      conteneur_id: conteneurId,
      montant,
      mode_paiement: modePaiement,
      created_by: user?.id ?? null,
    });

    setBusy(false);
    if (error) {
      setError(
        logSupabaseError(
          { table: "paiements_conteneurs", operation: "insert" },
          error,
          "Impossible d'enregistrer ce paiement. Réessayez."
        )
      );
      return;
    }
    setPaiementModalOpen(false);
    setMontantPaiement("");
    load();
  }

  function ouvrirEdition() {
    if (!conteneur) return;
    setEditCode(conteneur.code);
    setEditFournisseurId(conteneur.fournisseur_id ?? "");
    setEditDate(conteneur.date_arrivee);
    setEditMontant(
      conteneur.montant_achat_global !== null
        ? String(conteneur.montant_achat_global)
        : ""
    );
    setEditObservation(conteneur.observation ?? "");
    setEditError(null);
    setEditionOuverte(true);
  }

  async function handleModifier(e: React.FormEvent) {
    e.preventDefault();
    if (!editCode.trim()) {
      setEditError("Le code du conteneur est obligatoire.");
      return;
    }
    setEditSaving(true);
    setEditError(null);

    const { error } = await supabase.rpc("modifier_conteneur", {
      p_conteneur_id: conteneurId,
      p_code: editCode.trim(),
      p_fournisseur_id: editFournisseurId || null,
      p_date_arrivee: editDate,
      p_montant_achat_global: editMontant.trim() ? Number(editMontant) : null,
      p_observation: editObservation.trim() || null,
    });

    setEditSaving(false);
    if (error) {
      setEditError(
        logSupabaseError(
          { table: "conteneurs", operation: "rpc modifier_conteneur" },
          error,
          error.code === "23505"
            ? "Ce code de conteneur existe déjà."
            : "Impossible d'enregistrer les modifications."
        )
      );
      return;
    }
    setEditionOuverte(false);
    load();
  }

  async function confirmerSuppressionConteneur(pin: string) {
    const { error } = await supabase.rpc("supprimer_conteneur", {
      p_conteneur_id: conteneurId,
      p_pin: pin,
    });
    if (error) {
      throw new Error(
        logSupabaseError(
          { table: "conteneurs", operation: "rpc supprimer_conteneur" },
          error,
          "Impossible de supprimer ce conteneur."
        )
      );
    }
    setSuppressionOuverte(false);
    onBack();
  }

  if (loading || !conteneur) {
    return <p className="py-10 text-center text-sm text-onyx-400">Chargement...</p>;
  }

  const montantDefini = conteneur.montant_achat_global !== null;
  const reste = montantDefini ? conteneur.montant_achat_global! - conteneur.montant_paye : 0;

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-onyx-500 hover:text-onyx-800"
      >
        <ArrowLeft size={16} />
        Retour aux conteneurs
      </button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-onyx-900 sm:text-2xl">
            {conteneur.code}
            <StatutBadge statut={conteneur.statut} />
          </h1>
          <p className="mt-1 text-sm text-onyx-500">
            {conteneur.fournisseurs?.nom || "Sans fournisseur"} ·{" "}
            {new Date(conteneur.date_arrivee).toLocaleDateString("fr-FR")}
          </p>
        </div>

        <div className="flex gap-2">
          <SecondaryButton onClick={ouvrirEdition}>
            <Pencil size={16} />
            Modifier
          </SecondaryButton>
          <SecondaryButton
            onClick={() => setSuppressionOuverte(true)}
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 size={16} />
            Supprimer
          </SecondaryButton>
        </div>
      </div>

      {montantDefini && reste > 0 && (
        <div className="mt-3">
          <PrimaryButton
            onClick={() => {
              setMontantPaiement(String(reste));
              setError(null);
              setPaiementModalOpen(true);
            }}
          >
            <CreditCard size={16} />
            Enregistrer un paiement
          </PrimaryButton>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <InlineBanner message={error} />
        </div>
      )}

      {montantDefini ? (
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-onyx-100 bg-white p-4 text-center">
            <p className="text-lg font-semibold text-onyx-900">
              {conteneur.montant_achat_global!.toLocaleString("fr-FR")}
            </p>
            <p className="text-xs text-onyx-400">Total (FCFA)</p>
          </div>
          <div className="rounded-xl border border-onyx-100 bg-white p-4 text-center">
            <p className="text-lg font-semibold text-emerald-600">
              {conteneur.montant_paye.toLocaleString("fr-FR")}
            </p>
            <p className="text-xs text-onyx-400">Payé</p>
          </div>
          <div className="rounded-xl border border-onyx-100 bg-white p-4 text-center">
            <p className={`text-lg font-semibold ${reste > 0 ? "text-red-500" : "text-onyx-400"}`}>
              {reste.toLocaleString("fr-FR")}
            </p>
            <p className="text-xs text-onyx-400">Reste (dette)</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-onyx-400">
          Aucun montant d&apos;achat renseigné pour ce conteneur — pas de
          suivi de paiement possible.
        </p>
      )}

      {/* Coût de revient : uniquement calculable quand le conteneur est
          entièrement écoulé (plus aucun stock) et qu'un montant d'achat a
          été renseigné. Toujours recalculé à la volée. */}
      <div className="mt-5 rounded-xl border border-onyx-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-onyx-800">
          Coût de revient du conteneur
        </h2>
        {!montantDefini ? (
          <p className="mt-1.5 text-sm text-onyx-400">
            Non calculable : aucun montant d&apos;achat renseigné pour ce
            conteneur.
          </p>
        ) : coutRevient && coutRevient.stock_restant > 0 ? (
          <p className="mt-1.5 text-sm text-onyx-400">
            Conteneur pas encore entièrement écoulé ({coutRevient.stock_restant}{" "}
            unité{coutRevient.stock_restant > 1 ? "s" : ""} restante
            {coutRevient.stock_restant > 1 ? "s" : ""}) — le coût de revient
            sera calculé automatiquement une fois tout vendu.
          </p>
        ) : coutRevient ? (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-sm font-medium text-onyx-700">
                {coutRevient.revenu_realise.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-400">Revenu réalisé</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-onyx-700">
                {conteneur.montant_achat_global!.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-400">Coût d&apos;achat</p>
            </div>
            <div className="text-center">
              <p
                className={`text-sm font-semibold ${
                  (coutRevient.marge ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {(coutRevient.marge ?? 0).toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-400">Marge du conteneur</p>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-onyx-400">Chargement...</p>
        )}
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-onyx-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
              <th className="px-4 py-3">Article</th>
              <th className="px-4 py-3">Emplacement</th>
              <th className="px-4 py-3 text-right">Quantité restante</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-onyx-400">
                  Ce conteneur ne contient plus aucun article en stock.
                </td>
              </tr>
            ) : (
              lignes.map((l) => (
                <tr key={l.id} className="border-b border-onyx-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-onyx-800">
                    {l.articles?.designation}
                  </td>
                  <td className="px-4 py-2.5 text-onyx-500">{l.emplacements?.nom}</td>
                  <td className="px-4 py-2.5 text-right text-onyx-600">{l.quantite}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {montantDefini && (
        <div className="mt-5">
          <h2 className="text-sm font-semibold text-onyx-800">Paiements</h2>
          {paiements.length === 0 ? (
            <p className="mt-2 text-sm text-onyx-400">Aucun paiement enregistré.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {paiements.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-onyx-100 bg-white px-4 py-2.5 text-sm"
                >
                  <span className="text-onyx-600">
                    {new Date(p.date_paiement).toLocaleDateString("fr-FR")} · {p.mode_paiement}
                  </span>
                  <span className="font-medium text-onyx-800">
                    {p.montant.toLocaleString("fr-FR")} FCFA
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {paiementModalOpen && (
        <Modal title="Enregistrer un paiement" onClose={() => setPaiementModalOpen(false)}>
          <form onSubmit={handleAjouterPaiement} className="space-y-4">
            {error && <InlineBanner message={error} />}
            <p className="text-sm text-onyx-500">
              Reste à payer :{" "}
              <span className="font-medium text-onyx-800">{reste.toLocaleString("fr-FR")} FCFA</span>
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">Montant</label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={montantPaiement}
                onChange={(e) => setMontantPaiement(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <SelectField
              id="mode-paiement-conteneur"
              label="Mode de paiement"
              value={modePaiement}
              onChange={(e) => setModePaiement(e.target.value)}
            >
              <option value="Espèces">Espèces</option>
              <option value="Banque">Banque</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Autre">Autre</option>
            </SelectField>
            <div className="flex gap-3 pt-2">
              <SecondaryButton type="button" onClick={() => setPaiementModalOpen(false)} className="flex-1">
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" loading={busy} className="flex-1">
                Enregistrer
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {editionOuverte && (
        <Modal title="Modifier le conteneur" onClose={() => setEditionOuverte(false)}>
          <form onSubmit={handleModifier} className="space-y-4">
            {editError && <InlineBanner message={editError} />}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Code du conteneur
              </label>
              <input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                required
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <FournisseurSelect value={editFournisseurId} onChange={setEditFournisseurId} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Date d&apos;arrivée
              </label>
              <input
                type="date"
                required
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Montant d&apos;achat global (FCFA) — optionnel
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={editMontant}
                onChange={(e) => setEditMontant(e.target.value)}
                placeholder="Laissez vide si non renseigné"
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Observation
              </label>
              <input
                value={editObservation}
                onChange={(e) => setEditObservation(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <SecondaryButton
                type="button"
                onClick={() => setEditionOuverte(false)}
                className="flex-1"
              >
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" loading={editSaving} className="flex-1">
                Enregistrer
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {suppressionOuverte && (
        <PinModal
          title="Supprimer ce conteneur"
          message={
            (coutRevient?.stock_restant ?? 0) > 0
              ? `Ce conteneur contient encore ${coutRevient?.stock_restant} unité(s) en stock : la suppression sera refusée tant qu'il n'est pas entièrement écoulé ou transféré.`
              : `Supprimer définitivement le conteneur "${conteneur.code}" ? Refusé automatiquement si des ventes y font déjà référence.`
          }
          onCancel={() => setSuppressionOuverte(false)}
          onConfirm={confirmerSuppressionConteneur}
        />
      )}
    </div>
  );
}
