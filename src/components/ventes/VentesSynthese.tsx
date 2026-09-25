"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Download, RefreshCw, Users, ChevronDown, ChevronRight, ReceiptText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { SecondaryButton } from "@/components/ui/Buttons";
import { exporterExcelMisEnForme } from "@/lib/excel";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

const fcfa = (value: number) => `${value.toLocaleString("fr-FR")} FCFA`;

type ClientSynthese = {
  client_id: string;
  client_nom: string;
  nombre_ventes: number;
  total_achats: number;
  total_paye: number;
  total_du: number;
  derniere_vente: string | null;
};

type VentePeriode = {
  id: string;
  client_id: string | null;
  reference: string;
  date_vente: string;
  montant_total: number;
  montant_paye: number;
  statut: string;
  clients: { nom: string }[] | null;
};

type PaiementPeriode = {
  montant: number;
  date_paiement: string;
  vente_id: string;
};

type LigneCommande = {
  id: string;
  quantite: number;
  prix_vente_reel: number;
  remise: number;
  articles: { designation: string }[] | null;
  emplacements: { nom: string }[] | null;
};

function debutMoisCourant() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function finAujourdhui() {
  return new Date().toISOString().slice(0, 10);
}

export function VentesSynthese() {
  const supabase = useMemo(() => createClient(), []);
  const [debut, setDebut] = useState(debutMoisCourant());
  const [fin, setFin] = useState(finAujourdhui());
  const [ventes, setVentes] = useState<VentePeriode[]>([]);
  const [paiements, setPaiements] = useState<PaiementPeriode[]>([]);
  const [clients, setClients] = useState<ClientSynthese[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientOuvertId, setClientOuvertId] = useState<string | null>(null);
  const [venteOuverteId, setVenteOuverteId] = useState<string | null>(null);
  const [lignesCommande, setLignesCommande] = useState<LigneCommande[]>([]);
  const [paiementsCommande, setPaiementsCommande] = useState<PaiementPeriode[]>([]);
  const [loadingCommande, setLoadingCommande] = useState(false);

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
        .select("id, reference, client_id, date_vente, montant_total, montant_paye, statut, clients(nom)")
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
        .select("client_id, client_nom, nombre_ventes, total_achats, total_paye, total_du, derniere_vente")
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
      setClients(
        ((clientsRes.data ?? []) as ClientSynthese[]).filter(
          (client) => typeof client.client_nom === "string" && client.client_nom.trim().length > 0
        )
      );
    }

    setLoading(false);
  }, [debut, fin, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // La synthèse reste synchronisée avec les paiements et les ventes : une
  // validation de paiement met donc immédiatement à jour le client et ses FAC.
  useRealtimeRefresh(["ventes", "paiements_ventes"], load);

  useEffect(() => {
    let actif = true;
    async function chargerCommande() {
      if (!venteOuverteId) {
        setLignesCommande([]);
        setPaiementsCommande([]);
        return;
      }
      setLoadingCommande(true);
      const [lignesRes, paiementsRes] = await Promise.all([
        supabase
          .from("lignes_ventes")
          .select("id, quantite, prix_vente_reel, remise, articles(designation), emplacements(nom)")
          .eq("vente_id", venteOuverteId),
        supabase
          .from("paiements_ventes")
          .select("montant, date_paiement, vente_id")
          .eq("vente_id", venteOuverteId)
          .order("date_paiement", { ascending: false }),
      ]);

      if (!actif) return;
      if (lignesRes.error) {
        setError(logSupabaseError({ table: "lignes_ventes", operation: "select détails commande" }, lignesRes.error, "Impossible de charger les articles de cette commande."));
      } else {
        setLignesCommande((lignesRes.data ?? []) as LigneCommande[]);
      }
      if (paiementsRes.error) {
        setError((prev) => prev ?? logSupabaseError({ table: "paiements_ventes", operation: "select détails commande" }, paiementsRes.error, "Impossible de charger les paiements de cette commande."));
      } else {
        setPaiementsCommande((paiementsRes.data ?? []) as PaiementPeriode[]);
      }
      setLoadingCommande(false);
    }
    chargerCommande();
    return () => { actif = false; };
  }, [venteOuverteId, supabase]);

  const totalVentes = ventes.reduce((s, v) => s + v.montant_total, 0);
  const encaissementsPeriode = paiements.reduce((s, p) => s + Number(p.montant), 0);
  const nombreVentes = ventes.length;

  const classementPeriode = useMemo(() => {
    const map = new Map<string, { nom: string; ventes: number; ca: number; clientId: string }>();
    for (const v of ventes) {
      if (!v.client_id) continue;
      const key = v.client_id;
      const nomClient = v.clients?.[0]?.nom?.trim();
      if (!nomClient) continue;
      const actuel = map.get(key) ?? {
        nom: nomClient,
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

  const clientsActifsPeriode = new Set(
    classementPeriode.map((client) => client.clientId)
  ).size;
  const creancesGlobales = clients.reduce((s, c) => s + Math.max(0, c.total_du), 0);

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
      ["Client", "Nombre de ventes", "Total achats", "Total payé", "Total dû", "Dernière vente"],
      clients.map((c) => ({
        Client: c.client_nom,
        "Nombre de ventes": c.nombre_ventes,
        "Total achats": c.total_achats,
        "Total payé": c.total_paye,
        "Total dû": c.total_du,
        "Dernière vente": c.derniere_vente ?? "",
      }))
    );
  }

  return (
    <section className="mt-5 rounded-2xl border border-onyx-100 bg-white shadow-sm">
      {/* Zone haute fixe : titre + indicateurs + période analysée */}
      <div className="sticky top-0 z-30 rounded-t-2xl border-b border-onyx-100 bg-white/95 p-4 shadow-sm backdrop-blur sm:p-5">
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

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="rounded-xl bg-red-50 p-3">
            <p className="text-xs text-red-600">Créances clients totales</p>
            <p className="mt-1 text-lg font-semibold text-red-700">{fcfa(creancesGlobales)}</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-onyx-100">
          <div className="flex flex-wrap items-center gap-3 px-4 py-2">
            <div className="flex min-w-[165px] items-center gap-2">
              <CalendarDays size={16} className="text-onyx-400" />
              <div>
                <h3 className="text-sm font-semibold text-onyx-800">Période analysée</h3>
                <p className="text-[11px] text-onyx-400">Du {new Date(debut).toLocaleDateString("fr-FR")} au {new Date(fin).toLocaleDateString("fr-FR")}</p>
              </div>
            </div>
            <div className="flex min-w-[145px] flex-1 items-center gap-2">
              <label className="whitespace-nowrap text-xs font-medium text-onyx-600">Du</label>
              <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="w-full rounded-lg border border-onyx-200 px-2.5 py-1.5 text-sm" />
            </div>
            <div className="flex min-w-[145px] flex-1 items-center gap-2">
              <label className="whitespace-nowrap text-xs font-medium text-onyx-600">Au</label>
              <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="w-full rounded-lg border border-onyx-200 px-2.5 py-1.5 text-sm" />
            </div>
            <div className="flex items-center whitespace-nowrap text-xs text-onyx-500">
              <Users size={14} className="mr-1.5" /> {clientsActifsPeriode} client(s) distinct(s)
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
        {/* Colonne gauche : clients déroulants */}
        <div className="rounded-xl border border-onyx-100">
          <div className="border-b border-onyx-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-onyx-800">Situation cumulée par client</h3>
            <p className="text-xs text-onyx-400">Un client = une ligne déroulante. Les montants sont cumulés sur toutes ses commandes.</p>
          </div>
          <div className="max-h-[460px] overflow-y-auto">
            {loading ? <p className="p-6 text-center text-sm text-onyx-400">Chargement...</p> : clients.length === 0 ? <p className="p-6 text-sm text-onyx-400">Aucun client enregistré.</p> : clients.map((c) => {
              const ouvert = clientOuvertId === c.client_id;
              return (
                <div key={c.client_id} className="border-b border-onyx-50 last:border-0">
                  <button type="button" onClick={() => { setClientOuvertId(ouvert ? null : c.client_id); setVenteOuverteId(null); }} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-onyx-50/60">
                    <div className="flex min-w-0 items-center gap-2">
                      {ouvert ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span className="truncate text-sm font-medium text-onyx-800">{c.client_nom}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-onyx-400">{c.nombre_ventes} commande{c.nombre_ventes > 1 ? "s" : ""}</p>
                      <p className="text-sm font-semibold text-onyx-800">{fcfa(c.total_achats)}</p>
                    </div>
                  </button>
                  {ouvert && (
                    <div className="grid grid-cols-2 gap-2 bg-onyx-50/50 px-10 pb-3 pt-1 text-xs sm:grid-cols-4">
                      <div><p className="text-onyx-400">Achats</p><p className="font-semibold text-onyx-700">{fcfa(c.total_achats)}</p></div>
                      <div><p className="text-onyx-400">Payé</p><p className="font-semibold text-emerald-600">{fcfa(c.total_paye)}</p></div>
                      <div><p className="text-onyx-400">Dû</p><p className={`font-semibold ${c.total_du > 0 ? "text-red-600" : "text-onyx-500"}`}>{fcfa(Math.max(0, c.total_du))}</p></div>
                      <div><p className="text-onyx-400">Dernier achat</p><p className="font-semibold text-onyx-700">{c.derniere_vente ? new Date(c.derniere_vente).toLocaleDateString("fr-FR") : "—"}</p></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Colonne droite : FAC du client sélectionné */}
        <div className="rounded-xl border border-onyx-100">
          <div className="border-b border-onyx-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-onyx-800">FAC du client sélectionné</h3>
            <p className="text-xs text-onyx-400">Chaque FAC est déroulante et reprend les mêmes informations financières.</p>
          </div>
          <div className="max-h-[460px] overflow-y-auto">
            {!clientOuvertId ? <p className="p-6 text-sm text-onyx-400">Sélectionnez un client à gauche.</p> : (() => {
              const facs = ventes.filter((v) => v.client_id === clientOuvertId);
              if (!facs.length) return <p className="p-6 text-sm text-onyx-400">Aucune FAC sur la période sélectionnée.</p>;
              return facs.map((v) => {
                const ouvert = venteOuverteId === v.id;
                const total = Number(v.montant_total) || 0;
                const paye = Number(v.montant_paye) || 0;
                const reste = Math.max(0, total - paye);
                return (
                  <div key={v.id} className="border-b border-onyx-50 last:border-0">
                    <button type="button" onClick={() => setVenteOuverteId(ouvert ? null : v.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-onyx-50/60">
                      <div className="flex min-w-0 items-center gap-2">
                        {ouvert ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <ReceiptText size={15} className="shrink-0 text-onyx-400" />
                        <span className="truncate text-sm font-medium text-onyx-800">{v.reference}</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-onyx-400">{new Date(v.date_vente).toLocaleDateString("fr-FR")}</p>
                        <p className={`text-sm font-semibold ${reste > 0 ? "text-red-600" : "text-emerald-600"}`}>{reste > 0 ? `Dû ${fcfa(reste)}` : "Payé"}</p>
                      </div>
                    </button>
                    {ouvert && (
                      <div className="bg-onyx-50/50 px-10 pb-4 pt-2">
                        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <div><p className="text-onyx-400">Total</p><p className="font-semibold text-onyx-700">{fcfa(total)}</p></div>
                          <div><p className="text-onyx-400">Payé</p><p className="font-semibold text-emerald-600">{fcfa(paye)}</p></div>
                          <div><p className="text-onyx-400">Reste</p><p className={`font-semibold ${reste > 0 ? "text-red-600" : "text-onyx-500"}`}>{fcfa(reste)}</p></div>
                          <div><p className="text-onyx-400">Statut</p><p className="font-semibold text-onyx-700">{v.statut}</p></div>
                        </div>

                        <div className="mt-3 rounded-lg border border-onyx-100 bg-white">
                          <div className="border-b border-onyx-100 px-3 py-2">
                            <p className="text-xs font-semibold text-onyx-700">Détails de la commande</p>
                            <p className="text-[11px] text-onyx-400">Articles réellement enregistrés sur cette facture.</p>
                          </div>
                          {loadingCommande ? (
                            <p className="px-3 py-4 text-xs text-onyx-400">Chargement des détails...</p>
                          ) : lignesCommande.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-onyx-400">Aucune ligne d&apos;article enregistrée.</p>
                          ) : (
                            <div className="divide-y divide-onyx-50">
                              {lignesCommande.map((ligne) => {
                                const prix = Number(ligne.prix_vente_reel) || 0;
                                const quantite = Number(ligne.quantite) || 0;
                                const remise = Number(ligne.remise) || 0;
                                const sousTotal = Math.max(0, quantite * prix - remise);
                                return (
                                  <div key={ligne.id} className="px-3 py-2.5 text-xs">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="font-medium text-onyx-800">{ligne.articles?.[0]?.designation || "Article enregistré"}</p>
                                        <p className="mt-0.5 text-[11px] text-onyx-400">
                                          Qté {quantite} × {fcfa(prix)}
                                          {ligne.emplacements?.[0]?.nom ? ` · ${ligne.emplacements[0].nom}` : ""}
                                          {remise > 0 ? ` · remise ${fcfa(remise)}` : ""}
                                        </p>
                                      </div>
                                      <p className="shrink-0 font-semibold text-onyx-800">{fcfa(sousTotal)}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="mt-3 rounded-lg border border-onyx-100 bg-white">
                          <div className="border-b border-onyx-100 px-3 py-2">
                            <p className="text-xs font-semibold text-onyx-700">Paiements enregistrés</p>
                          </div>
                          {paiementsCommande.length === 0 ? (
                            <p className="px-3 py-3 text-xs text-onyx-400">Aucun paiement enregistré sur cette facture.</p>
                          ) : (
                            <div className="divide-y divide-onyx-50">
                              {paiementsCommande.map((paiement, index) => (
                                <div key={`${paiement.date_paiement}-${index}`} className="flex items-center justify-between px-3 py-2 text-xs">
                                  <span className="text-onyx-500">{new Date(paiement.date_paiement).toLocaleDateString("fr-FR")}</span>
                                  <span className="font-semibold text-emerald-600">{fcfa(Number(paiement.montant) || 0)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {error && <p className="px-4 pb-4 text-sm text-red-600 sm:px-5">{error}</p>}
    </section>
  );
}
