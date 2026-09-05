"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Search, Pencil, Trash2, AlertTriangle, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { getStockInitialId } from "@/lib/conteneurs";
import {
  ArticleFormModal,
  EMPTY_ARTICLE_FORM,
  type ArticleFormValues,
} from "@/components/articles/ArticleForm";
import { useReferenceData } from "@/lib/hooks/useReferenceData";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { StatutBadge, InlineBanner } from "@/components/ui/Badges";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { PinModal } from "@/components/securite/PinModal";

type ArticleRow = {
  id: string;
  designation: string;
  marque: string | null;
  prix_vente_conseille: number;
  stock_minimum: number;
  numero_lot: string | null;
  date_expiration: string | null;
  statut: string;
  categorie_id: string | null;
  sous_categorie_id: string | null;
  fournisseur_id: string | null;
  observations: string | null;
  categories: { nom: string } | null;
  fournisseurs: { nom: string } | null;
  stocks: {
    quantite: number;
    emplacement_id: string;
    emplacements: { nom: string } | null;
    conteneurs: { code: string } | null;
  }[];
};

const DELAI_ALERTE_JOURS_DEFAUT = 30;

function joursAvantExpiration(date: string | null): number | null {
  if (!date) return null;
  const diff =
    (new Date(date).getTime() - new Date().setHours(0, 0, 0, 0)) /
    (1000 * 60 * 60 * 24);
  return Math.ceil(diff);
}

