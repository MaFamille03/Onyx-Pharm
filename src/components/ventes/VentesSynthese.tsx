"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CalendarDays, RefreshCw, Users, ChevronDown, ChevronRight, ReceiptText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { SecondaryButton } from "@/components/ui/Buttons";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

const fcfa = (value: number) => `${value.toLocaleString("fr-FR")} FCFA`;

type ClientSynthese = {
  client_id: string;
  client_ids: string[];
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
  const [facsClient, setFacsClient] = useState<VentePeriode[]>([]);
  const [loadingFacs, setLoadingFacs] = useState(false);
  const [paiements, setPaiements] = useState<PaiementPeriode[]>([]);
  const [clients, setClients] = useState<ClientSynthese[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientSelectionneNom, setClientSelectionneNom] = useState<string | null>(null);
  const [clientOuvertNom, setClientOuvertNom] = useState<string | null>(null);
  const facSectionRef = useRef<HTMLDivElement | null>(null);
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
        .select("montant, date_paiement, vente_id"),
      supabase
        .from("v_synthese_clients_ventes")
        .select("client_id, client_nom, nombre_ventes, total_achats, total_paye, total_du, derniere_vente")
        .order("total_du", { ascending: false }),
    ]);

    if (ventesRes.error) {
      setError(logSupabaseError({ table: "ventes", operation: "select synthèse" }, ventesRes.error, "Impossible de charger le résumé des ventes."));
    } else {
      const ventesBrutes = (ventesRes.data ?? []) as VentePeriode[];
      const paiementsBruts = (paiementsRes.data ?? []) as PaiementPeriode[];
      const paiementsParVente = new Map<string, number>();
      for (const paiement of paiementsBruts) {
        paiementsParVente.set(paiement.vente_id, (paiementsParVente.get(paiement.vente_id) ?? 0) + Number(paiement.montant || 0));
      }
      setVentes(ventesBrutes.map((vente) => {
        const total = Number(vente.montant_total || 0);
        const paye = paiementsParVente.get(vente.id) ?? 0;
        const reste = Math.max(0, total - paye);
        return {
          ...vente,
          montant_paye: paye,
          statut: reste === 0 ? "Soldée" : paye > 0 ? "Avance" : "Non payée",
        };
      }));
    }

    if (paiementsRes.error) {
      setError((prev) => prev ?? logSupabaseError({ table: "paiements_ventes", operation: "select synthèse" }, paiementsRes.error, "Impossible de charger les encaissements."));
    } else {
      setPaiements((paiementsRes.data ?? []) as PaiementPeriode[]);
    }

    if (clientsRes.error) {
      setError((prev) => prev ?? logSupabaseError({ table: "v_synthese_clients_ventes", operation: "select" }, clientsRes.error, "Impossible de charger la situation des clients."));
    } else {
      // Regroupe les fiches portant le même nom : la situation cumulée est
      // affichée par nom de client, indépendamment des commandes/fiches liées.
      const groupes = new Map<string, ClientSynthese>();
      for (const client of (clientsRes.data ?? []) as ClientSynthese[]) {
        if (typeof client.client_nom !== "string" || !client.client_nom.trim()) continue;
        const nom = client.client_nom.trim();
        const cle = nom.toLocaleLowerCase("fr-FR");
        const existant = groupes.get(cle);
        if (!existant) {
          groupes.set(cle, { ...client, client_nom: nom, client_ids: client.client_id ? [client.client_id] : [] });
        } else {
          if (client.client_id && !existant.client_ids.includes(client.client_id)) existant.client_ids.push(client.client_id);
          existant.nombre_ventes += Number(client.nombre_ventes || 0);
          existant.total_achats += Number(client.total_achats || 0);
          existant.total_paye += Number(client.total_paye || 0);
          existant.total_du += Number(client.total_du || 0);
          if (client.derniere_vente && (!existant.derniere_vente || client.derniere_vente > existant.derniere_vente)) {
            existant.derniere_vente = client.derniere_vente;
          }
        }
      }
      setClients(Array.from(groupes.values()).sort((a, b) => b.total_du - a.total_du));
    }

    setLoading(false);
  }, [debut, fin, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const chargerFacsClient = useCallback(async (client: ClientSynthese) => {
    setLoadingFacs(true);
    setVenteOuverteId(null);
    setFacsClient([]);
    if (!client.client_ids.length) {
      setLoadingFacs(false);
      return;
    }

    const { data, error: facsError } = await supabase
      .from("ventes")
      .select("id, reference, client_id, date_vente, montant_total, montant_paye, statut, clients(nom)")
      .in("client_id", client.client_ids)
      .not("statut", "in", "(Annulé,Brouillon)")
      .order("date_vente", { ascending: false });

    if (facsError) {
      setError(logSupabaseError({ table: "ventes", operation: "select FAC client" }, facsError, "Impossible de charger les factures de ce client."));
      setLoadingFacs(false);
      return;
    }

    const factures = (data ?? []) as VentePeriode[];
    const ids = factures.map((v) => v.id);
    let paiementsClient: PaiementPeriode[] = [];
    if (ids.length) {
      const { data: paiementsData } = await supabase
        .from("paiements_ventes")
        .select("montant, date_paiement, vente_id")
        .in("vente_id", ids);
      paiementsClient = (paiementsData ?? []) as PaiementPeriode[];
    }
    const payes = new Map<string, number>();
    for (const paiement of paiementsClient) {
      payes.set(paiement.vente_id, (payes.get(paiement.vente_id) ?? 0) + Number(paiement.montant || 0));
    }
    setFacsClient(factures.map((vente) => {
      const total = Number(vente.montant_total || 0);
      const paye = payes.get(vente.id) ?? 0;
      const reste = Math.max(0, total - paye);
      return { ...vente, montant_paye: paye, statut: reste === 0 ? "Soldée" : paye > 0 ? "Avance" : "Non payée" };
    }));
    setLoadingFacs(false);
  }, [supabase]);

  // La synthèse reste synchronisée avec les paiements et les ventes : une
  // validation de paiement met donc immédiatement à jour le client et ses factures.
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
  const encaissementsPeriode = paiements
    .filter((p) => p.date_paiement >= debut && p.date_paiement <= fin)
    .reduce((s, p) => s + Number(p.montant || 0), 0);
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

  return (
    <section className="mt-5 flex h-[calc(100vh-7rem)] min-h-0 flex-col overflow-hidden rounded-2xl border border-onyx-100 bg-white shadow-sm">
      {/* Zone haute fixe : titre + indicateurs + période analysée */}
      <div className="shrink-0 rounded-t-2xl border-b border-onyx-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-onyx-500" />
              <h2 className="text-base font-semibold text-onyx-900">Résumé commercial des ventes</h2>
            </div>
            <p className="mt-1 text-xs text-onyx-500">
              Le chiffre d&apos;affaires est basé sur les ventes. Les encaissements correspondent uniquement aux paiements réellement enregistrés.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[auto_1fr] lg:items-center">
            <div className="flex flex-wrap gap-2">
              {([['mois', 'Ce mois'], ['trimestre', 'Ce trimestre'], ['annee', 'Cette année'], ['tout', 'Tout']] as const).map(([id, label]) => (
                <SecondaryButton key={id} onClick={() => appliquerPeriode(id)} className="min-h-0 flex-1 justify-center px-3 py-2 text-xs sm:flex-none">
                  {label}
                </SecondaryButton>
              ))}
              <SecondaryButton onClick={load} className="min-h-0 flex-1 justify-center px-3 py-2 text-xs sm:flex-none" disabled={loading}>
                <RefreshCw size={14} /> Actualiser
              </SecondaryButton>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-onyx-100 px-2.5 py-1.5">
                <CalendarDays size={15} className="shrink-0 text-onyx-400" />
                <label className="shrink-0 text-xs font-medium text-onyx-600">Du</label>
                <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="min-w-0 w-full border-0 bg-transparent p-0 text-sm outline-none" />
              </div>
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-onyx-100 px-2.5 py-1.5">
                <CalendarDays size={15} className="shrink-0 text-onyx-400" />
                <label className="shrink-0 text-xs font-medium text-onyx-600">Au</label>
                <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="min-w-0 w-full border-0 bg-transparent p-0 text-sm outline-none" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-onyx-100 px-3 py-2.5">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-onyx-800">Période analysée</h3>
              <p className="text-[11px] text-onyx-400">Du {new Date(debut).toLocaleDateString("fr-FR")} au {new Date(fin).toLocaleDateString("fr-FR")}</p>
            </div>
            <div className="flex items-center text-xs text-onyx-500">
              <Users size={14} className="mr-1.5" /> {clientsActifsPeriode} client(s) distinct(s)
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-onyx-50 p-3"><p className="text-xs text-onyx-500">Nombre de ventes</p><p className="mt-1 text-lg font-semibold text-onyx-900">{nombreVentes}</p></div>
            <div className="rounded-xl bg-onyx-50 p-3"><p className="text-xs text-onyx-500">Chiffre d&apos;affaires</p><p className="mt-1 text-lg font-semibold text-onyx-900">{fcfa(totalVentes)}</p></div>
            <div className="rounded-xl bg-onyx-50 p-3"><p className="text-xs text-onyx-500">Encaissements période</p><p className="mt-1 text-lg font-semibold text-emerald-600">{fcfa(encaissementsPeriode)}</p></div>
            <div className="rounded-xl bg-red-50 p-3"><p className="text-xs text-red-600">Créances clients totales</p><p className="mt-1 text-lg font-semibold text-red-700">{fcfa(creancesGlobales)}</p></div>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-3 sm:p-5 lg:grid-cols-[minmax(320px,1fr)_minmax(0,1.7fr)]">
        <div className="min-w-0 rounded-xl border border-onyx-100 overflow-hidden flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-onyx-100 bg-white px-4 py-3 shadow-sm">
            <h3 className="text-sm font-semibold text-onyx-800">Situation cumulée par client</h3>
            <p className="text-xs text-onyx-400">Cliquez sur un client pour ouvrir sa situation et afficher ses factures.</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-onyx-50 overscroll-contain">
            {loading ? <p className="p-6 text-center text-sm text-onyx-400">Chargement...</p> : clients.length === 0 ? <p className="p-6 text-sm text-onyx-400">Aucun client enregistré.</p> : clients.map((c) => {
              const cle = c.client_nom.toLocaleLowerCase("fr-FR");
              const ouvert = clientOuvertNom === cle;
              const selectionne = clientSelectionneNom?.toLocaleLowerCase("fr-FR") === cle;
              return (
                <div key={cle} className={selectionne ? "bg-onyx-50/70" : "bg-white"}>
                  <button type="button" onClick={() => {
                    setClientOuvertNom(ouvert ? null : cle);
                    setClientSelectionneNom(c.client_nom);
                    chargerFacsClient(c);
                    window.setTimeout(() => facSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                  }} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-onyx-50/60">
                    <div className="flex min-w-0 items-center gap-2">
                      {ouvert ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-onyx-800">{c.client_nom}</p>
                        <p className="mt-0.5 text-xs text-onyx-400">{c.nombre_ventes} commande{c.nombre_ventes > 1 ? "s" : ""} · dernier achat {c.derniere_vente ? new Date(c.derniere_vente).toLocaleDateString("fr-FR") : "—"}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-onyx-400">Dû</p>
                      <p className={`text-sm font-bold ${c.total_du > 0 ? "text-red-600" : "text-emerald-600"}`}>{fcfa(Math.max(0, c.total_du))}</p>
                    </div>
                  </button>
                  {ouvert && (
                    <div className="grid grid-cols-2 gap-3 bg-onyx-50/60 px-4 pb-4 pt-1 text-xs sm:grid-cols-4 sm:px-10">
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

        <div ref={facSectionRef} className="min-w-0 min-h-0 rounded-xl border border-onyx-100 overflow-hidden flex flex-col">
          <div className="shrink-0 border-b border-onyx-100 bg-white px-4 py-3 shadow-sm">
            <h3 className="text-sm font-semibold text-onyx-800">FACTURE du client sélectionné</h3>
            <p className="text-xs text-onyx-400">Les factures de toutes les commandes liées au même nom de client sont regroupées ici.</p>
          </div>
          <div className="min-h-0">
            {!clientSelectionneNom ? <p className="p-6 text-sm text-onyx-400">Sélectionnez un client dans la liste pour afficher ses factures.</p> : loadingFacs ? <p className="p-6 text-sm text-onyx-400">Chargement des factures du client...</p> : !facsClient.length ? <p className="p-6 text-sm text-onyx-400">Aucune facture enregistrée pour ce client.</p> : (() => {
              const facs = facsClient;
              return facs.map((v) => {
                const ouvert = venteOuverteId === v.id;
                const total = Number(v.montant_total) || 0;
                const paye = Number(v.montant_paye) || 0;
                const reste = Math.max(0, total - paye);
                return (
                  <div key={v.id} className="border-b border-onyx-50 last:border-0">
                    <button type="button" onClick={() => setVenteOuverteId(ouvert ? null : v.id)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-onyx-50/60">
                      <div className="flex min-w-0 items-start gap-2">
                        {ouvert ? <ChevronDown size={16} className="mt-0.5 shrink-0" /> : <ChevronRight size={16} className="mt-0.5 shrink-0" />}
                        <ReceiptText size={15} className="mt-0.5 shrink-0 text-onyx-400" />
                        <div className="min-w-0"><p className="break-all text-sm font-medium text-onyx-800">{v.reference}</p><p className="mt-0.5 text-xs text-onyx-400">{new Date(v.date_vente).toLocaleDateString("fr-FR")}</p></div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-semibold ${reste > 0 ? "text-red-600" : "text-emerald-600"}`}>{reste === 0 ? "Soldée" : paye > 0 ? "Avance" : "Non payée"}</p>
                        <p className="mt-0.5 text-xs text-onyx-400">Reste {fcfa(reste)}</p>
                      </div>
                    </button>
                    {ouvert && (
                      <div className="bg-onyx-50/50 px-4 pb-4 pt-2 sm:px-10">
                        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <div><p className="text-onyx-400">Total</p><p className="font-semibold text-onyx-700">{fcfa(total)}</p></div>
                          <div><p className="text-onyx-400">Payé</p><p className="font-semibold text-emerald-600">{fcfa(paye)}</p></div>
                          <div><p className="text-onyx-400">Reste</p><p className={`font-semibold ${reste > 0 ? "text-red-600" : "text-onyx-500"}`}>{fcfa(reste)}</p></div>
                          <div><p className="text-onyx-400">Statut</p><p className="font-semibold text-onyx-700">{v.statut}</p></div>
                        </div>
                        <div className="mt-3 rounded-lg border border-onyx-100 bg-white">
                          <div className="border-b border-onyx-100 px-3 py-2"><p className="text-xs font-semibold text-onyx-700">Détails de la commande</p><p className="text-[11px] text-onyx-400">Articles réellement enregistrés sur cette facture.</p></div>
                          {loadingCommande ? <p className="px-3 py-4 text-xs text-onyx-400">Chargement des détails...</p> : lignesCommande.length === 0 ? <p className="px-3 py-4 text-xs text-onyx-400">Aucune ligne d&apos;article enregistrée.</p> : (
                            <div className="divide-y divide-onyx-50">
                              {lignesCommande.map((ligne) => {
                                const prix = Number(ligne.prix_vente_reel) || 0; const quantite = Number(ligne.quantite) || 0; const remise = Number(ligne.remise) || 0; const sousTotal = Math.max(0, quantite * prix - remise);
                                return <div key={ligne.id} className="px-3 py-2.5 text-xs"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium text-onyx-800">{ligne.articles?.[0]?.designation || "Article enregistré"}</p><p className="mt-0.5 break-words text-[11px] text-onyx-400">Qté {quantite} × {fcfa(prix)}{ligne.emplacements?.[0]?.nom ? ` · ${ligne.emplacements[0].nom}` : ""}{remise > 0 ? ` · remise ${fcfa(remise)}` : ""}</p></div><p className="shrink-0 font-semibold text-onyx-800">{fcfa(sousTotal)}</p></div></div>;
                              })}
                            </div>
                          )}
                        </div>
                        <div className="mt-3 rounded-lg border border-onyx-100 bg-white"><div className="border-b border-onyx-100 px-3 py-2"><p className="text-xs font-semibold text-onyx-700">Paiements enregistrés</p></div>{paiementsCommande.length === 0 ? <p className="px-3 py-3 text-xs text-onyx-400">Aucun paiement enregistré sur cette facture.</p> : <div className="divide-y divide-onyx-50">{paiementsCommande.map((paiement, index) => <div key={`${paiement.date_paiement}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><span className="text-onyx-500">{new Date(paiement.date_paiement).toLocaleDateString("fr-FR")}</span><span className="shrink-0 font-semibold text-emerald-600">{fcfa(Number(paiement.montant) || 0)}</span></div>)}</div>}</div>
                        <div className="mt-3 flex justify-end">
                          <SecondaryButton onClick={() => { window.location.href = `/ventes/ventes?ouvrir=${encodeURIComponent(v.id)}`; }} className="w-full justify-center text-xs sm:w-auto">Ouvrir la vente complète</SecondaryButton>
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
