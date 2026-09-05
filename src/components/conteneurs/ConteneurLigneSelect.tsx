"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ConteneurDisponible = { id: string; code: string; quantite: number };

export function ConteneurLigneSelect({
  articleId,
  emplacementId,
  value,
  onChange,
}: {
  articleId: string;
  emplacementId: string;
  value: string;
  onChange: (conteneurId: string) => void;
}) {
  const supabase = createClient();
  const [options, setOptions] = useState<ConteneurDisponible[]>([]);

  useEffect(() => {
    if (!articleId || !emplacementId) {
      setOptions([]);
      return;
    }
    supabase
      .from("stocks")
      .select("quantite, conteneurs(id, code)")
      .eq("article_id", articleId)
      .eq("emplacement_id", emplacementId)
      .gt("quantite", 0)
      .then(({ data }) => {
        if (!data) return;
        setOptions(
          (
            data as unknown as {
              quantite: number;
              conteneurs: { id: string; code: string } | null;
            }[]
          )
            .filter((d) => d.conteneurs)
            .map((d) => ({
              id: d.conteneurs!.id,
              code: d.conteneurs!.code,
              quantite: d.quantite,
            }))
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, emplacementId]);

  if (!articleId || !emplacementId || options.length === 0) return null;

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-onyx-500">
        Conteneur (optionnel)
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-onyx-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
      >
        <option value="">Automatique (le plus ancien)</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.code} — {o.quantite} dispo.
          </option>
        ))}
      </select>
    </div>
  );
}
