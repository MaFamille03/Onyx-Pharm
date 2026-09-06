"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatutBadge } from "@/components/ui/Badges";

type DetailArticle = {
  id: string;
  designation: string;
  marque: string | null;
  prix_vente_conseille: number;
  stock_minimum: number;
  statut: string;
  date_expiration: string | null;
  categories: { nom: string } | null;
  fournisseurs: { nom: string } | null;
  stocks: {
    quantite: number;
    emplacements: { nom: string } | null;
    conteneurs: { code: string } | null;
  }[];
};

/**
 * Panneau d'information sur un article, purement consultatif — ni
 * modification ni suppression possibles ici. Se met à jour dès que
 * `designation` change, et disparaît si elle devient vide.
 */
export function ArticleInfoPanel({ designation }: { designation: string }) {
  const [correspondances, setCorrespondances] = useState<
    { id: string; designation: string }[]
  >([]);
  const [article, setArticle] = useState<DetailArticle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const requete = designation.trim();
    if (!requete) {
      setArticle(null);
      setCorrespondances([]);
      return;
    }
    let annule = false;
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("articles")
      .select("id, designation")
      .ilike("designation", `%${requete}%`)
      .order("designation")
      .limit(8)
      .then(({ data }) => {
        if (annule) return;
        const liste = data ?? [];
        if (liste.length === 1) {
          setCorrespondances([]);
          chargerDetail(liste[0].id);
        } else {
          setArticle(null);
          setCorrespondances(liste);
          setLoading(false);
        }
      });

    async function chargerDetail(id: string) {
      const { data } = await supabase
        .from("articles")
        .select(
          "id, designation, marque, prix_vente_conseille, stock_minimum, statut, date_expiration, categories(nom), fournisseurs(nom), stocks(quantite, emplacements(nom), conteneurs(code))"
        )
        .eq("id", id)
        .maybeSingle();
      if (!annule) {
        setArticle(data as unknown as DetailArticle | null);
        setLoading(false);
      }
    }

    return () => {
      annule = true;
    };
  }, [designation]);

  async function choisir(id: string) {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("articles")
      .select(
        "id, designation, marque, prix_vente_conseille, stock_minimum, statut, date_expiration, categories(nom), fournisseurs(nom), stocks(quantite, emplacements(nom), conteneurs(code))"
      )
      .eq("id", id)
      .maybeSingle();
    setArticle(data as unknown as DetailArticle | null);
    setCorrespondances([]);
    setLoading(false);
  }

  if (!designation.trim()) return null;

  const stockTotal = article
    ? article.stocks.reduce((s, l) => s + l.quantite, 0)
    : 0;
  const stockFaible = article ? stockTotal <= article.stock_minimum : false;

  return (
    <div className="mt-1.5 w-full rounded-xl border border-onyx-100 bg-white p-5 shadow-sm">
      {loading ? (
        <p className="text-sm text-onyx-400">Recherche...</p>
      ) : correspondances.length > 1 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-onyx-400">
            {correspondances.length} articles correspondent — précisez :
          </p>
          <div className="space-y-1">
            {correspondances.map((c) => (
              <button
                key={c.id}
                onClick={() => choisir(c.id)}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-onyx-700 hover:bg-onyx-50"
              >
                {c.designation}
              </button>
            ))}
          </div>
        </div>
      ) : !article ? (
        <p className="text-sm text-onyx-400">
          Aucun article ne correspond à &quot;{designation}&quot;.
        </p>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Package size={17} className="text-onyx-400" />
                <h3 className="text-base font-semibold text-onyx-900">
                  {article.designation}
                </h3>
              </div>
              <p className="mt-0.5 text-sm text-onyx-500">
                {article.categories?.nom || "Sans catégorie"}
                {article.marque ? ` · ${article.marque}` : ""}
                {article.fournisseurs?.nom ? ` · ${article.fournisseurs.nom}` : ""}
              </p>
            </div>
            <StatutBadge statut={article.statut} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-onyx-50 p-3 text-center">
              <p className="text-lg font-semibold text-onyx-900">
                {article.prix_vente_conseille.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-400">Prix de vente référence</p>
            </div>
            <div className="rounded-lg bg-onyx-50 p-3 text-center">
              <p
                className={`flex items-center justify-center gap-1 text-lg font-semibold ${
                  stockFaible ? "text-red-500" : "text-onyx-900"
                }`}
              >
                {stockFaible && <AlertTriangle size={15} />}
                {stockTotal}
              </p>
              <p className="text-xs text-onyx-400">Stock disponible</p>
            </div>
            <div className="rounded-lg bg-onyx-50 p-3 text-center">
              <p className="text-lg font-semibold text-onyx-900">
                {article.stock_minimum}
              </p>
              <p className="text-xs text-onyx-400">Seuil d&apos;alerte</p>
            </div>
            <div className="rounded-lg bg-onyx-50 p-3 text-center">
              <p className="text-sm font-medium text-onyx-900">
                {article.date_expiration
                  ? new Date(article.date_expiration).toLocaleDateString("fr-FR")
                  : "—"}
              </p>
              <p className="text-xs text-onyx-400">Date d&apos;expiration</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-onyx-400">
              Détail par emplacement
            </p>
            {article.stocks.length === 0 ? (
              <p className="text-sm text-onyx-400">Aucun stock enregistré.</p>
            ) : (
              <div className="space-y-1">
                {article.stocks.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md bg-onyx-50/60 px-3 py-1.5 text-sm"
                  >
                    <span className="text-onyx-600">
                      {s.emplacements?.nom ?? "—"}
                      {s.conteneurs?.code ? ` · ${s.conteneurs.code}` : ""}
                    </span>
                    <span className="font-medium text-onyx-800">{s.quantite}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
