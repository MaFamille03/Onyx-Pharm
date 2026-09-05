"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { getStockInitialId } from "@/lib/conteneurs";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/auth/FormField";
import { TextareaField, SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
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
  onClose,
  onSaved,
}: {
  initialValues: ArticleFormValues;
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
  const [stockInitial, setStockInitial] = useState<Record<string, string>>(
    {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdition = Boolean(initialValues.id);
  const [expirationApplicable, setExpirationApplicable] = useState(
    Boolean(initialValues.date_expiration)
  );

  const sousCategoriesFiltrees = useMemo(
    () =>
      sousCategories.filter((sc) => sc.categorie_id === form.categorie_id),
    [sousCategories, form.categorie_id]
  );

  const emplacementsActifs = emplacements.filter((e) => e.actif);

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

    if (isEdition && initialValues.id) {
      const { error } = await supabase
        .from("articles")
        .update(payload)
        .eq("id", initialValues.id);
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

          const { error: stockError } = await supabase.from("stocks").upsert(
            {
              article_id: created.id,
              emplacement_id: emplacementId,
              conteneur_id: stockInitialId,
              quantite,
            },
            { onConflict: "article_id,emplacement_id,conteneur_id" }
          );

          if (stockError) {
            logSupabaseError(
              { table: "stocks", operation: "upsert (stock initial)" },
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
      title={isEdition ? "Modifier l'article" : "Nouvel article"}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <InlineBanner message={error} />}

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
          <FormField
            id="designation"
            label="Désignation"
            required
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
            placeholder="Ex : Tensiomètre électronique X200"
          />

          <FormField
            id="marque"
            label="Marque"
            value={form.marque}
            onChange={(e) => setForm({ ...form, marque: e.target.value })}
            placeholder="Optionnel"
          />

          <SelectField
            id="categorie"
            label="Catégorie"
            value={form.categorie_id}
            onChange={(e) =>
              setForm({
                ...form,
                categorie_id: e.target.value,
                sous_categorie_id: "",
              })
            }
          >
            <option value="">— Aucune —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="sous-categorie"
            label="Sous-catégorie"
            value={form.sous_categorie_id}
            onChange={(e) =>
              setForm({ ...form, sous_categorie_id: e.target.value })
            }
            disabled={!form.categorie_id}
          >
            <option value="">— Aucune —</option>
            {sousCategoriesFiltrees.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.nom}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="fournisseur"
            label="Fournisseur"
            value={form.fournisseur_id}
            onChange={(e) =>
              setForm({ ...form, fournisseur_id: e.target.value })
            }
          >
            <option value="">— Aucun —</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="statut"
            label="Statut"
            value={form.statut}
            onChange={(e) => setForm({ ...form, statut: e.target.value })}
          >
            {statutsArticle
              .filter((s) => s.actif)
              .map((s) => (
                <option key={s.valeur} value={s.valeur}>
                  {s.valeur}
                </option>
              ))}
          </SelectField>

          <FormField
            id="prix-vente"
            label="Prix de vente référence"
            type="number"
            min="0"
            step="1"
            value={form.prix_vente_conseille}
            onChange={(e) =>
              setForm({ ...form, prix_vente_conseille: e.target.value })
            }
            placeholder="0"
          />

          <FormField
            id="stock-minimum"
            label="Stock minimum"
            type="number"
            min="0"
            step="1"
            value={form.stock_minimum}
            onChange={(e) =>
              setForm({ ...form, stock_minimum: e.target.value })
            }
            placeholder="0"
          />
          <FormField
            id="numero-lot"
            label="Numéro de lot"
            value={form.numero_lot}
            onChange={(e) =>
              setForm({ ...form, numero_lot: e.target.value })
            }
            placeholder="Optionnel — si applicable"
          />

          <div className="lg:col-span-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-onyx-700">
                Date d&apos;expiration
              </label>
              <label className="flex items-center gap-1.5 text-xs text-onyx-500">
                <input
                  type="checkbox"
                  checked={!expirationApplicable}
                  onChange={(e) => {
                    setExpirationApplicable(!e.target.checked);
                    if (e.target.checked) {
                      setForm({ ...form, date_expiration: "" });
                    }
                  }}
                  className="h-4 w-4 rounded border-onyx-300 text-onyx-900 focus:ring-accent-400"
                />
                Non applicable (ex : mobilier, équipement durable)
              </label>
            </div>
            <input
              type="date"
              disabled={!expirationApplicable}
              value={form.date_expiration}
              onChange={(e) =>
                setForm({ ...form, date_expiration: e.target.value })
              }
              className="mt-1.5 w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:bg-onyx-50 disabled:text-onyx-300"
            />
          </div>
        </div>

        <TextareaField
          id="observations"
          label="Observations"
          value={form.observations}
          onChange={(e) =>
            setForm({ ...form, observations: e.target.value })
          }
          placeholder="Notes internes (optionnel)"
        />

        {!isEdition && (
          <div className="rounded-lg border border-onyx-100 bg-onyx-50/50 p-4">
            <p className="text-sm font-medium text-onyx-700">
              Stock initial (optionnel)
            </p>
            <p className="mt-0.5 text-xs text-onyx-400">
              Renseignez la quantité de départ par emplacement, si vous en
              avez déjà en stock.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {emplacementsActifs.map((empl: RefEmplacement) => (
                <div key={empl.id}>
                  <label className="mb-1 block text-xs font-medium text-onyx-500">
                    {empl.nom}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={stockInitial[empl.id] || ""}
                    onChange={(e) =>
                      setStockInitial({
                        ...stockInitial,
                        [empl.id]: e.target.value,
                      })
                    }
                    placeholder="0"
                    className="w-full rounded-lg border border-onyx-200 px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <SecondaryButton type="button" onClick={onClose} className="flex-1">
            Annuler
          </SecondaryButton>
          <PrimaryButton
            type="submit"
            loading={saving || loadingRef}
            className="flex-1"
          >
            Enregistrer
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
