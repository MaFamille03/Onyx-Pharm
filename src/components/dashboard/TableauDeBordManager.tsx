"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShoppingCart,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

type Periode = "aujourdhui" | "semaine" | "mois" | "tout";

function debutPeriode(periode: Periode): string | null {
  const now = new Date();
  if (periode === "aujourdhui") {
    return new Date(now.setHours(0, 0, 0, 0)).toISOString().slice(0, 10);
  }
  if (periode === "semaine") {
    const jour = now.getDay() || 7;
    const lundi = new Date(now);
    lundi.setDate(now.getDate() - jour + 1);
    return lundi.toISOString().slice(0, 10);
  }
  if (periode === "mois") {
    return new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
  }
  return null;
}

export function TableauDeBordManager({
  nomUtilisateur,
}: {
  nomUtilisateur: string | null;
}) {
  const supabase = createClient();
  const [periode, setPeriode] = useState<Periode>("mois");
  const [loading, setLoading] = useState(true);

  const [chiffreAffaires, setChiffreAffaires] = useState(0);
  const [nombreVentes, setNombreVentes] = useState(0);
  const [valeurStock, setValeurStock] = useState(0);
  const [stockFaibleCount, setStockFaibleCount] = useState(0);
  const [ruptureCount, setRuptureCount] = useState(0);
  const [expirationCount, setExpirationCount] = useState(0);
  const [encaissements, setEncaissements] = useState(0);
  const [decaissements, setDecaissements] = useState(0);
  const [creancesTotal, setCreancesTotal] = useState(0);
  const [dettesTotal, setDettesTotal] = useState(0);
  const [venteRecentes, setVentesRecentes] = useState<
    { reference: string; montant_total: number; statut: string; date_vente: string }[]
  >([]);
  const [conteneursRecents, setConteneursRecents] = useState<
    { code: string; montant_achat_global: number | null; statut: string; date_arrivee: string }[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    const debut = debutPeriode(periode);

    let ventesQuery = supabase
      .from("ventes")
      .select("montant_total, statut, date_vente, reference")
      .neq("statut", "Annulé")
      .neq("statut", "Brouillon");
    let conteneursQuery = supabase
      .from("conteneurs")
      .select("code, montant_achat_global, statut, date_arrivee")
      .neq("statut", "Annulé");
    let encQuery = supabase.from("encaissements").select("montant");
    let decQuery = supabase.from("decaissements").select("montant");

    if (debut) {
      ventesQuery = ventesQuery.gte("date_vente", debut);
      conteneursQuery = conteneursQuery.gte("date_arrivee", debut);
      encQuery = encQuery.gte("date_operation", debut);
      decQuery = decQuery.gte("date_operation", debut);
    }

    const [
      ventesRes,
      conteneursRes,
      encRes,
      decRes,
      articlesRes,
      creancesRes,
      dettesRes,
      paramRes,
    ] = await Promise.all([
      ventesQuery,
      conteneursQuery,
      encQuery,
      decQuery,
      supabase
        .from("articles")
        .select("prix_vente_conseille, stock_minimum, date_expiration, stocks(quantite)")
        .eq("statut", "Actif"),
      supabase.from("v_creances_clients").select("creance"),
      supabase.from("v_dettes_fournisseurs").select("dette"),
      supabase
        .from("parametres_generaux")
        .select("valeur")
        .eq("cle", "delai_alerte_expiration_jours")
        .maybeSingle(),
    ]);

    const ventes = ventesRes.data ?? [];
    setChiffreAffaires(ventes.reduce((s, v) => s + v.montant_total, 0));
    setNombreVentes(ventes.length);
    setVentesRecentes(
      [...ventes]
        .sort((a, b) => (a.date_vente < b.date_vente ? 1 : -1))
        .slice(0, 5) as typeof venteRecentes
    );

    const conteneurs = conteneursRes.data ?? [];
    setConteneursRecents(
      [...conteneurs]
        .sort((a, b) => (a.date_arrivee < b.date_arrivee ? 1 : -1))
        .slice(0, 5)
    );

    setEncaissements((encRes.data ?? []).reduce((s, e) => s + e.montant, 0));
    setDecaissements((decRes.data ?? []).reduce((s, d) => s + d.montant, 0));

    const delaiAlerte = paramRes.data?.valeur
      ? Number(paramRes.data.valeur) || 30
      : 30;
    const articles = (articlesRes.data ?? []) as unknown as {
      prix_vente_conseille: number;
      stock_minimum: number;
      date_expiration: string | null;
      stocks: { quantite: number }[];
    }[];

    let valStock = 0;
    let faible = 0;
    let rupture = 0;
    let expirationBientot = 0;
    const aujourdHui = new Date().setHours(0, 0, 0, 0);

    for (const a of articles) {
      const total = a.stocks.reduce((s, x) => s + x.quantite, 0);
      valStock += total * a.prix_vente_conseille;
      if (total === 0) rupture += 1;
      else if (total <= a.stock_minimum) faible += 1;
      if (a.date_expiration) {
        const jours = Math.ceil(
          (new Date(a.date_expiration).getTime() - aujourdHui) /
            (1000 * 60 * 60 * 24)
        );
        if (jours >= 0 && jours <= delaiAlerte) expirationBientot += 1;
      }
    }
    setValeurStock(valStock);
    setStockFaibleCount(faible);
    setRuptureCount(rupture);
    setExpirationCount(expirationBientot);

    setCreancesTotal(
      (creancesRes.data ?? []).reduce((s, c) => s + c.creance, 0)
    );
    setDettesTotal((dettesRes.data ?? []).reduce((s, d) => s + d.dette, 0));

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    ["ventes", "conteneurs", "encaissements", "decaissements", "stocks"],
    load
  );

  const heureActuelle = new Date().getHours();
  const salutation =
    heureActuelle < 12
      ? "Bonjour"
      : heureActuelle < 18
        ? "Bon après-midi"
        : "Bonsoir";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
            {salutation}
            {nomUtilisateur ? `, ${nomUtilisateur}` : ""}
          </h1>
          <p className="mt-1 text-sm text-onyx-500">
            Vue d&apos;ensemble de l&apos;activité ONYX PHARM.
          </p>
        </div>
        <div className="flex gap-1.5 overflow-x-auto rounded-lg bg-onyx-50 p-1">
          {(
            [
              { id: "aujourdhui", label: "Aujourd'hui" },
              { id: "semaine", label: "Semaine" },
              { id: "mois", label: "Mois" },
              { id: "tout", label: "Tout" },
            ] as { id: Periode; label: string }[]
          ).map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriode(p.id)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                periode === p.id
                  ? "bg-white text-onyx-900 shadow-sm"
                  : "text-onyx-500 hover:text-onyx-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-onyx-400">
          Chargement...
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <Carte
              icon={ShoppingCart}
              label="Chiffre d'affaires"
              valeur={`${chiffreAffaires.toLocaleString("fr-FR")} F`}
              sousLabel={`${nombreVentes} vente${nombreVentes > 1 ? "s" : ""}`}
            />
            <Carte
              icon={Package}
              label="Valeur du stock"
              valeur={`${valeurStock.toLocaleString("fr-FR")} F`}
              sousLabel="Au prix de vente référence"
            />
            <Carte
              icon={Users}
              label="Créances clients"
              valeur={`${creancesTotal.toLocaleString("fr-FR")} F`}
              couleur={creancesTotal > 0 ? "text-red-500" : undefined}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <Carte
              icon={Truck}
              label="Dettes fournisseurs"
              valeur={`${dettesTotal.toLocaleString("fr-FR")} F`}
              couleur={dettesTotal > 0 ? "text-red-500" : undefined}
            />
            <Carte
              icon={TrendingUp}
              label="Encaissements"
              valeur={`${encaissements.toLocaleString("fr-FR")} F`}
              couleur="text-emerald-600"
            />
            <Carte
              icon={TrendingDown}
              label="Décaissements"
              valeur={`${decaissements.toLocaleString("fr-FR")} F`}
              couleur="text-red-500"
            />
          </div>

          {(ruptureCount > 0 || stockFaibleCount > 0 || expirationCount > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent-100 bg-accent-50 px-4 py-3">
              <AlertTriangle size={16} className="text-accent-600" />
              <p className="text-sm text-accent-800">
                {ruptureCount > 0 && `${ruptureCount} rupture(s) de stock`}
                {ruptureCount > 0 && (stockFaibleCount > 0 || expirationCount > 0) && " · "}
                {stockFaibleCount > 0 && `${stockFaibleCount} stock(s) faible(s)`}
                {stockFaibleCount > 0 && expirationCount > 0 && " · "}
                {expirationCount > 0 &&
                  `${expirationCount} produit(s) proche(s) de l'expiration`}
                {" — voir "}
                <a href="/stock" className="font-medium underline">
                  Stock &gt; Alertes
                </a>
              </p>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-onyx-100 bg-white p-4">
              <h2 className="text-sm font-semibold text-onyx-800">
                Ventes récentes
              </h2>
              {venteRecentes.length === 0 ? (
                <p className="mt-2 text-sm text-onyx-400">
                  Aucune vente sur la période.
                </p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {venteRecentes.map((v) => (
                    <div
                      key={v.reference}
                      className="flex items-center justify-between rounded-md bg-onyx-50/50 px-3 py-2 text-sm"
                    >
                      <span className="text-onyx-600">{v.reference}</span>
                      <span className="font-medium text-onyx-800">
                        {v.montant_total.toLocaleString("fr-FR")} F
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-onyx-100 bg-white p-4">
              <h2 className="text-sm font-semibold text-onyx-800">
                Conteneurs récents
              </h2>
              {conteneursRecents.length === 0 ? (
                <p className="mt-2 text-sm text-onyx-400">
                  Aucun conteneur sur la période.
                </p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {conteneursRecents.map((c) => (
                    <div
                      key={c.code}
                      className="flex items-center justify-between rounded-md bg-onyx-50/50 px-3 py-2 text-sm"
                    >
                      <span className="text-onyx-600">{c.code}</span>
                      <span className="font-medium text-onyx-800">
                        {c.montant_achat_global !== null
                          ? `${c.montant_achat_global.toLocaleString("fr-FR")} F`
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Carte({
  icon: Icon,
  label,
  valeur,
  sousLabel,
  couleur,
}: {
  icon: LucideIcon;
  label: string;
  valeur: string;
  sousLabel?: string;
  couleur?: string;
}) {
  return (
    <div className="rounded-xl border border-onyx-100 bg-white p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-onyx-50 text-onyx-500">
        <Icon size={18} />
      </div>
      <p
        className={`mt-3 text-lg font-semibold sm:text-xl ${couleur ?? "text-onyx-900"}`}
      >
        {valeur}
      </p>
      <p className="text-xs font-medium text-onyx-500">{label}</p>
      {sousLabel && <p className="mt-0.5 text-[11px] text-onyx-300">{sousLabel}</p>}
    </div>
  );
}
