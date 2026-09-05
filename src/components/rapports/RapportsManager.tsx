"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, Package, ShoppingCart, Truck, Wallet, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { exporterExcel, exporterExcelMisEnForme } from "@/lib/excel";
import { PrimaryButton } from "@/components/ui/Buttons";
import { useReferenceData } from "@/lib/hooks/useReferenceData";

type Periode = "aujourdhui" | "semaine" | "mois" | "tout";
type PeriodeFiltre = Periode | { debut: string; fin: string };

function debutPeriode(periode: Periode): string | null {
  const now = new Date();
  if (periode === "aujourdhui")
    return new Date(now.setHours(0, 0, 0, 0)).toISOString().slice(0, 10);
  if (periode === "semaine") {
    const jour = now.getDay() || 7;
    const lundi = new Date(now);
    lundi.setDate(now.getDate() - jour + 1);
    return lundi.toISOString().slice(0, 10);
  }
  if (periode === "mois")
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return null;
}

/** Résout un filtre de période (relatif ou mois précis) en bornes date. */
function resolvePeriode(p: PeriodeFiltre): { debut: string | null; fin: string | null } {
  if (typeof p === "object") return { debut: p.debut, fin: p.fin };
  return { debut: debutPeriode(p), fin: null };
}

const TABS = [
  { id: "stock", label: "Stock", icon: Package },
  { id: "ventes", label: "Ventes", icon: ShoppingCart },
  { id: "conteneurs", label: "Conteneurs", icon: Truck },
  { id: "caisse", label: "Caisse", icon: Wallet },
  { id: "tiers", label: "Créances / Dettes", icon: Users },
] as const;

type TabId = (typeof TABS)[number]["id"];

