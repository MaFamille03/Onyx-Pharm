"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

type OptionRow = {
  id: string;
  groupe: string;
  valeur: string;
  ordre: number;
  actif: boolean;
};

const GROUPES = [
  {
    groupe: "statut_article",
    label: "Statuts d'article",
    description: "Statuts disponibles pour les fiches articles.",
  },
  {
    groupe: "mode_paiement",
    label: "Modes de paiement",
    description: "Utilisés pour les paiements, encaissements et décaissements.",
  },
  {
    groupe: "statut_operation",
    label: "Statuts d'opération",
    description: "Utilisés pour les ventes, conteneurs, transferts, inventaires...",
  },
  {
    groupe: "categorie_caisse",
    label: "Catégories de caisse",
    description: "Pour classer les encaissements et décaissements.",
  },
];

export function OptionsSection() {
  const supabase = createClient();
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nouvellesValeurs, setNouvellesValeurs] = useState<
    Record<string, string>
  >({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("parametres_options")
      .select("*")
      .order("groupe")
      .order("ordre");
    if (!error && data) setOptions(data as OptionRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(groupe: string) {
    const valeur = (nouvellesValeurs[groupe] || "").trim();
    if (!valeur) return;
    setSaving(groupe);
    setError(null);

    const maxOrdre = options
      .filter((o) => o.groupe === groupe)
      .reduce((max, o) => Math.max(max, o.ordre), 0);

    const { error } = await supabase
      .from("parametres_options")
      .insert({ groupe, valeur, ordre: maxOrdre + 1 });

    setSaving(null);
    if (error) {
      setError(
        error.code === "23505"
          ? "Cette valeur existe déjà dans cette liste."
          : logSupabaseError(
              { table: "parametres_options", operation: "insert" },
              error,
              "Impossible d'ajouter cette valeur. Réessayez."
            )
      );
      return;
    }
    setNouvellesValeurs({ ...nouvellesValeurs, [groupe]: "" });
    load();
  }

  async function toggleActif(item: OptionRow) {
    setError(null);
    const { error } = await supabase
      .from("parametres_options")
      .update({ actif: !item.actif })
      .eq("id", item.id);
    if (error) {
      setError(
        logSupabaseError(
          { table: "parametres_options", operation: "update" },
          error,
          "Impossible de modifier cette valeur. Réessayez."
        )
      );
      return;
    }
    load();
  }

  if (loading) {
    return (
      <p className="py-6 text-center text-sm text-onyx-400">Chargement...</p>
    );
  }

  return (
    <div className="space-y-6">
      {error && <InlineBanner message={error} />}

      {GROUPES.map((groupeDef) => {
        const values = options.filter((o) => o.groupe === groupeDef.groupe);
        return (
          <div
            key={groupeDef.groupe}
            className="rounded-xl border border-onyx-100 bg-white p-4"
          >
            <h3 className="text-sm font-semibold text-onyx-800">
              {groupeDef.label}
            </h3>
            <p className="mt-0.5 text-xs text-onyx-400">
              {groupeDef.description}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {values.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => toggleActif(opt)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    opt.actif
                      ? "border-onyx-200 bg-onyx-50 text-onyx-700 hover:bg-onyx-100"
                      : "border-onyx-100 bg-white text-onyx-300 line-through"
                  }`}
                >
                  {opt.valeur}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={nouvellesValeurs[groupeDef.groupe] || ""}
                onChange={(e) =>
                  setNouvellesValeurs({
                    ...nouvellesValeurs,
                    [groupeDef.groupe]: e.target.value,
                  })
                }
                placeholder="Nouvelle valeur"
                className="flex-1 rounded-lg border border-onyx-200 px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
              <SecondaryButton
                onClick={() => handleAdd(groupeDef.groupe)}
                disabled={saving === groupeDef.groupe}
                className="min-h-0 px-3 py-2 text-xs"
              >
                <Plus size={14} />
                Ajouter
              </SecondaryButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}
