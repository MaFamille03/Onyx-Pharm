"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, History as HistoryIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

type HistoriqueRow = {
  id: string;
  action: string;
  table_cible: string;
  ancienne_valeur: unknown;
  nouvelle_valeur: unknown;
  description: string | null;
  created_at: string;
  profiles: { email: string | null; nom_complet: string | null } | null;
};

const LABELS_ACTION: Record<string, string> = {
  creation: "Création",
  modification: "Modification",
  validation: "Validation",
  annulation: "Annulation",
};

const COULEURS_ACTION: Record<string, string> = {
  creation: "bg-emerald-50 text-emerald-700",
  modification: "bg-accent-50 text-accent-700",
  validation: "bg-blue-50 text-blue-700",
  annulation: "bg-red-50 text-red-700",
};

function formatValeur(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("fr-FR");
  return String(v);
}

export function HistoriqueManager() {
  const supabase = createClient();
  const [entries, setEntries] = useState<HistoriqueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtreAction, setFiltreAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("historique")
      .select(
        "id, action, table_cible, ancienne_valeur, nouvelle_valeur, description, created_at, profiles(email, nom_complet)"
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setEntries(data as unknown as HistoriqueRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(["historique"], load);

  const filtres = entries.filter((e) => {
    if (
      search &&
      !`${e.description ?? ""} ${e.table_cible}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    if (filtreAction && e.action !== filtreAction) return false;
    return true;
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        Historique
      </h1>
      <p className="mt-1 text-sm text-onyx-500">
        Journal des actions importantes réalisées dans l&apos;application
        (200 dernières entrées).
      </p>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-onyx-300"
          />
          <input
            type="search"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-onyx-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          />
        </div>
        <select
          value={filtreAction}
          onChange={(e) => setFiltreAction(e.target.value)}
          className="rounded-lg border border-onyx-200 px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        >
          <option value="">Toutes les actions</option>
          {Object.entries(LABELS_ACTION).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
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
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-onyx-50 text-onyx-300">
              <HistoryIcon size={18} />
            </div>
            <p className="mt-3 text-sm font-medium text-onyx-600">
              Aucun événement enregistré pour le moment
            </p>
            <p className="mt-1 text-sm text-onyx-400">
              L&apos;historique se remplit automatiquement lors des
              modifications de prix, annulations, etc.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtres.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-onyx-100 bg-white p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        COULEURS_ACTION[e.action] ?? "bg-onyx-100 text-onyx-600"
                      }`}
                    >
                      {LABELS_ACTION[e.action] ?? e.action}
                    </span>
                    <span className="text-xs text-onyx-400">
                      {e.table_cible}
                    </span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-onyx-400">
                    {new Date(e.created_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-onyx-700">
                  {e.profiles?.nom_complet || e.profiles?.email || "Système"}
                  {e.description ? ` — ${e.description}` : ""}
                </p>
                {(e.ancienne_valeur !== null || e.nouvelle_valeur !== null) && (
                  <p className="mt-1 text-xs text-onyx-400">
                    {formatValeur(e.ancienne_valeur)} →{" "}
                    <span className="font-medium text-onyx-600">
                      {formatValeur(e.nouvelle_valeur)}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
