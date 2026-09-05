"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useReferenceData } from "@/lib/hooks/useReferenceData";

type MouvementRow = {
  id: string;
  type: string;
  quantite: number;
  reference_document: string | null;
  observation: string | null;
  created_at: string;
  articles: { designation: string } | null;
  emplacements: { nom: string } | null;
};

const LABELS_TYPE: Record<string, string> = {
  achat: "Achat",
  vente: "Vente",
  transfert_entrant: "Transfert (entrée)",
  transfert_sortant: "Transfert (sortie)",
  retour_client: "Retour client",
  retour_fournisseur: "Retour fournisseur",
  ajustement_inventaire: "Ajustement inventaire",
  perte: "Perte",
  dommage: "Dommage",
  autre_entree: "Autre entrée",
  autre_sortie: "Autre sortie",
};

export function MouvementsManager() {
  const supabase = createClient();
  const { emplacements } = useReferenceData();

  const [mouvements, setMouvements] = useState<MouvementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtreType, setFiltreType] = useState("");
  const [filtreEmplacement, setFiltreEmplacement] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("mouvements_stock")
      .select(
        "id, type, quantite, reference_document, observation, created_at, articles(designation), emplacements(nom)"
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data) setMouvements(data as unknown as MouvementRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtres = mouvements.filter((m) => {
    if (
      search &&
      !`${m.articles?.designation ?? ""} ${m.reference_document ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    if (filtreType && m.type !== filtreType) return false;
    if (filtreEmplacement && m.emplacements?.nom !== filtreEmplacement)
      return false;
    return true;
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        Mouvements
      </h1>
      <p className="mt-1 text-sm text-onyx-500">
        Journal complet de toutes les variations de stock (200 dernières
        opérations).
      </p>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-onyx-300"
          />
          <input
            type="search"
            placeholder="Rechercher un article, une référence..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-onyx-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          />
        </div>

        <select
          value={filtreType}
          onChange={(e) => setFiltreType(e.target.value)}
          className="rounded-lg border border-onyx-200 px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        >
          <option value="">Tous les types</option>
          {Object.entries(LABELS_TYPE).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={filtreEmplacement}
          onChange={(e) => setFiltreEmplacement(e.target.value)}
          className="rounded-lg border border-onyx-200 px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        >
          <option value="">Tous les emplacements</option>
          {emplacements.map((e) => (
            <option key={e.id} value={e.nom}>
              {e.nom}
            </option>
          ))}
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
              Aucun mouvement trouvé
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-onyx-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Article</th>
                  <th className="px-4 py-3">Emplacement</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Quantité</th>
                  <th className="px-4 py-3">Référence</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-onyx-50 last:border-0 hover:bg-onyx-50/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-onyx-500">
                      {new Date(m.created_at).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium text-onyx-800">
                      {m.articles?.designation ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-onyx-500">
                      {m.emplacements?.nom ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-onyx-500">
                      {LABELS_TYPE[m.type] ?? m.type}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          m.quantite >= 0 ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {m.quantite >= 0 ? (
                          <ArrowUpCircle size={13} />
                        ) : (
                          <ArrowDownCircle size={13} />
                        )}
                        {m.quantite > 0 ? "+" : ""}
                        {m.quantite}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-onyx-400">
                      {m.reference_document ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
