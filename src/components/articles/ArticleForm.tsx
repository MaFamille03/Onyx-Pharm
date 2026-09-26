"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { classerCorrespondances } from "@/lib/normaliser";
import { getStockInitialId } from "@/lib/conteneurs";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/auth/FormField";
import { TextareaField, SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { Pencil, Package, Info, Search } from "lucide-react";
import {
  useReferenceData,
  type RefEmplacement,
} from "@/lib/hooks/useReferenceData";

export type ArticleFormValues = {
  id?: string;
  designation: string;
  categorie_id: string;
  sous_categorie_id: string;
  marque: string;
  fournisseur_id: string;
  stock_minimum: string;
  prix_vente_conseille: string;
  numero_lot: string;
  date_expiration: string;
  statut: string;
  observations: string;
};

export const EMPTY_ARTICLE_FORM: ArticleFormValues = {
  designation: "",
  categorie_id: "",
  sous_categorie_id: "",
  marque: "",
  fournisseur_id: "",
  stock_minimum: "0",
  prix_vente_conseille: "",
  numero_lot: "",
  date_expiration: "",
  statut: "Actif",
  observations: "",
};

export function ArticleFormModal({
  initialValues,
  stockParEmplacement,
  onClose,
  onSaved,
}: {
  initialValues: ArticleFormValues;
  /** Quantité actuelle par emplacement (id → quantité), pour pré-remplir
   * et permettre la correction directement dans ce formulaire. */
  stockParEmplacement?: Record<string, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const {
    categories,
    sousCategories,
    fournisseurs,
    emplacements,
    statutsArticle,
    loading: loadingRef,
  } = useReferenceData();

  const [form, setForm] = useState(initialValues);
  const [baselineStock, setBaselineStock] = useState<Record<string, number>>(
    stockParEmplacement ?? {}
  );
  const [stockInitial, setStockInitial] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      for (const [id, qte] of Object.entries(stockParEmplacement ?? {})) {
        if (qte > 0) init[id] = String(qte);
      }
      return init;
    }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [articleExistantDetecte, setArticleExistantDetecte] = useState(false);
  const [suggestionsArticle, setSuggestionsArticle] = useState<
    Array<{ id: string; designation: string; marque: string | null; scoreCorrespondance: number }>
  >([]);
  const [rechercheArticleEnCours, setRechercheArticleEnCours] = useState(false);
  const rechercheArticleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEdition = Boolean(form.id);
  const [expirationApplicable, setExpirationApplicable] = useState(
    Boolean(initialValues.date_expiration)
  );

  const sousCategoriesFiltrees = useMemo(
    () =>
      sousCategories.filter((sc) => sc.categorie_id === form.categorie_id),
    [sousCategories, form.categorie_id]
  );

  const emplacementsActifs = emplacements.filter((e) => e.actif);

  async function chargerArticleExistant(articleId: string) {
    const { data } = await supabase
      .from("articles")
      .select(
        "id, designation, categorie_id, sous_categorie_id, marque, fournisseur_id, stock_minimum, prix_vente_conseille, numero_lot, date_expiration, statut, observations"
      )
      .eq("id", articleId)
      .maybeSingle();

    if (!data) return;

    setForm({
      id: data.id,
      designation: data.designation,
      categorie_id: data.categorie_id ?? "",
      sous_categorie_id: data.sous_categorie_id ?? "",
      marque: data.marque ?? "",
      fournisseur_id: data.fournisseur_id ?? "",
      stock_minimum: String(data.stock_minimum ?? 0),
      prix_vente_conseille: String(data.prix_vente_conseille ?? 0),
      numero_lot: data.numero_lot ?? "",
      date_expiration: data.date_expiration ?? "",
      statut: data.statut,
      observations: data.observations ?? "",
    });
    setExpirationApplicable(Boolean(data.date_expiration));
    setArticleExistantDetecte(true);
    setSuggestionsArticle([]);

    const { data: stocks } = await supabase
      .from("stocks")
      .select("emplacement_id, quantite")
      .eq("article_id", data.id);
    const parEmpl: Record<string, number> = {};
    for (const s of stocks ?? []) {
      parEmpl[s.emplacement_id] = (parEmpl[s.emplacement_id] ?? 0) + Number(s.quantite ?? 0);
    }
    const init: Record<string, string> = {};
    for (const [id, qte] of Object.entries(parEmpl)) {
      if (qte > 0) init[id] = String(qte);
    }
    setStockInitial(init);
    setBaselineStock(parEmpl);
  }

  async function rechercherArticlesSimilaires(valeur: string) {
    const recherche = valeur.trim();
    if (isEdition || recherche.length < 2) {
      setSuggestionsArticle([]);
      setRechercheArticleEnCours(false);
      return;
    }

    setRechercheArticleEnCours(true);
    const mots = recherche
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/\s+/)
      .filter((m) => m.length >= 2);
    const motCle = mots.sort((a, b) => b.length - a.length)[0] ?? recherche;

    const { data } = await supabase
      .from("articles")
      .select("id, designation, marque")
      .ilike("designation", `%${motCle.slice(0, Math.max(3, Math.min(5, motCle.length)))}%`)
      .order("designation")
      .limit(80);

    const classes = classerCorrespondances(
      recherche,
      data ?? [],
      (a) => `${a.designation} ${a.marque ?? ""}`,
      0.35
    ).slice(0, 8);

    // Lorsque la désignation est déjà suffisamment complète, on ne montre
    // que les correspondances réellement fortes. Cela permet de saisir un
    // nouvel article sans laisser des suggestions faibles encombrer le
    // formulaire. Une correspondance forte (notamment exacte) reste proposée.
    const rechercheSuffisammentComplete = recherche.length >= 10;
    const correspondancesAffichees = rechercheSuffisammentComplete
      ? classes.filter((article) => article.scoreCorrespondance >= 0.75)
      : classes;

    setSuggestionsArticle(correspondancesAffichees);
    setRechercheArticleEnCours(false);
  }

  function handleDesignationChange(valeur: string) {
    setForm((precedent) => ({ ...precedent, designation: valeur, id: isEdition ? precedent.id : undefined }));
    setArticleExistantDetecte(false);
    if (rechercheArticleTimer.current) clearTimeout(rechercheArticleTimer.current);
    if (isEdition) return;
    rechercheArticleTimer.current = setTimeout(() => {
      void rechercherArticlesSimilaires(valeur);
    }, 220);
  }

  useEffect(() => {
    return () => {
      if (rechercheArticleTimer.current) clearTimeout(rechercheArticleTimer.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.designation.trim()) {
      setError("La désignation est obligatoire.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      designation: form.designation.trim(),
      categorie_id: form.categorie_id || null,
      sous_categorie_id: form.sous_categorie_id || null,
      marque: form.marque.trim() || null,
      fournisseur_id: form.fournisseur_id || null,
      stock_minimum: Number(form.stock_minimum) || 0,
      prix_vente_conseille: Number(form.prix_vente_conseille) || 0,
      numero_lot: form.numero_lot.trim() || null,
      date_expiration: expirationApplicable ? form.date_expiration || null : null,
      statut: form.statut,
      observations: form.observations.trim() || null,
    };

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (isEdition && form.id) {
      const { error } = await supabase
        .from("articles")
        .update(payload)
        .eq("id", form.id);
      if (error) {
        setError(
          logSupabaseError(
            { table: "articles", operation: "update" },
            error,
            "Impossible d'enregistrer les modifications. Vérifiez les informations saisies ou réessayez."
          )
        );
        setSaving(false);
        return;
      }

      // Corrige le stock par emplacement : une baisse consomme en FIFO
      // (les commandes les plus anciennes en premier), une hausse
      // s'ajoute au stock non rattaché à une commande précise —
      // exactement la même logique que "Corriger le stock" depuis la
      // liste, désormais réunie ici, au même endroit que le reste.
      const tousEmplacements = new Set([
        ...Object.keys(baselineStock),
        ...Object.keys(stockInitial),
      ]);
      for (const emplacementId of Array.from(tousEmplacements)) {
        const avant = baselineStock[emplacementId] ?? 0;
        const apres = Number(stockInitial[emplacementId] || 0);
        const delta = apres - avant;
        if (delta === 0) continue;

        if (delta < 0) {
          const { data: repartition, error: fifoError } = await supabase.rpc(
            "consommer_stock_fifo",
            {
              p_article_id: form.id,
              p_emplacement_id: emplacementId,
              p_quantite: -delta,
              p_conteneur_id: null,
            }
          );
          if (fifoError) {
            setError(
              logSupabaseError(
                { table: "stocks", operation: "rpc consommer_stock_fifo" },
                fifoError,
                "Article enregistré, mais une correction de stock a échoué (quantité insuffisante ?)."
              )
            );
            setSaving(false);
            return;
          }
          for (const part of repartition ?? []) {
            await supabase.from("mouvements_stock").insert({
              article_id: form.id,
              emplacement_id: emplacementId,
              type: "autre_sortie",
              quantite: -part.quantite,
              document_type: "ajustement_manuel",
              observation: "Correction depuis la fiche article",
              created_by: user?.id ?? null,
            });
          }
        } else {
          const stockInitialId = await getStockInitialId(supabase);
          if (stockInitialId) {
            const { error: ajoutError } = await supabase.rpc(
              "ajouter_quantite_stock",
              {
                p_article_id: form.id,
                p_emplacement_id: emplacementId,
                p_conteneur_id: stockInitialId,
                p_quantite: delta,
              }
            );
            if (ajoutError) {
              setError(
                logSupabaseError(
                  { table: "stocks", operation: "rpc ajouter_quantite_stock" },
                  ajoutError,
                  "Article enregistré, mais une correction de stock a échoué."
                )
              );
              setSaving(false);
              return;
            }
            await supabase.from("mouvements_stock").insert({
              article_id: form.id,
              emplacement_id: emplacementId,
              type: "autre_entree",
              quantite: delta,
              document_type: "ajustement_manuel",
              observation: "Correction depuis la fiche article",
              created_by: user?.id ?? null,
            });
          }
        }
      }
    } else {
      const { data: created, error } = await supabase
        .from("articles")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select("id")
        .single();

      if (error || !created) {
        setError(
          logSupabaseError(
            { table: "articles", operation: "insert" },
            error,
            "Impossible d'enregistrer l'article. Vérifiez les informations saisies ou réessayez."
          )
        );
        setSaving(false);
        return;
      }

      // Stock initial par emplacement (traçable via un mouvement de stock)
      const entrees = Object.entries(stockInitial).filter(
        ([, val]) => Number(val) > 0
      );

      if (entrees.length > 0) {
        const stockInitialId = await getStockInitialId(supabase);

        for (const [emplacementId, valeur] of entrees) {
          const quantite = Number(valeur);

          const { error: stockError } = await supabase.rpc(
            "ajouter_quantite_stock",
            {
              p_article_id: created.id,
              p_emplacement_id: emplacementId,
              p_conteneur_id: stockInitialId,
              p_quantite: quantite,
            }
          );

          if (stockError) {
            logSupabaseError(
              { table: "stocks", operation: "rpc ajouter_quantite_stock (stock initial)" },
              stockError,
              ""
            );
          }

          const { error: mouvementError } = await supabase
            .from("mouvements_stock")
            .insert({
              article_id: created.id,
              emplacement_id: emplacementId,
              type: "autre_entree",
              quantite,
              document_type: "creation_article",
              observation: "Stock initial à la création de l'article",
              created_by: user?.id ?? null,
            });

          if (mouvementError) {
            logSupabaseError(
              { table: "mouvements_stock", operation: "insert (stock initial)" },
              mouvementError,
              ""
            );
          }
        }
      }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <Modal
      title={isEdition ? "Fiche article — Modification" : "Nouvel article"}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="flex max-h-[78vh] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {error && <div className="mb-4"><InlineBanner message={error} /></div>}

          {isEdition ? (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-accent-200 bg-accent-50/60 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-accent-700 shadow-sm">
                <Pencil size={17} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">Article sélectionné</p>
                <h3 className="mt-0.5 truncate text-base font-semibold text-onyx-900">{form.designation}</h3>
                <p className="mt-1 text-xs text-onyx-500">Les informations enregistrées ont été reprises. Modifiez uniquement ce que vous souhaitez changer.</p>
              </div>
            </div>
          ) : (
            <div className="mb-5 rounded-xl border border-onyx-100 bg-onyx-50/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-onyx-800"><Search size={16} /> Rechercher un article existant</div>
              <p className="mt-1 text-xs text-onyx-500">Commencez à saisir une désignation. Les correspondances sont souples ; choisissez l&apos;article avant de modifier ses informations.</p>
            </div>
          )}

          <section className="rounded-xl border border-onyx-100 bg-white">
            <div className="border-b border-onyx-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-onyx-800">Identification</h3>
              <p className="mt-0.5 text-xs text-onyx-400">Nom, marque et classification de l&apos;article.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
              <div className="relative lg:col-span-2">
                <FormField
                  id="designation"
                  label="Désignation"
                  required
                  value={form.designation}
                  onChange={(e) => handleDesignationChange(e.target.value)}
                  placeholder="Ex : Tensiomètre électronique X200"
                  autoComplete="off"
                />
                {(rechercheArticleEnCours || suggestionsArticle.length > 0) && !isEdition && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-onyx-200 bg-white shadow-xl">
                    {rechercheArticleEnCours ? (
                      <p className="px-3 py-2.5 text-sm text-onyx-400">Recherche de correspondances...</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto py-1">
                        <p className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-onyx-400">Correspondances — choisissez l&apos;article</p>
                        {suggestionsArticle.map((article) => (
                          <button
                            key={article.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void chargerArticleExistant(article.id)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-onyx-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-onyx-800">{article.designation}</span>
                              {article.marque && <span className="block truncate text-xs text-onyx-400">{article.marque}</span>}
                            </span>
                            <span className="shrink-0 rounded-full bg-onyx-50 px-2 py-0.5 text-[11px] font-medium text-onyx-500">{Math.round(article.scoreCorrespondance * 100)} %</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {articleExistantDetecte && (
                <div className="lg:col-span-2">
                  <InlineBanner type="success" message="Article chargé : vous êtes maintenant en mode modification. Les données existantes ont été reprises." />
                </div>
              )}

              <FormField id="marque" label="Marque" value={form.marque} onChange={(e) => setForm({ ...form, marque: e.target.value })} placeholder="Optionnel" />
              <SelectField id="categorie" label="Catégorie" value={form.categorie_id} onChange={(e) => setForm({ ...form, categorie_id: e.target.value, sous_categorie_id: "" })}>
                <option value="">— Aucune —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </SelectField>
              <SelectField id="sous-categorie" label="Sous-catégorie" value={form.sous_categorie_id} onChange={(e) => setForm({ ...form, sous_categorie_id: e.target.value })} disabled={!form.categorie_id}>
                <option value="">— Aucune —</option>
                {sousCategoriesFiltrees.map((sc) => <option key={sc.id} value={sc.id}>{sc.nom}</option>)}
              </SelectField>
              <SelectField id="fournisseur" label="Fournisseur" value={form.fournisseur_id} onChange={(e) => setForm({ ...form, fournisseur_id: e.target.value })}>
                <option value="">— Aucun —</option>
                {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </SelectField>
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-onyx-100 bg-white">
            <div className="border-b border-onyx-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-onyx-800">Commercial & suivi</h3>
              <p className="mt-0.5 text-xs text-onyx-400">Prix, seuil d&apos;alerte, statut et informations de lot.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
              <SelectField id="statut" label="Statut" value={form.statut} onChange={(e) => setForm({ ...form, statut: e.target.value })}>
                {statutsArticle.filter((s) => s.actif).map((s) => <option key={s.valeur} value={s.valeur}>{s.valeur}</option>)}
              </SelectField>
              <FormField id="prix-vente" label="Prix de vente référence" type="number" min="0" step="1" value={form.prix_vente_conseille} onChange={(e) => setForm({ ...form, prix_vente_conseille: e.target.value })} placeholder="0" />
              <FormField id="stock-minimum" label="Stock minimum (seuil d'alerte)" type="number" min="0" step="1" value={form.stock_minimum} onChange={(e) => setForm({ ...form, stock_minimum: e.target.value })} placeholder="0" />
              <FormField id="numero-lot" label="Numéro de lot" value={form.numero_lot} onChange={(e) => setForm({ ...form, numero_lot: e.target.value })} placeholder="Optionnel — si applicable" />
              <div className="lg:col-span-2 rounded-lg bg-onyx-50/70 p-3 text-xs text-onyx-500">
                <div className="flex gap-2"><Info size={14} className="mt-0.5 shrink-0" /><span>Le statut indique si l&apos;article reste proposé dans les ventes et achats. Il ne décrit pas son état physique.</span></div>
              </div>
              <div className="lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-onyx-700">Date d&apos;expiration</label>
                  <label className="flex items-center gap-1.5 text-xs text-onyx-500">
                    <input type="checkbox" checked={!expirationApplicable} onChange={(e) => { setExpirationApplicable(!e.target.checked); if (e.target.checked) setForm({ ...form, date_expiration: "" }); }} className="h-4 w-4 rounded border-onyx-300 text-onyx-900 focus:ring-accent-400" />
                    Non applicable
                  </label>
                </div>
                <input type="date" disabled={!expirationApplicable} value={form.date_expiration} onChange={(e) => setForm({ ...form, date_expiration: e.target.value })} className="mt-1.5 w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:bg-onyx-50 disabled:text-onyx-300" />
              </div>
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-onyx-100 bg-white">
            <div className="border-b border-onyx-100 px-4 py-3">
              <div className="flex items-center gap-2"><Package size={16} className="text-onyx-500" /><h3 className="text-sm font-semibold text-onyx-800">{isEdition ? "Stock par emplacement" : "Stock initial"}</h3></div>
              <p className="mt-0.5 text-xs text-onyx-400">{isEdition ? "Corrigez ici les quantités existantes par emplacement." : "Renseignez les quantités déjà disponibles au démarrage."}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {emplacementsActifs.map((empl: RefEmplacement) => (
                <div key={empl.id} className="rounded-lg border border-onyx-100 bg-onyx-50/40 p-3">
                  <label className="mb-1 block text-xs font-medium text-onyx-600">{empl.nom}</label>
                  <input type="number" min="0" step="1" value={stockInitial[empl.id] || ""} onChange={(e) => setStockInitial({ ...stockInitial, [empl.id]: e.target.value })} placeholder="0" className="w-full rounded-lg border border-onyx-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100" />
                  {isEdition && <p className="mt-1 text-[11px] text-onyx-400">Actuel : {baselineStock[empl.id] ?? 0}</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-onyx-100 bg-white">
            <div className="border-b border-onyx-100 px-4 py-3"><h3 className="text-sm font-semibold text-onyx-800">Observations</h3></div>
            <div className="p-4"><TextareaField id="observations" label="Notes internes" value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} placeholder="Notes internes (optionnel)" /></div>
          </section>
        </div>

        <div className="mt-4 flex gap-3 border-t border-onyx-100 bg-white pt-4">
          <SecondaryButton type="button" onClick={onClose} className="flex-1">Annuler</SecondaryButton>
          <PrimaryButton type="submit" loading={saving || loadingRef} className="flex-1">{isEdition ? "Enregistrer les modifications" : "Créer l'article"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
