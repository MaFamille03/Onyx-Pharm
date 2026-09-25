"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Download, RefreshCw, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { exporterExcelMisEnForme } from "@/lib/excel";

const fcfa = (value: number) => `${value.toLocaleString("fr-FR")} FCFA`;

type ClientSynthese = {
  client_id: string;
  client_nom: string;
  nombre_ventes: number;
  total_achats: number;
  total_paye: number;
  total_du: number;
  panier_moyen: number;
  derniere_vente: string | null;
};

type VentePeriode = {
  id: string;
  client_id: string | null;
  date_vente: string;
  montant_total: number;
  montant_paye: number;
  statut: string;
  clients: { nom: string } | null;
};

type PaiementPeriode = {
  montant: number;
  date_paiement: string;
  vente_id: string;
};

function debutMoisCourant() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function finAujourdhui() {
  return new Date().toISOString().slice(0, 10);
}

export function VentesSynthese() {
  const supabase = createClient();
  const [debut, setDebut] = useState(debutMoisCourant());
  const [fin, setFin] = useState(finAujourdhui());
  const [ventes, setVentes] = useState<VentePeriode[]>([]);
  const [paiements, setPaiements] = useState<PaiementPeriode[]>([]);
  const [clients, setClients] = useState<ClientSynthese[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!debut || !fin || debut > fin) {
      setError("La date de début doit être antérieure ou égale à la date de fin.");
      setLoading(false);
      return;
    }

    const finExclusive = new Date(`${fin}T00:00:00`);
    finExclusive.setDate(finExclusive.getDate() + 1);
    const finQuery = finExclusive.toISOString().slice(0, 10);

    const [ventesRes, paiementsRes, clientsRes] = await Promise.all([
      supabase
        .from("ventes")
        .select("id, client_id, date_vente, montant_total, montant_paye, statut, clients(nom)")
        .gte("date_vente", debut)
        .lt("date_vente", finQuery)
        .not("statut", "in", "(Annulé,Brouillon)"),
      supabase
        .from("paiements_ventes")
        .select("montant, date_paiement, vente_id")
        .gte("date_paiement", debut)
        .lt("date_paiement", finQuery),
      supabase
        .from("v_synthese_clients_ventes")
        .select("client_id, client_nom, nombre_ventes, total_achats, total_paye, total_du, panier_moyen, derniere_vente")
        .order("total_du", { ascending: false }),
    ]);

    if (ventesRes.error) {
      setError(logSupabaseError({ table: "ventes", operation: "select synthèse" }, ventesRes.error, "Impossible de charger le résumé des ventes."));
    } else {
      setVentes((ventesRes.data ?? []) as VentePeriode[]);
    }

    if (paiementsRes.error) {
      setError((prev) => prev ?? logSupabaseError({ table: "paiements_ventes", operation: "select synthèse" }, paiementsRes.error, "Impossible de charger les encaissements."));
    } else {
      setPaiements((paiementsRes.data ?? []) as PaiementPeriode[]);
    }

    if (clientsRes.error) {
      setError((prev) => prev ?? logSupabaseError({ table: "v_synthese_clients_ventes", operation: "select" }, clientsRes.error, "Impossible de charger la situation des clients."));
    } else {
      setClients((clientsRes.data ?? []) as ClientSynthese[]);
    }

    setLoading(false);
  }, [debut, fin]);

  useEffect(() => {
    load();
  }, [load]);

  const totalVentes = ventes.reduce((s, v) => s + v.montant_total, 0);
  const encaissementsPeriode = paiements.reduce((s, p) => s + Number(p.montant), 0);
  const nombreVentes = ventes.length;
  const panierMoyen = nombreVentes ? totalVentes / nombreVentes : 0;
  const clientsActifsPeriode = new Set(ventes.map((v) => v.client_id).filter(Boolean)).size;
  const creancesGlobales = clients.reduce((s, c) => s + Math.max(0, c.total_du), 0);

  const classementPeriode = useMemo(() => {
    const map = new Map<string, { nom: string; ventes: number; ca: number; clientId: string | null }>();
    for (const v of ventes) {
      const key = v.client_id ?? "__passage__";
      const actuel = map.get(key) ?? {
        nom: v.clients?.nom ?? "Client de passage",
        ventes: 0,
        ca: 0,
        clientId: v.client_id,
      };
      actuel.ventes += 1;
      actuel.ca += Number(v.montant_total);
      map.set(key, actuel);
    }
    return Array.from(map.values()).sort((a, b) => b.ca - a.ca);
  }, [ventes]);

  function appliquerPeriode(type: "mois" | "trimestre" | "annee" | "tout") {
    const now = new Date();
    if (type === "mois") {
      setDebut(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
      setFin(finAujourdhui());
    } else if (type === "trimestre") {
      const debutTrimestre = Math.floor(now.getMonth() / 3) * 3;
      setDebut(new Date(now.getFullYear(), debutTrimestre, 1).toISOString().slice(0, 10));
      setFin(finAujourdhui());
    } else if (type === "annee") {
      setDebut(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
      setFin(finAujourdhui());
    } else {
      setDebut("2000-01-01");
      setFin(finAujourdhui());
    }
  }

  function exporter() {
    exporterExcelMisEnForme(
      "Synthese_Ventes_Onyx_Pharm",
      "Clients",
      ["Client", "Nombre de ventes", "Total achats", "Total payé", "Total dû", "Panier moyen", "Dernière vente"],
      clients.map((c) => ({
        Client: c.client_nom,
        "Nombre de ventes": c.nombre_ventes,
        "Total achats": c.total_achats,
        "Total payé": c.total_paye,
        "Total dû": c.total_du,
        "Panier moyen": c.panier_moyen,
        "Dernière vente": c.derniere_vente ?? "",
      }))
    );
  }

  return (
    <section className="mt-5 rounded-2xl border border-onyx-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-onyx-500" />
            <h2 className="text-base font-semibold text-onyx-900">Résumé commercial des ventes</h2>
          </div>
          <p className="mt-1 text-xs text-onyx-500">
            Le chiffre d&apos;affaires est basé sur les ventes. Les encaissements correspondent uniquement aux paiements réellement enregistrés.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([['mois', 'Ce mois'], ['trimestre', 'Ce trimestre'], ['annee', 'Cette année'], ['tout', 'Tout']] as const).map(([id, label]) => (
            <SecondaryButton key={id} onClick={() => appliquerPeriode(id)} className="min-h-0 px-2.5 py-1.5 text-xs">
              {label}
            </SecondaryButton>
          ))}
          <SecondaryButton onClick={exporter} className="min-h-0 px-2.5 py-1.5 text-xs">
            <Download size={14} /> Exporter clients
          </SecondaryButton>
          <SecondaryButton onClick={load} className="min-h-0 px-2.5 py-1.5 text-xs" disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </SecondaryButton>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl bg-onyx-50 p-3">
          <p className="text-xs text-onyx-500">Nombre de ventes</p>
          <p className="mt-1 text-lg font-semibold text-onyx-900">{nombreVentes}</p>
        </div>
        <div className="rounded-xl bg-onyx-50 p-3">
          <p className="text-xs text-onyx-500">Chiffre d&apos;affaires</p>
          <p className="mt-1 text-lg font-semibold text-onyx-900">{fcfa(totalVentes)}</p>
        </div>
        <div className="rounded-xl bg-onyx-50 p-3">
          <p className="text-xs text-onyx-500">Encaissements période</p>
          <p className="mt-1 text-lg font-semibold text-emerald-600">{fcfa(encaissementsPeriode)}</p>
        </div>
        <div className="rounded-xl bg-onyx-50 p-3">
          <p className="text-xs text-onyx-500">Panier moyen</p>
          <p className="mt-1 text-lg font-semibold text-onyx-900">{fcfa(panierMoyen)}</p>
        </div>
        <div className="rounded-xl bg-red-50 p-3">
          <p className="text-xs text-red-600">Créances clients totales</p>
          <p className="mt-1 text-lg font-semibold text-red-700">{fcfa(creancesGlobales)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-onyx-100">
          <div className="flex items-center justify-between border-b border-onyx-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-onyx-800">Période analysée</h3>
              <p className="text-xs text-onyx-400">Du {new Date(debut).toLocaleDateString("fr-FR")} au {new Date(fin).toLocaleDateString("fr-FR")}</p>
            </div>
            <CalendarDays size={17} className="text-onyx-400" />
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-onyx-600">Du</label>
              <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="w-full rounded-lg border border-onyx-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-onyx-600">Au</label>
              <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="w-full rounded-lg border border-onyx-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="border-t border-onyx-100 px-4 py-3 text-xs text-onyx-500">
            <Users size={14} className="mr-1 inline" /> {clientsActifsPeriode} client(s) distinct(s) ayant acheté sur la période.
          </div>
        </div>

        <div className="rounded-xl border border-onyx-100">
          <div className="border-b border-onyx-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-onyx-800">Clients — achats sur la période</h3>
            <p className="text-xs text-onyx-400">Classement par chiffre d&apos;affaires, sans confondre CA et paiement.</p>
          </div>
          <div className="max-h-72 overflow-auto">
            {classementPeriode.length === 0 ? (
              <p className="p-4 text-sm text-onyx-400">Aucune vente sur cette période.</p>
            ) : classementPeriode.map((c) => (
              <div key={c.clientId ?? c.nom} className="flex items-center justify-between gap-3 border-b border-onyx-50 px-4 py-3 last:border-0">
                <div>
                  <p className="text-sm font-medium text-onyx-800">{c.nom}</p>
                  <p className="text-xs text-onyx-400">{c.ventes} commande{c.ventes > 1 ? "s" : ""}</p>
                </div>
                <p className="text-sm font-semibold text-onyx-800">{fcfa(c.ca)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-onyx-100">
        <div className="border-b border-onyx-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-onyx-800">Situation cumulée par client</h3>
          <p className="text-xs text-onyx-400">Toutes les commandes du client, même lorsqu&apos;il en a plusieurs. Le total dû est calculé après tous les paiements enregistrés.</p>
        </div>
        {loading ? (
          <p className="p-6 text-center text-sm text-onyx-400">Chargement...</p>
        ) : (
          <table className="w-full min-w-[850px] text-sm">
            <thead>
              <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs uppercase tracking-wide text-onyx-400">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3 text-right">Commandes</th>
                <th className="px-4 py-3 text-right">Total achats</th>
                <th className="px-4 py-3 text-right">Total payé</th>
                <th className="px-4 py-3 text-right">Total dû</th>
                <th className="px-4 py-3 text-right">Panier moyen</th>
                <th className="px-4 py-3">Dernier achat</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.client_id} className="border-b border-onyx-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-onyx-800">{c.client_nom}</td>
                  <td className="px-4 py-3 text-right text-onyx-500">{c.nombre_ventes}</td>
                  <td className="px-4 py-3 text-right text-onyx-700">{fcfa(c.total_achats)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">{fcfa(c.total_paye)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${c.total_du > 0 ? "text-red-600" : "text-onyx-400"}`}>{fcfa(Math.max(0, c.total_du))}</td>
                  <td className="px-4 py-3 text-right text-onyx-500">{fcfa(c.panier_moyen)}</td>
                  <td className="px-4 py-3 text-onyx-500">{c.derniere_vente ? new Date(c.derniere_vente).toLocaleDateString("fr-FR") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
