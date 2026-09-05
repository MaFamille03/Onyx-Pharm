"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, XCircle, Clock, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ArticleAlerte = {
  id: string;
  designation: string;
  stock_minimum: number;
  date_expiration: string | null;
  stocks: { quantite: number }[];
};

function joursAvantExpiration(date: string | null): number | null {
  if (!date) return null;
  const diff =
    (new Date(date).getTime() - new Date().setHours(0, 0, 0, 0)) /
    (1000 * 60 * 60 * 24);
  return Math.ceil(diff);
}

export function AlertesStock() {
  const supabase = createClient();
  const [articles, setArticles] = useState<ArticleAlerte[]>([]);
  const [loading, setLoading] = useState(true);
  const [delaiAlerte, setDelaiAlerte] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    const [articlesRes, paramRes] = await Promise.all([
      supabase
        .from("articles")
        .select("id, designation, stock_minimum, date_expiration, stocks(quantite)")
        .eq("statut", "Actif")
        .order("designation"),
      supabase
        .from("parametres_generaux")
        .select("valeur")
        .eq("cle", "delai_alerte_expiration_jours")
        .maybeSingle(),
    ]);
    if (articlesRes.data)
      setArticles(articlesRes.data as unknown as ArticleAlerte[]);
    if (paramRes.data?.valeur) setDelaiAlerte(Number(paramRes.data.valeur) || 30);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <p className="py-10 text-center text-sm text-onyx-400">
        Chargement...
      </p>
    );
  }

  const enrichis = articles.map((a) => {
    const total = a.stocks.reduce((s, x) => s + x.quantite, 0);
    const jours = joursAvantExpiration(a.date_expiration);
    return { ...a, total, jours };
  });

  const ruptures = enrichis.filter((a) => a.total === 0);
  const stocksFaibles = enrichis.filter(
    (a) => a.total > 0 && a.total <= a.stock_minimum
  );
  const expires = enrichis.filter((a) => a.jours !== null && a.jours < 0);
  const bientotExpires = enrichis.filter(
    (a) => a.jours !== null && a.jours >= 0 && a.jours <= delaiAlerte
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        Alertes stock
      </h1>
      <p className="mt-1 text-sm text-onyx-500">
        Ruptures, stocks faibles et produits proches de l&apos;expiration.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AlerteBloc
          titre="Ruptures de stock"
          icon={XCircle}
          couleur="red"
          items={ruptures.map((a) => ({
            id: a.id,
            label: a.designation,
            detail: "Stock : 0",
          }))}
          vide="Aucune rupture de stock."
        />

        <AlerteBloc
          titre="Stocks faibles"
          icon={AlertTriangle}
          couleur="accent"
          items={stocksFaibles.map((a) => ({
            id: a.id,
            label: a.designation,
            detail: `Stock : ${a.total} (seuil : ${a.stock_minimum})`,
          }))}
          vide="Aucun stock faible."
        />

        <AlerteBloc
          titre="Produits expirés"
          icon={XCircle}
          couleur="red"
          items={expires.map((a) => ({
            id: a.id,
            label: a.designation,
            detail: `Expiré depuis ${Math.abs(a.jours!)} jour${Math.abs(a.jours!) > 1 ? "s" : ""}`,
          }))}
          vide="Aucun produit expiré."
        />

        <AlerteBloc
          titre="Expiration proche"
          icon={Clock}
          couleur="accent"
          items={bientotExpires.map((a) => ({
            id: a.id,
            label: a.designation,
            detail:
              a.jours === 0
                ? "Expire aujourd'hui"
                : `Expire dans ${a.jours} jour${a.jours! > 1 ? "s" : ""}`,
          }))}
          vide={`Aucun produit n'expire dans les ${delaiAlerte} prochains jours.`}
        />
      </div>
    </div>
  );
}

function AlerteBloc({
  titre,
  icon: Icon,
  couleur,
  items,
  vide,
}: {
  titre: string;
  icon: LucideIcon;
  couleur: "red" | "accent";
  items: { id: string; label: string; detail: string }[];
  vide: string;
}) {
  const colorClasses =
    couleur === "red"
      ? "bg-red-50 text-red-600"
      : "bg-accent-50 text-accent-600";

  return (
    <div className="rounded-xl border border-onyx-100 bg-white p-4">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorClasses}`}
        >
          <Icon size={16} />
        </div>
        <h2 className="text-sm font-semibold text-onyx-800">
          {titre} {items.length > 0 && `(${items.length})`}
        </h2>
      </div>

      <div className="mt-3 space-y-1.5">
        {items.length === 0 ? (
          <p className="text-sm text-onyx-400">{vide}</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md bg-onyx-50/50 px-3 py-2 text-sm"
            >
              <span className="text-onyx-700">{item.label}</span>
              <span className="text-xs text-onyx-400">{item.detail}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
