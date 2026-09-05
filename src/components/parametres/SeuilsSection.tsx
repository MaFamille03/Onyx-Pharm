"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { PrimaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

export function SeuilsSection() {
  const supabase = createClient();
  const [delai, setDelai] = useState("30");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("parametres_generaux")
      .select("valeur")
      .eq("cle", "delai_alerte_expiration_jours")
      .maybeSingle();
    if (data?.valeur !== undefined) setDelai(String(data.valeur));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valeur = Number(delai);
    if (!valeur || valeur <= 0) {
      setError("Le délai doit être un nombre de jours supérieur à zéro.");
      return;
    }
    setSaving(true);
    setSuccess(false);
    setError(null);
    const { error } = await supabase
      .from("parametres_generaux")
      .update({ valeur })
      .eq("cle", "delai_alerte_expiration_jours");
    setSaving(false);
    if (error) {
      setError(
        logSupabaseError(
          { table: "parametres_generaux", operation: "update" },
          error,
          "Impossible d'enregistrer ce seuil. Réessayez."
        )
      );
      return;
    }
    setSuccess(true);
  }

  if (loading) {
    return <p className="py-6 text-center text-sm text-onyx-400">Chargement...</p>;
  }

  return (
    <div className="rounded-xl border border-onyx-100 bg-white p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
          <AlertTriangle size={16} />
        </div>
        <h3 className="text-sm font-semibold text-onyx-800">
          Délai d&apos;alerte avant expiration
        </h3>
      </div>
      <p className="mt-1.5 text-xs text-onyx-400">
        Un produit apparaît dans Stock &gt; Alertes dès qu&apos;il expire dans
        ce nombre de jours ou moins.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex max-w-xs items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-onyx-700">
            Nombre de jours
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={delai}
            onChange={(e) => setDelai(e.target.value)}
            className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          />
        </div>
        <PrimaryButton type="submit" loading={saving}>
          Enregistrer
        </PrimaryButton>
      </form>
      {error && (
        <div className="mt-3">
          <InlineBanner message={error} />
        </div>
      )}
      {success && (
        <div className="mt-3">
          <InlineBanner type="success" message="Seuil mis à jour." />
        </div>
      )}
    </div>
  );
}