const MOIS_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function RapportsManager() {
  const [tab, setTab] = useState<TabId>("stock");
  const [periode, setPeriode] = useState<Periode>("mois");
  const [moisPrecis, setMoisPrecis] = useState("");
  const [anneePrecise, setAnneePrecise] = useState("");

  const anneeActuelle = new Date().getFullYear();
  const annees = Array.from({ length: 5 }, (_, i) => anneeActuelle - i);

  // Un mois précis (mois + année choisis) prime sur les périodes relatives.
  const periodeEffective: Periode | { debut: string; fin: string } =
    moisPrecis && anneePrecise
      ? {
          debut: `${anneePrecise}-${moisPrecis.padStart(2, "0")}-01`,
          fin: new Date(Number(anneePrecise), Number(moisPrecis), 1)
            .toISOString()
            .slice(0, 10),
        }
      : periode;

  return (
    <div>
      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        Rapports
      </h1>
      <p className="mt-1 text-sm text-onyx-500">
        Consultez et exportez les données de l&apos;entreprise.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto rounded-lg bg-onyx-50 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-white text-onyx-900 shadow-sm"
                  : "text-onyx-500 hover:text-onyx-700"
              }`}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>

        {(tab === "ventes" || tab === "conteneurs" || tab === "caisse") && (
          <div className="flex flex-wrap items-center gap-2">
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
                  onClick={() => {
                    setPeriode(p.id);
                    setMoisPrecis("");
                    setAnneePrecise("");
                  }}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    periode === p.id && !moisPrecis
                      ? "bg-white text-onyx-900 shadow-sm"
                      : "text-onyx-500 hover:text-onyx-700"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={moisPrecis}
                onChange={(e) => setMoisPrecis(e.target.value)}
                className="rounded-lg border border-onyx-200 px-2.5 py-1.5 text-xs outline-none focus:border-accent-400"
              >
                <option value="">Mois</option>
                {MOIS_LABELS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={anneePrecise}
                onChange={(e) => setAnneePrecise(e.target.value)}
                className="rounded-lg border border-onyx-200 px-2.5 py-1.5 text-xs outline-none focus:border-accent-400"
              >
                <option value="">Année</option>
                {annees.map((a) => (
                  <option key={a} value={String(a)}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5">
        {tab === "stock" && <RapportStock />}
        {tab === "ventes" && <RapportVentes periode={periodeEffective} />}
        {tab === "conteneurs" && <RapportConteneurs periode={periodeEffective} />}
        {tab === "caisse" && <RapportCaisse periode={periodeEffective} />}
        {tab === "tiers" && <RapportTiers />}
      </div>
    </div>
  );
}

function RapportStock() {
  const supabase = createClient();
  const { emplacements } = useReferenceData();
  const emplacementsActifs = emplacements.filter((e) => e.actif);
  const [lignes, setLignes] = useState<
    {
      designation: string;
      categorie: string;
      parEmplacement: Record<string, number>;
      total: number;
      stockMinimum: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("articles")
      .select(
        "designation, stock_minimum, categories(nom), stocks(emplacement_id, quantite)"
      )
      .eq("statut", "Actif")
      .order("designation");

    if (data) {
      const mapped = (
        data as unknown as {
          designation: string;
          stock_minimum: number;
          categories: { nom: string } | null;
          stocks: { emplacement_id: string; quantite: number }[];
        }[]
      ).map((a) => {
        const parEmplacement: Record<string, number> = {};
        let total = 0;
        for (const s of a.stocks) {
          parEmplacement[s.emplacement_id] =
            (parEmplacement[s.emplacement_id] || 0) + s.quantite;
          total += s.quantite;
        }
        return {
          designation: a.designation,
          categorie: a.categories?.nom ?? "",
          parEmplacement,
          total,
          stockMinimum: a.stock_minimum,
        };
      });
      setLignes(mapped);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function exporter() {
    const colonnes = [
      "Désignation",
      "Catégorie",
      ...emplacementsActifs.map((e) => e.nom),
      "Total",
      "Stock minimum",
    ];
    const lignesExport = lignes.map((l) => {
      const row: Record<string, unknown> = {
        Désignation: l.designation,
        Catégorie: l.categorie,
      };
      for (const e of emplacementsActifs) {
        row[e.nom] = l.parEmplacement[e.id] ?? 0;
      }
      row["Total"] = l.total;
      row["Stock minimum"] = l.stockMinimum;
      return row;
    });
    await exporterExcelMisEnForme(
      "Rapport_Stock_Onyx_Pharm",
      "Stock",
      colonnes,
      lignesExport
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-onyx-500">
          {lignes.length} article{lignes.length > 1 ? "s" : ""} actif
          {lignes.length > 1 ? "s" : ""}
        </p>
        <PrimaryButton onClick={exporter} className="px-3 py-1.5 text-xs">
          <Download size={14} />
          Exporter Excel
        </PrimaryButton>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-onyx-400">
          Chargement...
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-onyx-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                <th className="px-4 py-3">Article</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Seuil</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i} className="border-b border-onyx-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-onyx-800">
                    {l.designation}
                  </td>
                  <td className="px-4 py-2.5 text-onyx-500">{l.categorie || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-onyx-600">
                    {l.total}
                  </td>
                  <td className="px-4 py-2.5 text-right text-onyx-400">
                    {l.stockMinimum}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RapportVentes({ periode }: { periode: PeriodeFiltre }) {
  const supabase = createClient();
  const [lignes, setLignes] = useState<
    { reference: string; date_vente: string; montant_total: number; statut: string; clients: { nom: string } | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventes")
      .select("reference, date_vente, montant_total, statut, clients(nom)")
      .order("date_vente", { ascending: false });
    const { debut, fin } = resolvePeriode(periode);
    if (debut) query = query.gte("date_vente", debut);
    if (fin) query = query.lt("date_vente", fin);
    const { data } = await query;
    if (data) setLignes(data as unknown as typeof lignes);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  useEffect(() => {
    load();
  }, [load]);

  const total = lignes.reduce((s, l) => s + l.montant_total, 0);

  function exporter() {
    exporterExcel("rapport-ventes", [
      {
        nom: "Ventes",
        lignes: lignes.map((l) => ({
          Référence: l.reference,
          Date: l.date_vente,
          Client: l.clients?.nom ?? "",
          Montant: l.montant_total,
          Statut: l.statut,
        })),
      },
    ]);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-onyx-500">
          {lignes.length} vente{lignes.length > 1 ? "s" : ""} · Total :{" "}
          <span className="font-medium text-onyx-800">
            {total.toLocaleString("fr-FR")} FCFA
          </span>
        </p>
        <PrimaryButton onClick={exporter} className="px-3 py-1.5 text-xs">
          <Download size={14} />
          Exporter Excel
        </PrimaryButton>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-onyx-400">Chargement...</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-onyx-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.reference} className="border-b border-onyx-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-onyx-800">{l.reference}</td>
                  <td className="px-4 py-2.5 text-onyx-500">
                    {new Date(l.date_vente).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-2.5 text-onyx-500">{l.clients?.nom ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-onyx-700">
                    {l.montant_total.toLocaleString("fr-FR")}
                  </td>
                  <td className="px-4 py-2.5 text-onyx-500">{l.statut}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RapportConteneurs({ periode }: { periode: PeriodeFiltre }) {
  const supabase = createClient();
  const [lignes, setLignes] = useState<
    { code: string; date_arrivee: string; montant_achat_global: number | null; statut: string; fournisseurs: { nom: string } | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("conteneurs")
      .select("code, date_arrivee, montant_achat_global, statut, fournisseurs(nom)")
      .order("date_arrivee", { ascending: false });
    const { debut, fin } = resolvePeriode(periode);
    if (debut) query = query.gte("date_arrivee", debut);
    if (fin) query = query.lt("date_arrivee", fin);
    const { data } = await query;
    if (data) setLignes(data as unknown as typeof lignes);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  useEffect(() => {
    load();
  }, [load]);

  const total = lignes.reduce((s, l) => s + (l.montant_achat_global ?? 0), 0);

  function exporter() {
    exporterExcel("rapport-conteneurs", [
      {
        nom: "Conteneurs",
        lignes: lignes.map((l) => ({
          Code: l.code,
          Date: l.date_arrivee,
          Fournisseur: l.fournisseurs?.nom ?? "",
          "Montant d'achat": l.montant_achat_global ?? "",
          Statut: l.statut,
        })),
      },
    ]);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-onyx-500">
          {lignes.length} conteneur{lignes.length > 1 ? "s" : ""} · Total :{" "}
          <span className="font-medium text-onyx-800">
            {total.toLocaleString("fr-FR")} FCFA
          </span>
        </p>
        <PrimaryButton onClick={exporter} className="px-3 py-1.5 text-xs">
          <Download size={14} />
          Exporter Excel
        </PrimaryButton>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-onyx-400">Chargement...</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-onyx-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Fournisseur</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.code} className="border-b border-onyx-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-onyx-800">{l.code}</td>
                  <td className="px-4 py-2.5 text-onyx-500">
                    {new Date(l.date_arrivee).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-2.5 text-onyx-500">
                    {l.fournisseurs?.nom ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-onyx-700">
                    {l.montant_achat_global !== null
                      ? l.montant_achat_global.toLocaleString("fr-FR")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-onyx-500">{l.statut}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RapportCaisse({ periode }: { periode: PeriodeFiltre }) {
  const supabase = createClient();
  const [encaissements, setEncaissements] = useState<
    { reference: string; date_operation: string; montant: number; categorie: string | null; description: string | null }[]
  >([]);
  const [decaissements, setDecaissements] = useState<
    { reference: string; date_operation: string; montant: number; categorie: string | null; description: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { debut, fin } = resolvePeriode(periode);
    let encQuery = supabase
      .from("encaissements")
      .select("reference, date_operation, montant, categorie, description")
      .order("date_operation", { ascending: false });
    let decQuery = supabase
      .from("decaissements")
      .select("reference, date_operation, montant, categorie, description")
      .order("date_operation", { ascending: false });
    if (debut) {
      encQuery = encQuery.gte("date_operation", debut);
      decQuery = decQuery.gte("date_operation", debut);
    }
    if (fin) {
      encQuery = encQuery.lt("date_operation", fin);
      decQuery = decQuery.lt("date_operation", fin);
    }
    const [encRes, decRes] = await Promise.all([encQuery, decQuery]);
    if (encRes.data) setEncaissements(encRes.data);
    if (decRes.data) setDecaissements(decRes.data);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  useEffect(() => {
    load();
  }, [load]);

  const totalEnc = encaissements.reduce((s, e) => s + e.montant, 0);
  const totalDec = decaissements.reduce((s, d) => s + d.montant, 0);

  function exporter() {
    exporterExcel("rapport-caisse", [
      {
        nom: "Encaissements",
        lignes: encaissements.map((e) => ({
          Référence: e.reference,
          Date: e.date_operation,
          Catégorie: e.categorie ?? "",
          Description: e.description ?? "",
          Montant: e.montant,
        })),
      },
      {
        nom: "Décaissements",
        lignes: decaissements.map((d) => ({
          Référence: d.reference,
          Date: d.date_operation,
          Catégorie: d.categorie ?? "",
          Description: d.description ?? "",
          Montant: d.montant,
        })),
      },
    ]);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-onyx-500">
          Encaissements :{" "}
          <span className="font-medium text-emerald-600">
            {totalEnc.toLocaleString("fr-FR")} FCFA
          </span>{" "}
          · Décaissements :{" "}
          <span className="font-medium text-red-500">
            {totalDec.toLocaleString("fr-FR")} FCFA
          </span>
        </p>
        <PrimaryButton onClick={exporter} className="px-3 py-1.5 text-xs">
          <Download size={14} />
          Exporter Excel
        </PrimaryButton>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-onyx-400">Chargement...</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase text-onyx-400">
              Encaissements
            </p>
            <div className="space-y-1.5">
              {encaissements.slice(0, 20).map((e) => (
                <div
                  key={e.reference}
                  className="flex items-center justify-between rounded-lg border border-onyx-100 bg-white px-3 py-2 text-sm"
                >
                  <span className="text-onyx-600">
                    {e.description || e.reference}
                  </span>
                  <span className="font-medium text-emerald-600">
                    {e.montant.toLocaleString("fr-FR")}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase text-onyx-400">
              Décaissements
            </p>
            <div className="space-y-1.5">
              {decaissements.slice(0, 20).map((d) => (
                <div
                  key={d.reference}
                  className="flex items-center justify-between rounded-lg border border-onyx-100 bg-white px-3 py-2 text-sm"
                >
                  <span className="text-onyx-600">
                    {d.description || d.reference}
                  </span>
                  <span className="font-medium text-red-500">
                    {d.montant.toLocaleString("fr-FR")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RapportTiers() {
  const supabase = createClient();
  const [creances, setCreances] = useState<
    { reference: string; creance: number; client_id: string | null }[]
  >([]);
  const [dettes, setDettes] = useState<
    { reference: string; dette: number; fournisseur_id: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [creancesRes, dettesRes] = await Promise.all([
      supabase.from("v_creances_clients").select("reference, creance, client_id"),
      supabase.from("v_dettes_fournisseurs").select("reference, dette, fournisseur_id"),
    ]);
    if (creancesRes.data) setCreances(creancesRes.data);
    if (dettesRes.data) setDettes(dettesRes.data);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalCreances = creances.reduce((s, c) => s + c.creance, 0);
  const totalDettes = dettes.reduce((s, d) => s + d.dette, 0);

  function exporter() {
    exporterExcel("rapport-creances-dettes", [
      {
        nom: "Créances clients",
        lignes: creances.map((c) => ({ Référence: c.reference, Créance: c.creance })),
      },
      {
        nom: "Dettes fournisseurs",
        lignes: dettes.map((d) => ({ Référence: d.reference, Dette: d.dette })),
      },
    ]);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-onyx-500">
          Créances :{" "}
          <span className="font-medium text-red-500">
            {totalCreances.toLocaleString("fr-FR")} FCFA
          </span>{" "}
          · Dettes :{" "}
          <span className="font-medium text-red-500">
            {totalDettes.toLocaleString("fr-FR")} FCFA
          </span>
        </p>
        <PrimaryButton onClick={exporter} className="px-3 py-1.5 text-xs">
          <Download size={14} />
          Exporter Excel
        </PrimaryButton>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-onyx-400">Chargement...</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase text-onyx-400">
              Créances clients
            </p>
            {creances.length === 0 ? (
              <p className="text-sm text-onyx-400">Aucune créance en cours.</p>
            ) : (
              <div className="space-y-1.5">
                {creances.map((c) => (
                  <div
                    key={c.reference}
                    className="flex items-center justify-between rounded-lg border border-onyx-100 bg-white px-3 py-2 text-sm"
                  >
                    <span className="text-onyx-600">{c.reference}</span>
                    <span className="font-medium text-red-500">
                      {c.creance.toLocaleString("fr-FR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase text-onyx-400">
              Dettes fournisseurs
            </p>
            {dettes.length === 0 ? (
              <p className="text-sm text-onyx-400">Aucune dette en cours.</p>
            ) : (
              <div className="space-y-1.5">
                {dettes.map((d) => (
                  <div
                    key={d.reference}
                    className="flex items-center justify-between rounded-lg border border-onyx-100 bg-white px-3 py-2 text-sm"
                  >
                    <span className="text-onyx-600">{d.reference}</span>
                    <span className="font-medium text-red-500">
                      {d.dette.toLocaleString("fr-FR")}
                    </span>
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
