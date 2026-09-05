"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

type Emplacement = {
  id: string;
  nom: string;
  actif: boolean;
};

export function EmplacementsSection() {
  const supabase = createClient();
  const [items, setItems] = useState<Emplacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [nouveauNom, setNouveauNom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("emplacements")
      .select("*")
      .order("nom");
    if (!error && data) setItems(data as Emplacement[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!nouveauNom.trim()) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("emplacements")
      .insert({ nom: nouveauNom.trim() });
    setSaving(false);
    if (error) {
      setError(
        error.code === "23505"
          ? "Cet emplacement existe déjà."
          : logSupabaseError(
              { table: "emplacements", operation: "insert" },
              error,
              "Impossible d'ajouter cet emplacement. Réessayez."
            )
      );
      return;
    }
    setNouveauNom("");
    load();
  }

  async function toggleActif(item: Emplacement) {
    setError(null);
    const { error } = await supabase
      .from("emplacements")
      .update({ actif: !item.actif })
      .eq("id", item.id);
    if (error) {
      setError(
        logSupabaseError(
          { table: "emplacements", operation: "update" },
          error,
          "Impossible de modifier cet emplacement. Réessayez."
        )
      );
      return;
    }
    load();
  }

  return (
    <div>
      <p className="text-sm text-onyx-500">
        Les lieux de stockage utilisés dans l&apos;application. Vous pouvez en
        ajouter de nouveaux ou désactiver ceux qui ne sont plus utilisés
        (sans jamais les supprimer, pour conserver l&apos;historique).
      </p>

      <form
        onSubmit={handleAdd}
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <FormField
            id="nouvel-emplacement"
            label="Nouvel emplacement"
            value={nouveauNom}
            onChange={(e) => setNouveauNom(e.target.value)}
            placeholder="Ex : Boutique Cocody"
          />
        </div>
        <PrimaryButton type="submit" loading={saving}>
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
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-onyx-100 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-2.5">
                <MapPin size={16} className="text-onyx-400" />
                <span
                  className={`text-sm font-medium ${
                    item.actif ? "text-onyx-800" : "text-onyx-400 line-through"
                  }`}
                >
                  {item.nom}
                </span>
              </div>
              <SecondaryButton
                onClick={() => toggleActif(item)}
                className="min-h-0 px-3 py-1.5 text-xs"
              >
                {item.actif ? "Désactiver" : "Réactiver"}
              </SecondaryButton>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
