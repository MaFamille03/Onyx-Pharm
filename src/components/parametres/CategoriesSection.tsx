"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, ChevronDown, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

type Categorie = { id: string; nom: string; actif: boolean };
type SousCategorie = {
  id: string;
  categorie_id: string;
  nom: string;
  actif: boolean;
};

export function CategoriesSection() {
  const supabase = createClient();
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [sousCategories, setSousCategories] = useState<SousCategorie[]>([]);
  const [loading, setLoading] = useState(true);
  const [nouvelleCategorie, setNouvelleCategorie] = useState("");
  const [savingCategorie, setSavingCategorie] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [nouvelleSousCategorie, setNouvelleSousCategorie] = useState("");
  const [savingSousCategorie, setSavingSousCategorie] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [catRes, sousCatRes] = await Promise.all([
      supabase.from("categories").select("*").order("nom"),
      supabase.from("sous_categories").select("*").order("nom"),
    ]);
    if (catRes.data) setCategories(catRes.data as Categorie[]);
    if (sousCatRes.data) setSousCategories(sousCatRes.data as SousCategorie[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddCategorie(e: React.FormEvent) {
    e.preventDefault();
    if (!nouvelleCategorie.trim()) return;
    setSavingCategorie(true);
    setError(null);
    const { error } = await supabase
      .from("categories")
      .insert({ nom: nouvelleCategorie.trim() });
    setSavingCategorie(false);
    if (error) {
      setError(
        error.code === "23505"
          ? "Cette catégorie existe déjà."
          : logSupabaseError(
              { table: "categories", operation: "insert" },
              error,
              "Impossible d'ajouter cette catégorie. Réessayez."
            )
      );
      return;
    }
    setNouvelleCategorie("");
    load();
  }

  async function handleAddSousCategorie(categorieId: string) {
    if (!nouvelleSousCategorie.trim()) return;
    setSavingSousCategorie(true);
    setError(null);
    const { error } = await supabase.from("sous_categories").insert({
      categorie_id: categorieId,
      nom: nouvelleSousCategorie.trim(),
    });
    setSavingSousCategorie(false);
    if (error) {
      setError(
        error.code === "23505"
          ? "Cette sous-catégorie existe déjà dans cette catégorie."
          : logSupabaseError(
              { table: "sous_categories", operation: "insert" },
              error,
              "Impossible d'ajouter cette sous-catégorie. Réessayez."
            )
      );
      return;
    }
    setNouvelleSousCategorie("");
    load();
  }

  async function toggleCategorieActif(item: Categorie) {
    setError(null);
    const { error } = await supabase
      .from("categories")
      .update({ actif: !item.actif })
      .eq("id", item.id);
    if (error) {
      setError(
        logSupabaseError(
          { table: "categories", operation: "update" },
          error,
          "Impossible de modifier cette catégorie. Réessayez."
        )
      );
      return;
    }
    load();
  }

  async function toggleSousCategorieActif(item: SousCategorie) {
    setError(null);
    const { error } = await supabase
      .from("sous_categories")
      .update({ actif: !item.actif })
      .eq("id", item.id);
    if (error) {
      setError(
        logSupabaseError(
          { table: "sous_categories", operation: "update" },
          error,
          "Impossible de modifier cette sous-catégorie. Réessayez."
        )
      );
      return;
    }
    load();
  }

  return (
    <div>
      <p className="text-sm text-onyx-500">
        Organisez vos articles en catégories, puis sous-catégories.
        Cliquez sur une catégorie pour gérer ses sous-catégories.
      </p>

      <form
        onSubmit={handleAddCategorie}
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <FormField
            id="nouvelle-categorie"
            label="Nouvelle catégorie"
            value={nouvelleCategorie}
            onChange={(e) => setNouvelleCategorie(e.target.value)}
            placeholder="Ex : Diagnostic"
          />
        </div>
        <PrimaryButton type="submit" loading={savingCategorie}>
          <Plus size={17} />
          Ajouter
        </PrimaryButton>
      </form>

      {error && <div className="mt-3"><InlineBanner message={error} /></div>}

      <div className="mt-5 space-y-2">
        {loading ? (
          <p className="py-6 text-center text-sm text-onyx-400">
            Chargement...
          </p>
        ) : categories.length === 0 ? (
          <p className="py-6 text-center text-sm text-onyx-400">
            Aucune catégorie pour le moment.
          </p>
        ) : (
          categories.map((cat) => {
            const isOpen = expanded === cat.id;
            const sousCats = sousCategories.filter(
              (sc) => sc.categorie_id === cat.id
            );
            return (
              <div
                key={cat.id}
                className="overflow-hidden rounded-lg border border-onyx-100 bg-white"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : cat.id)}
                  className="flex w-full items-center justify-between px-4 py-3"
                >
                  <span className="flex items-center gap-2.5">
                    <Tag size={16} className="text-onyx-400" />
                    <span
                      className={`text-sm font-medium ${
                        cat.actif
                          ? "text-onyx-800"
                          : "text-onyx-400 line-through"
                      }`}
                    >
                      {cat.nom}
                    </span>
                    <span className="text-xs text-onyx-300">
                      ({sousCats.length})
                    </span>
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-onyx-400 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-onyx-100 bg-onyx-50/40 px-4 py-3">
                    <div className="mb-2 flex justify-end">
                      <SecondaryButton
                        onClick={() => toggleCategorieActif(cat)}
                        className="min-h-0 px-3 py-1.5 text-xs"
                      >
                        {cat.actif
                          ? "Désactiver la catégorie"
                          : "Réactiver la catégorie"}
                      </SecondaryButton>
                    </div>

                    <div className="space-y-1.5">
                      {sousCats.length === 0 && (
                        <p className="text-sm text-onyx-400">
                          Aucune sous-catégorie.
                        </p>
                      )}
                      {sousCats.map((sc) => (
                        <div
                          key={sc.id}
                          className="flex items-center justify-between rounded-md bg-white px-3 py-2"
                        >
                          <span
                            className={`text-sm ${
                              sc.actif
                                ? "text-onyx-700"
                                : "text-onyx-300 line-through"
                            }`}
                          >
                            {sc.nom}
                          </span>
                          <button
                            onClick={() => toggleSousCategorieActif(sc)}
                            className="text-xs font-medium text-accent-600 hover:text-accent-700"
                          >
                            {sc.actif ? "Désactiver" : "Réactiver"}
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <input
                        value={nouvelleSousCategorie}
                        onChange={(e) =>
                          setNouvelleSousCategorie(e.target.value)
                        }
                        placeholder="Nouvelle sous-catégorie"
                        className="flex-1 rounded-lg border border-onyx-200 px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                      />
                      <SecondaryButton
                        onClick={() => handleAddSousCategorie(cat.id)}
                        disabled={savingSousCategorie}
                        className="min-h-0 px-3 py-2 text-xs"
                      >
                        Ajouter
                      </SecondaryButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