export function ArticlesManager({ embarque }: { embarque?: boolean } = {}) {
  const supabase = createClient();
  const { categories } = useReferenceData();

  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState("");
  const [filtreAlerte, setFiltreAlerte] = useState<
    "tous" | "stock_faible" | "expiration"
  >("tous");
  const [delaiAlerte, setDelaiAlerte] = useState(DELAI_ALERTE_JOURS_DEFAUT);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingValues, setEditingValues] =
    useState<ArticleFormValues>(EMPTY_ARTICLE_FORM);
  const [pinModalArticle, setPinModalArticle] = useState<ArticleRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ajustement, setAjustement] = useState<{
    articleId: string;
    designation: string;
    emplacementId: string;
    emplacementNom: string;
    quantiteActuelle: number;
  } | null>(null);
  const [nouvelleQuantite, setNouvelleQuantite] = useState("");
  const [ajustementSaving, setAjustementSaving] = useState(false);
  const [ajustementError, setAjustementError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [articlesRes, paramRes] = await Promise.all([
      supabase
        .from("articles")
        .select(
          "id, designation, marque, prix_vente_conseille, stock_minimum, numero_lot, date_expiration, statut, categorie_id, sous_categorie_id, fournisseur_id, observations, categories(nom), fournisseurs(nom), stocks(quantite, emplacement_id, emplacements(nom), conteneurs(code))"
        )
        .order("designation"),
      supabase
        .from("parametres_generaux")
        .select("valeur")
        .eq("cle", "delai_alerte_expiration_jours")
        .maybeSingle(),
    ]);

    if (articlesRes.data) setArticles(articlesRes.data as unknown as ArticleRow[]);
    if (paramRes.data?.valeur) {
      setDelaiAlerte(Number(paramRes.data.valeur) || DELAI_ALERTE_JOURS_DEFAUT);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(["articles", "stocks"], load);

  function openCreate() {
    setEditingValues(EMPTY_ARTICLE_FORM);
    setModalOpen(true);
  }

  function openEdit(article: ArticleRow) {
    setEditingValues({
      id: article.id,
      designation: article.designation,
      categorie_id: article.categorie_id ?? "",
      sous_categorie_id: article.sous_categorie_id ?? "",
      marque: article.marque ?? "",
      fournisseur_id: article.fournisseur_id ?? "",
      stock_minimum: String(article.stock_minimum),
      prix_vente_conseille: String(article.prix_vente_conseille),
      numero_lot: article.numero_lot ?? "",
      date_expiration: article.date_expiration ?? "",
      statut: article.statut,
      observations: article.observations ?? "",
    });
    setModalOpen(true);
  }

  async function confirmerSuppression(pin: string) {
    if (!pinModalArticle) return;
    const { error } = await supabase.rpc("supprimer_article", {
      p_article_id: pinModalArticle.id,
      p_pin: pin,
    });
    if (error) {
      throw new Error(
        logSupabaseError(
          { table: "articles", operation: "rpc supprimer_article" },
          error,
          "Impossible de supprimer cet article. Réessayez."
        )
      );
    }
    setPinModalArticle(null);
    load();
  }

  function openAjustement(
    articleId: string,
    designation: string,
    emplacementId: string,
    emplacementNom: string,
    quantiteActuelle: number
  ) {
    setAjustement({ articleId, designation, emplacementId, emplacementNom, quantiteActuelle });
    setNouvelleQuantite(String(quantiteActuelle));
    setAjustementError(null);
  }

  async function handleAjustement(e: React.FormEvent) {
    e.preventDefault();
    if (!ajustement) return;

    const nouvelle = Number(nouvelleQuantite);
    if (Number.isNaN(nouvelle) || nouvelle < 0) {
      setAjustementError("Quantité invalide.");
      return;
    }
    const delta = nouvelle - ajustement.quantiteActuelle;
    if (delta === 0) {
      setAjustement(null);
      return;
    }

    setAjustementSaving(true);
    setAjustementError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (delta < 0) {
      const { data: repartition, error: fifoError } = await supabase.rpc(
        "consommer_stock_fifo",
        {
          p_article_id: ajustement.articleId,
          p_emplacement_id: ajustement.emplacementId,
          p_quantite: -delta,
          p_conteneur_id: null,
        }
      );
      if (fifoError) {
        setAjustementError(
          logSupabaseError(
            { table: "stocks", operation: "rpc consommer_stock_fifo" },
            fifoError,
            "Impossible de corriger le stock. Réessayez."
          )
        );
        setAjustementSaving(false);
        return;
      }
      for (const part of repartition ?? []) {
        await supabase.from("mouvements_stock").insert({
          article_id: ajustement.articleId,
          emplacement_id: ajustement.emplacementId,
          type: "autre_sortie",
          quantite: -part.quantite,
          document_type: "ajustement_manuel",
          observation: "Correction manuelle de stock",
          created_by: user?.id ?? null,
        });
      }
    } else {
      const stockInitialId = await getStockInitialId(supabase);
      if (!stockInitialId) {
        setAjustementError(
          "Conteneur « Stock Initial » introuvable. Exécutez la migration 0015 dans Supabase."
        );
        setAjustementSaving(false);
        return;
      }
      const { error: upsertError } = await supabase.from("stocks").upsert(
        {
          article_id: ajustement.articleId,
          emplacement_id: ajustement.emplacementId,
          conteneur_id: stockInitialId,
          quantite: delta,
        },
        { onConflict: "article_id,emplacement_id,conteneur_id" }
      );
      if (upsertError) {
        setAjustementError(
          logSupabaseError(
            { table: "stocks", operation: "upsert" },
            upsertError,
            "Impossible de mettre à jour le stock. Réessayez."
          )
        );
        setAjustementSaving(false);
        return;
      }
      await supabase.from("mouvements_stock").insert({
        article_id: ajustement.articleId,
        emplacement_id: ajustement.emplacementId,
        type: "autre_entree",
        quantite: delta,
        document_type: "ajustement_manuel",
        observation: "Correction manuelle de stock",
        created_by: user?.id ?? null,
      });
    }

    setAjustementSaving(false);
    setAjustement(null);
    load();
  }

  const enrichis = useMemo(
    () =>
      articles.map((a) => {
        const stockTotal = a.stocks.reduce((sum, s) => sum + s.quantite, 0);
        const stockFaible = stockTotal <= a.stock_minimum;
        const jours = joursAvantExpiration(a.date_expiration);
        const expire = jours !== null && jours < 0;
        const bientotExpire =
          jours !== null && jours >= 0 && jours <= delaiAlerte;
        return { ...a, stockTotal, stockFaible, expire, bientotExpire, jours };
      }),
    [articles, delaiAlerte]
  );

  const filtres = enrichis.filter((a) => {
    if (
      search &&
      !`${a.designation} ${a.marque ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    if (filtreCategorie && a.categorie_id !== filtreCategorie) return false;
    if (filtreAlerte === "stock_faible" && !a.stockFaible) return false;
    if (
      filtreAlerte === "expiration" &&
      !(a.expire || a.bientotExpire)
    )
      return false;
    return true;
  });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {!embarque && (
            <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
              Articles
            </h1>
          )}
          <p className="mt-1 text-sm text-onyx-500">
            {enrichis.length} article{enrichis.length > 1 ? "s" : ""}
            {enrichis.filter((a) => a.stockFaible).length > 0 && (
              <> · {enrichis.filter((a) => a.stockFaible).length} en stock faible</>
            )}
          </p>
        </div>
        <PrimaryButton onClick={openCreate} className="shrink-0">
          <Plus size={17} />
          Nouvel article
        </PrimaryButton>
      </div>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-onyx-300"
          />
          <input
            type="search"
            placeholder="Rechercher un article..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-onyx-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          />
        </div>

        <select
          value={filtreCategorie}
          onChange={(e) => setFiltreCategorie(e.target.value)}
          className="rounded-lg border border-onyx-200 px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>

        <select
          value={filtreAlerte}
          onChange={(e) =>
            setFiltreAlerte(e.target.value as typeof filtreAlerte)
          }
          className="rounded-lg border border-onyx-200 px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        >
          <option value="tous">Toutes les alertes</option>
          <option value="stock_faible">Stock faible</option>
          <option value="expiration">Expiration proche/dépassée</option>
        </select>
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-onyx-400">
            Chargement...
          </p>
        ) : filtres.length === 0 ? (
          <div className="rounded-xl border border-dashed border-onyx-200 bg-white py-14 text-center">
            <p className="text-sm font-medium text-onyx-600">
              Aucun article trouvé
            </p>
          </div>
        ) : (
          <>
            {/* Vue cartes (mobile) */}
            <div className="grid grid-cols-1 gap-3 sm:hidden">
              {filtres.map((a) => (
                <div
                  key={a.id}
                  onClick={() => openEdit(a)}
                  className="rounded-xl border border-onyx-100 bg-white p-4 text-left active:bg-onyx-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-onyx-900">
                        {a.designation}
                      </p>
                      <p className="text-xs text-onyx-400">
                        {a.categories?.nom || "Sans catégorie"}
                        {a.marque ? ` · ${a.marque}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatutBadge statut={a.statut} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPinModalArticle(a);
                        }}
                        className="rounded-md p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Supprimer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        a.stockFaible
                          ? "bg-red-50 text-red-600"
                          : "bg-onyx-50 text-onyx-500"
                      }`}
                    >
                      Stock : {a.stockTotal}
                    </span>
                    {a.stockFaible && (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertTriangle size={12} /> Stock faible
                      </span>
                    )}
                    {(a.expire || a.bientotExpire) && (
                      <span className="flex items-center gap-1 text-accent-600">
                        <Clock size={12} />
                        {a.expire ? "Expiré" : `Expire dans ${a.jours} j`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Vue tableau (desktop) */}
            <div className="hidden overflow-x-auto rounded-xl border border-onyx-100 bg-white sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                    <th className="px-4 py-3" />
                    <th className="px-4 py-3">Désignation</th>
                    <th className="px-4 py-3">Catégorie</th>
                    <th className="px-4 py-3">Fournisseur</th>
                    <th className="px-4 py-3 text-right">Prix vente référence</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtres.map((a) => {
                    const estOuvert = expandedId === a.id;
                    const parEmplacement = new Map<
                      string,
                      { nom: string; total: number; conteneurs: { code: string; quantite: number }[] }
                    >();
                    for (const s of a.stocks) {
                      const cle = s.emplacement_id;
                      const entree = parEmplacement.get(cle) ?? {
                        nom: s.emplacements?.nom ?? "—",
                        total: 0,
                        conteneurs: [],
                      };
                      entree.total += s.quantite;
                      if (s.quantite > 0 && s.conteneurs) {
                        entree.conteneurs.push({ code: s.conteneurs.code, quantite: s.quantite });
                      }
                      parEmplacement.set(cle, entree);
                    }

                    return (
                      <>
                        <tr
                          key={a.id}
                          className="border-b border-onyx-50 last:border-0 hover:bg-onyx-50/40"
                        >
                          <td className="py-3 pl-3">
                            <button
                              onClick={() => setExpandedId(estOuvert ? null : a.id)}
                              className="rounded p-0.5 text-onyx-400 hover:bg-onyx-100"
                              aria-label="Détail du stock"
                            >
                              {estOuvert ? (
                                <ChevronDown size={16} />
                              ) : (
                                <ChevronRight size={16} />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-onyx-800">
                              {a.designation}
                            </p>
                            {a.marque && (
                              <p className="text-xs text-onyx-400">{a.marque}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-onyx-500">
                            {a.categories?.nom || "—"}
                          </td>
                          <td className="px-4 py-3 text-onyx-500">
                            {a.fournisseurs?.nom || "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-onyx-600">
                            {a.prix_vente_conseille.toLocaleString("fr-FR")}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                a.stockFaible
                                  ? "bg-red-50 text-red-600"
                                  : "bg-onyx-50 text-onyx-600"
                              }`}
                            >
                              {a.stockFaible && <AlertTriangle size={11} />}
                              {a.stockTotal}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <StatutBadge statut={a.statut} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEdit(a)}
                                className="rounded-md p-1.5 text-onyx-400 hover:bg-onyx-100 hover:text-onyx-700"
                                aria-label="Modifier"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => {
                                  setPinModalArticle(a);
                                }}
                                className="rounded-md p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                                aria-label="Supprimer"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {estOuvert && (
                          <tr className="border-b border-onyx-50 bg-onyx-50/30">
                            <td colSpan={8} className="px-4 py-3">
                              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-onyx-400">
                                Stock par emplacement
                              </p>
                              {parEmplacement.size === 0 ? (
                                <p className="text-sm text-onyx-400">
                                  Aucun stock enregistré pour cet article.
                                </p>
                              ) : (
                                <div className="space-y-1.5">
                                  {Array.from(parEmplacement.entries()).map(([emplId, info]) => (
                                    <div
                                      key={emplId}
                                      className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
                                    >
                                      <div>
                                        <span className="text-sm font-medium text-onyx-700">
                                          {info.nom}
                                        </span>
                                        {info.conteneurs.length > 0 && (
                                          <span className="ml-2 text-xs text-onyx-400">
                                            (
                                            {info.conteneurs
                                              .map((c) => `${c.code} : ${c.quantite}`)
                                              .join(" · ")}
                                            )
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-onyx-600">
                                          {info.total}
                                        </span>
                                        <button
                                          onClick={() =>
                                            openAjustement(
                                              a.id,
                                              a.designation,
                                              emplId,
                                              info.nom,
                                              info.total
                                            )
                                          }
                                          className="rounded-md p-1 text-onyx-400 hover:bg-onyx-100 hover:text-onyx-700"
                                          aria-label="Corriger la quantité"
                                        >
                                          <Pencil size={13} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <ArticleFormModal
          initialValues={editingValues}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}

      {pinModalArticle && (
        <PinModal
          title="Supprimer cet article"
          message={`Supprimer définitivement "${pinModalArticle.designation}" ? Cette action est irréversible.`}
          onCancel={() => setPinModalArticle(null)}
          onConfirm={confirmerSuppression}
        />
      )}

      {ajustement && (
        <Modal
          title={`Ajuster le stock — ${ajustement.emplacementNom}`}
          onClose={() => setAjustement(null)}
        >
          <form onSubmit={handleAjustement} className="space-y-4">
            {ajustementError && <InlineBanner message={ajustementError} />}
            <p className="text-sm text-onyx-500">{ajustement.designation}</p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Nouvelle quantité
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={nouvelleQuantite}
                onChange={(e) => setNouvelleQuantite(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
              <p className="mt-1 text-xs text-onyx-400">
                Quantité actuelle : {ajustement.quantiteActuelle}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <SecondaryButton
                type="button"
                onClick={() => setAjustement(null)}
                className="flex-1"
              >
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" loading={ajustementSaving} className="flex-1">
                Enregistrer
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
