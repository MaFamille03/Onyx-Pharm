"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { getStockInitialId } from "@/lib/conteneurs";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { useReferenceData } from "@/lib/hooks/useReferenceData";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

type StockRow = {
  article_id: string;
  designation: string;
  parEmplacement: Record<string, number>;
  parConteneur: Record<string, number>;
  total: number;
};

export function StocksManager({ embarque }: { embarque?: boolean } = {}) {
  const supabase = createClient();
  const { emplacements } = useReferenceData();
  const emplacementsActifs = emplacements.filter((e) => e.actif);

  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [ajustement, setAjustement] = useState<{
    articleId: string;
    designation: string;
    emplacementId: string;
    emplacementNom: string;
    quantiteActuelle: number;
  } | null>(null);
  const [nouvelleQuantite, setNouvelleQuantite] = useState("");
  const [motif, setMotif] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("articles")
      .select(
        "id, designation, stocks(emplacement_id, quantite, conteneurs(code))"
      )
      .order("designation");

    if (!error && data) {
      const mapped = (
        data as unknown as {
          id: string;
          designation: string;
          stocks: {
            emplacement_id: string;
            quantite: number;
            conteneurs: { code: string } | null;
          }[];
        }[]
      ).map((a) => {
        const parEmplacement: Record<string, number> = {};
        const parConteneur: Record<string, number> = {};
        let total = 0;
        for (const s of a.stocks) {
          // Un article peut désormais avoir plusieurs lignes de stock pour
          // un même emplacement (une par conteneur) : on additionne, on
          // n'écrase jamais.
          parEmplacement[s.emplacement_id] =
            (parEmplacement[s.emplacement_id] || 0) + s.quantite;
          if (s.quantite > 0 && s.conteneurs) {
            parConteneur[s.conteneurs.code] =
              (parConteneur[s.conteneurs.code] || 0) + s.quantite;
          }
          total += s.quantite;
        }
        return {
          article_id: a.id,
          designation: a.designation,
          parEmplacement,
          parConteneur,
          total,
        };
      });
      setRows(mapped);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(["stocks", "articles"], load);

  function openAjustement(
    articleId: string,
    designation: string,
    emplacementId: string,
    emplacementNom: string,
    quantiteActuelle: number
  ) {
    setAjustement({
      articleId,
      designation,
      emplacementId,
      emplacementNom,
      quantiteActuelle,
    });
    setNouvelleQuantite(String(quantiteActuelle));
    setMotif("");
    setError(null);
  }

  async function handleAjustement(e: React.FormEvent) {
    e.preventDefault();
    if (!ajustement) return;

    const nouvelle = Number(nouvelleQuantite);
    if (Number.isNaN(nouvelle) || nouvelle < 0) {
      setError("Quantité invalide.");
      return;
    }

    const delta = nouvelle - ajustement.quantiteActuelle;
    if (delta === 0) {
      setAjustement(null);
      return;
    }

    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (delta < 0) {
      // Diminution : consomme en FIFO à travers TOUS les conteneurs
      // concernés (et non plus uniquement Stock Initial) — un article
      // peut désormais avoir du stock réparti sur plusieurs conteneurs.
      const { data: repartition, error: fifoError } = await supabase.rpc(
        "consommer_stock_fifo",
        {
          p_article_id: ajustement.articleId,
          p_emplacement_id: ajustement.emplacementId,
          p_quantite: -delta,
          p_conteneur_id: null,
        }
      );

      if (fifoError) {
        setError(
          logSupabaseError(
            { table: "stocks", operation: "rpc consommer_stock_fifo" },
            fifoError,
            "Impossible de corriger le stock. Réessayez."
          )
        );
        setSaving(false);
        return;
      }

      for (const part of repartition ?? []) {
        const { error: mouvementError } = await supabase
          .from("mouvements_stock")
          .insert({
            article_id: ajustement.articleId,
            emplacement_id: ajustement.emplacementId,
            type: "autre_sortie",
            quantite: -part.quantite,
            document_type: "ajustement_manuel",
            observation: motif.trim() || "Correction manuelle de stock",
            created_by: user?.id ?? null,
          });
        if (mouvementError) {
          logSupabaseError(
            { table: "mouvements_stock", operation: "insert" },
            mouvementError,
            ""
          );
        }
      }
    } else {
      // Augmentation : sans conteneur précis à indiquer, la quantité
      // ajoutée est rattachée au conteneur "Stock Initial".
      const stockInitialId = await getStockInitialId(supabase);
      if (!stockInitialId) {
        setError(
          "Conteneur « Stock Initial » introuvable. Exécutez la migration 0015 dans Supabase."
        );
        setSaving(false);
        return;
      }

      const { error: upsertError } = await supabase.from("stocks").upsert(
        {
          article_id: ajustement.articleId,
          emplacement_id: ajustement.emplacementId,
          conteneur_id: stockInitialId,
          quantite: delta,
        },
        { onConflict: "article_id,emplacement_id,conteneur_id" }
      );

      if (upsertError) {
        setError(
          logSupabaseError(
            { table: "stocks", operation: "upsert" },
            upsertError,
            "Impossible de mettre à jour le stock. Réessayez."
          )
        );
        setSaving(false);
        return;
      }

      const { error: mouvementError } = await supabase
        .from("mouvements_stock")
        .insert({
          article_id: ajustement.articleId,
          emplacement_id: ajustement.emplacementId,
          type: "autre_entree",
          quantite: delta,
          document_type: "ajustement_manuel",
          observation: motif.trim() || "Correction manuelle de stock",
          created_by: user?.id ?? null,
        });
      if (mouvementError) {
        logSupabaseError(
          { table: "mouvements_stock", operation: "insert" },
          mouvementError,
          ""
        );
      }
    }

    setSaving(false);
    setAjustement(null);
    load();
  }

  const filtres = rows.filter((r) =>
    r.designation.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {!embarque && (
        <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
          Stocks
        </h1>
      )}
      <p className="mt-1 text-sm text-onyx-500">
        Quantités par emplacement. Cliquez sur une quantité pour la
        corriger — chaque correction est enregistrée dans les mouvements de
        stock.
      </p>

      <div className="relative mt-5 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-onyx-300"
        />
        <input
          type="search"
          placeholder="Rechercher un article..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-onyx-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        />
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-onyx-400">
            Chargement...
          </p>
        ) : filtres.length === 0 ? (
          <div className="rounded-xl border border-dashed border-onyx-200 bg-white py-14 text-center">
            <p className="text-sm font-medium text-onyx-600">
              Aucun article trouvé
            </p>
          </div>
        ) : (
          <>
            {/* Vue cartes (mobile) */}
            <div className="grid grid-cols-1 gap-3 sm:hidden">
              {filtres.map((r) => (
                <div
                  key={r.article_id}
                  className="rounded-xl border border-onyx-100 bg-white p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-onyx-900">
                      {r.designation}
                    </p>
                    <span className="text-sm font-semibold text-onyx-800">
                      {r.total}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {emplacementsActifs.map((empl) => (
                      <button
                        key={empl.id}
                        onClick={() =>
                          openAjustement(
                            r.article_id,
                            r.designation,
                            empl.id,
                            empl.nom,
                            r.parEmplacement[empl.id] || 0
                          )
                        }
                        className="flex w-full items-center justify-between rounded-md bg-onyx-50/50 px-3 py-1.5 text-sm active:bg-onyx-100"
                      >
                        <span className="text-onyx-500">{empl.nom}</span>
                        <span className="flex items-center gap-1 font-medium text-onyx-700">
                          {r.parEmplacement[empl.id] || 0}
                          <Pencil size={12} className="text-onyx-300" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Vue tableau (desktop) */}
            <div className="hidden overflow-x-auto rounded-xl border border-onyx-100 bg-white sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                    <th className="px-4 py-3">Article</th>
                    {emplacementsActifs.map((empl) => (
                      <th key={empl.id} className="px-4 py-3 text-right">
                        {empl.nom}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Par conteneur</th>
                  </tr>
                </thead>
                <tbody>
                  {filtres.map((r) => (
                    <tr
                      key={r.article_id}
                      className="border-b border-onyx-50 last:border-0 hover:bg-onyx-50/40"
                    >
                      <td className="px-4 py-3 font-medium text-onyx-800">
                        {r.designation}
                      </td>
                      {emplacementsActifs.map((empl) => (
                        <td key={empl.id} className="px-4 py-3 text-right">
                          <button
                            onClick={() =>
                              openAjustement(
                                r.article_id,
                                r.designation,
                                empl.id,
                                empl.nom,
                                r.parEmplacement[empl.id] || 0
                              )
                            }
                            className="rounded px-2 py-0.5 text-onyx-600 hover:bg-onyx-100"
                          >
                            {r.parEmplacement[empl.id] || 0}
                          </button>
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-semibold text-onyx-900">
                        {r.total}
                      </td>
                      <td className="px-4 py-3 text-xs text-onyx-400">
                        {Object.entries(r.parConteneur).length === 0
                          ? "—"
                          : Object.entries(r.parConteneur)
                              .map(([code, qte]) => `${code} : ${qte}`)
                              .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {ajustement && (
        <Modal
          title={`Ajuster le stock — ${ajustement.emplacementNom}`}
          onClose={() => setAjustement(null)}
        >
          <form onSubmit={handleAjustement} className="space-y-4">
            {error && <InlineBanner message={error} />}

            <p className="text-sm text-onyx-500">
              Article : <span className="font-medium text-onyx-800">{ajustement.designation}</span>
            </p>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Nouvelle quantité
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={nouvelleQuantite}
                onChange={(e) => setNouvelleQuantite(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
              <p className="mt-1 text-xs text-onyx-400">
                Quantité actuelle : {ajustement.quantiteActuelle}
              </p>
              {ajustement.quantiteActuelle > 0 && (
                <button
                  type="button"
                  onClick={() => setNouvelleQuantite("0")}
                  className="mt-1.5 text-xs font-medium text-red-500 hover:underline"
                >
                  Vider ce stock (mettre à 0)
                </button>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Motif (optionnel)
              </label>
              <input
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ex : comptage physique, correction erreur..."
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <SecondaryButton
                type="button"
                onClick={() => setAjustement(null)}
                className="flex-1"
              >
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" loading={saving} className="flex-1">
                Valider
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
