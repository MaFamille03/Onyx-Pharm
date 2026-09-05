"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

type ArticleAlerte = { id: string; designation: string; stock_minimum: number };

export function AlerteModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const [articles, setArticles] = useState<ArticleAlerte[]>([]);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("articles")
      .select("id, designation, stock_minimum")
      .eq("statut", "Actif")
      .order("designation");
    if (data) {
      setArticles(data);
      setValeurs(
        Object.fromEntries(data.map((a) => [a.id, String(a.stock_minimum)]))
      );
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtres = articles.filter((a) =>
    a.designation.toLowerCase().includes(search.toLowerCase())
  );

  async function handleEnregistrer() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const modifies = articles.filter(
      (a) => Number(valeurs[a.id]) !== a.stock_minimum
    );

    for (const a of modifies) {
      const { error } = await supabase
        .from("articles")
        .update({ stock_minimum: Number(valeurs[a.id]) || 0 })
        .eq("id", a.id);
      if (error) {
        setSaving(false);
        setError(
          logSupabaseError(
            { table: "articles", operation: "update (seuil alerte)" },
            error,
            `Impossible de mettre à jour "${a.designation}". Réessayez.`
          )
        );
        return;
      }
    }

    setSaving(false);
    setSuccess(
      modifies.length > 0
        ? `${modifies.length} seuil(s) mis à jour.`
        : "Aucun changement à enregistrer."
    );
    load();
  }

  return (
    <Modal title="Ajuster les niveaux d'alerte" onClose={onClose} wide>
      <p className="text-sm text-onyx-500">
        Le stock minimum déclenche l&apos;alerte de stock faible dans Stock &gt;
        Alertes et sur le tableau de bord.
      </p>

      {error && (
        <div className="mt-3">
          <InlineBanner message={error} />
        </div>
      )}
      {success && (
        <div className="mt-3">
          <InlineBanner type="success" message={success} />
        </div>
      )}

      <input
        type="search"
        placeholder="Rechercher un article..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-4 w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
      />

      {loading ? (
        <p className="py-8 text-center text-sm text-onyx-400">Chargement...</p>
      ) : (
        <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-onyx-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-onyx-50">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                <th className="px-3 py-2.5">Article</th>
                <th className="px-3 py-2.5 text-right">Stock minimum</th>
              </tr>
            </thead>
            <tbody>
              {filtres.map((a) => (
                <tr key={a.id} className="border-t border-onyx-50">
                  <td className="px-3 py-2 text-onyx-700">{a.designation}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={valeurs[a.id] ?? ""}
                      onChange={(e) =>
                        setValeurs({ ...valeurs, [a.id]: e.target.value })
                      }
                      className="w-24 rounded-md border border-onyx-200 px-2 py-1.5 text-right text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <PrimaryButton onClick={handleEnregistrer} loading={saving} className="w-full">
          Enregistrer les seuils modifiés
        </PrimaryButton>
      </div>
    </Modal>
  );
}
