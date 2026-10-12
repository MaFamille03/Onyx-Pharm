"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Pencil,
  Plus,
  Minus,
  Download,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { exporterExcelMisEnForme } from "@/lib/excel";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

type Periode = "tout" | "aujourdhui" | "semaine" | "mois" | "mois_choisi";

type LigneCaisse = {
  id: string;
  reference: string;
  date_operation: string;
  description: string | null;
  categorie: string | null;
  recette: number;
  depense: number;
};

function formatDateLocale(date: Date): string {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function debutPeriode(periode: Periode): string | null {
  const now = new Date();
  if (periode === "aujourdhui") {
    const debut = new Date(now);
    debut.setHours(0, 0, 0, 0);
    return formatDateLocale(debut);
  }
  if (periode === "semaine") {
    const jour = now.getDay() || 7;
    const lundi = new Date(now);
    lundi.setHours(0, 0, 0, 0);
    lundi.setDate(now.getDate() - jour + 1);
    return formatDateLocale(lundi);
  }
  if (periode === "mois") {
    return formatDateLocale(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  return null;
}

const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function SoldeManager() {
  const supabase = createClient();
  const [soldeInitial, setSoldeInitial] = useState(0);
  const [lignes, setLignes] = useState<LigneCaisse[]>([]);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState<Periode>("tout");
  const [moisChoisi, setMoisChoisi] = useState<number | null>(new Date().getMonth());
  const [anneeChoisie, setAnneeChoisie] = useState<number | null>(new Date().getFullYear());
  const [soldeDebutCalcule, setSoldeDebutCalcule] = useState(0);

  const [modalSoldeOpen, setModalSoldeOpen] = useState(false);
  const [nouveauSolde, setNouveauSolde] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOperation, setModalOperation] = useState<
    "recette" | "depense" | null
  >(null);
  const [opMontant, setOpMontant] = useState("");
  const [opDescription, setOpDescription] = useState("");
  const [opMode, setOpMode] = useState("Espèces");
  const [opSaving, setOpSaving] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const debutPeriodeSelectionnee =
      periode === "mois_choisi" && anneeChoisie !== null && moisChoisi !== null
        ? formatDateLocale(new Date(anneeChoisie, moisChoisi, 1))
        : debutPeriode(periode);

    let encQuery = supabase
      .from("encaissements")
      .select("id, reference, date_operation, montant, description, categorie");
    let decQuery = supabase
      .from("decaissements")
      .select("id, reference, date_operation, montant, description, categorie");

    if (periode === "mois_choisi") {
      // Mois et année sont indépendants :
      // - mois + année => mois précis
      // - année seule => toute l'année
      // - mois seul => tous les mois correspondants, quelle que soit l'année
      if (anneeChoisie !== null && moisChoisi !== null) {
        const debutMois = formatDateLocale(new Date(anneeChoisie, moisChoisi, 1));
        const finMois = formatDateLocale(new Date(anneeChoisie, moisChoisi + 1, 1));
        encQuery = encQuery.gte("date_operation", debutMois).lt("date_operation", finMois);
        decQuery = decQuery.gte("date_operation", debutMois).lt("date_operation", finMois);
      } else if (anneeChoisie !== null) {
        const debutAnnee = formatDateLocale(new Date(anneeChoisie, 0, 1));
        const finAnnee = formatDateLocale(new Date(anneeChoisie + 1, 0, 1));
        encQuery = encQuery.gte("date_operation", debutAnnee).lt("date_operation", finAnnee);
        decQuery = decQuery.gte("date_operation", debutAnnee).lt("date_operation", finAnnee);
      }
      // Pour un mois seul, aucune contrainte SQL sur la date : le filtre
      // du mois est appliqué après récupération des opérations.
    } else if (debutPeriodeSelectionnee) {
      encQuery = encQuery.gte("date_operation", debutPeriodeSelectionnee);
      decQuery = decQuery.gte("date_operation", debutPeriodeSelectionnee);
    }

    const [encRes, decRes, paramRes] = await Promise.all([
      encQuery,
      decQuery,
      supabase
        .from("parametres_generaux")
        .select("valeur")
        .eq("cle", "solde_caisse_initial")
        .maybeSingle(),
    ]);

    const soldeInitialCourant = Number(paramRes.data?.valeur) || 0;
    setSoldeInitial(soldeInitialCourant);

    const enc = (encRes.data ?? []).map((e) => ({
      id: e.id,
      reference: e.reference,
      date_operation: e.date_operation,
      description: e.description,
      categorie: e.categorie,
      recette: Number(e.montant) || 0,
      depense: 0,
    }));
    const dec = (decRes.data ?? []).map((d) => ({
      id: d.id,
      reference: d.reference,
      date_operation: d.date_operation,
      description: d.description,
      categorie: d.categorie,
      recette: 0,
      depense: Number(d.montant) || 0,
    }));

    const operations = [...enc, ...dec];
    const operationsFiltrees =
      periode === "mois_choisi" && moisChoisi !== null && anneeChoisie === null
        ? operations.filter((operation) => new Date(operation.date_operation).getMonth() === moisChoisi)
        : operations;

    setLignes(
      operationsFiltrees.sort((a, b) =>
        a.date_operation < b.date_operation
          ? -1
          : a.date_operation > b.date_operation
            ? 1
            : a.reference.localeCompare(b.reference)
      )
    );

    // Pour une période continue, on reconstitue le solde au début de la période
    // à partir du solde initial et de toutes les opérations antérieures.
    // Pour "mois seul", plusieurs années sont regroupées : il n'existe donc
    // pas de solde de début unique.
    if (periode === "tout" || periode === "mois_choisi" && anneeChoisie === null) {
      setSoldeDebutCalcule(periode === "tout" ? soldeInitialCourant : 0);
    } else if (debutPeriodeSelectionnee) {
      const [encAvantRes, decAvantRes] = await Promise.all([
        supabase.from("encaissements").select("montant").lt("date_operation", debutPeriodeSelectionnee),
        supabase.from("decaissements").select("montant").lt("date_operation", debutPeriodeSelectionnee),
      ]);

      if (!encAvantRes.error && !decAvantRes.error) {
        const encAvant = (encAvantRes.data ?? []).reduce(
          (total, row) => total + (Number(row.montant) || 0),
          0
        );
        const decAvant = (decAvantRes.data ?? []).reduce(
          (total, row) => total + (Number(row.montant) || 0),
          0
        );
        setSoldeDebutCalcule(soldeInitialCourant + encAvant - decAvant);
      } else {
        // En cas d'échec de la lecture historique, on conserve une base sûre.
        setSoldeDebutCalcule(soldeInitialCourant);
      }
    }

    setLoading(false);
  }, [periode, moisChoisi, anneeChoisie]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(["encaissements", "decaissements"], load);

  async function handleModifierSolde(e: React.FormEvent) {
    e.preventDefault();
    const val = Number(nouveauSolde);
    if (Number.isNaN(val)) {
      setError("Valeur invalide.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("parametres_generaux")
      .upsert(
        { cle: "solde_caisse_initial", valeur: String(val) },
        { onConflict: "cle" }
      );
    setSaving(false);
    if (error) {
      setError(
        logSupabaseError(
          { table: "parametres_generaux", operation: "update" },
          error,
          "Impossible de mettre à jour le solde initial. Réessayez."
        )
      );
      return;
    }
    setModalSoldeOpen(false);
    load();
  }

  function ouvrirOperation(type: "recette" | "depense") {
    setModalOperation(type);
    setOpMontant("");
    setOpDescription("");
    setOpMode("Espèces");
    setOpError(null);
  }

  async function handleSubmitOperation(e: React.FormEvent) {
    e.preventDefault();
    const val = Number(opMontant);
    if (!val || val <= 0) {
      setOpError("Montant invalide.");
      return;
    }
    setOpSaving(true);
    setOpError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const table = modalOperation === "recette" ? "encaissements" : "decaissements";
    const prefixe = modalOperation === "recette" ? "ENC" : "DEC";

    const { data: refData, error: refError } = await supabase.rpc(
      "generer_numero_document",
      { p_prefixe: prefixe }
    );
    if (refError || !refData) {
      setOpError(
        logSupabaseError(
          { table: "numero_sequences", operation: "rpc generer_numero_document" },
          refError,
          "Impossible de générer la référence. Réessayez."
        )
      );
      setOpSaving(false);
      return;
    }

    const { error } = await supabase.from(table).insert({
      reference: refData,
      montant: val,
      mode_paiement: opMode,
      categorie: "Autre",
      description: opDescription.trim() || null,
      created_by: user?.id ?? null,
    });

    setOpSaving(false);
    if (error) {
      setOpError(
        logSupabaseError(
          { table, operation: "insert" },
          error,
          "Impossible d'enregistrer cette opération. Réessayez."
        )
      );
      return;
    }
    setModalOperation(null);
    load();
  }

  async function exporter() {
    const totalEncaissements = lignes.reduce((s, l) => s + l.recette, 0);
    const totalDecaissements = lignes.reduce((s, l) => s + l.depense, 0);
    const variationPeriode = totalEncaissements - totalDecaissements;
    const periodeContinue =
      periode === "tout" ||
      periode === "aujourdhui" ||
      periode === "semaine" ||
      periode === "mois" ||
      (periode === "mois_choisi" && anneeChoisie !== null);
    const colonneSolde = periodeContinue ? "Solde cumulatif" : "Variation cumulée";
    let cumul = periodeContinue ? soldeDebutCalcule : 0;
    const rows: Record<string, unknown>[] = [];

    if (periode === "tout") {
      rows.push({
        Numéro: "",
        Date: "",
        Désignation: "Solde initial",
        Recette: "",
        Dépense: "",
        [colonneSolde]: soldeInitial,
      });
    } else if (periodeContinue) {
      rows.push({
        Numéro: "",
        Date: "",
        Désignation: "Solde début de période",
        Recette: "",
        Dépense: "",
        [colonneSolde]: soldeDebutCalcule,
      });
    }

    rows.push(
      ...lignes.map((l, i) => {
        cumul += l.recette - l.depense;
        return {
          Numéro: i + 1,
          Date: new Date(l.date_operation).toLocaleDateString("fr-FR"),
          Désignation: l.description || l.reference,
          Recette: l.recette || "",
          Dépense: l.depense || "",
          [colonneSolde]: cumul,
        };
      })
    );

    rows.push({
      Numéro: "" as unknown as number,
      Date: "",
      Désignation: "TOTAL",
      Recette: totalEncaissements,
      Dépense: totalDecaissements,
      [colonneSolde]: periodeContinue ? soldeDebutCalcule + variationPeriode : variationPeriode,
    });

    await exporterExcelMisEnForme(
      "Livre_De_Caisse_Onyx_Pharm",
      "Livre de caisse",
      ["Numéro", "Date", "Désignation", "Recette", "Dépense", colonneSolde],
      rows
    );
  }

  const totalEncaissements = lignes.reduce((s, l) => s + l.recette, 0);
  const totalDecaissements = lignes.reduce((s, l) => s + l.depense, 0);
  const variationPeriode = totalEncaissements - totalDecaissements;
  const periodeContinue =
    periode === "tout" ||
    periode === "aujourdhui" ||
    periode === "semaine" ||
    periode === "mois" ||
    (periode === "mois_choisi" && anneeChoisie !== null);
  const soldeFin = soldeDebutCalcule + variationPeriode;
  const afficheSoldeReel = periodeContinue;

  let cumulAffiche = afficheSoldeReel ? soldeDebutCalcule : 0;
  let cumulAfficheMobile = afficheSoldeReel ? soldeDebutCalcule : 0;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
            Solde de caisse
          </h1>
          <p className="mt-1 text-sm text-onyx-500">
            Solde initial + encaissements − décaissements.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => ouvrirOperation("recette")} className="shrink-0">
            <Plus size={15} />
            Recette
          </SecondaryButton>
          <SecondaryButton onClick={() => ouvrirOperation("depense")} className="shrink-0">
            <Minus size={15} />
            Dépense
          </SecondaryButton>
          <SecondaryButton onClick={exporter} className="shrink-0" disabled={lignes.length === 0}>
            <Download size={15} />
            Exporter
          </SecondaryButton>
          {periode === "tout" && (
            <SecondaryButton
              onClick={() => {
                setNouveauSolde(String(soldeInitial));
                setError(null);
                setModalSoldeOpen(true);
              }}
              className="shrink-0"
            >
              <Pencil size={15} />
              Solde initial
            </SecondaryButton>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-1.5 rounded-lg bg-onyx-50 p-1 sm:flex sm:overflow-x-auto">
        {(
          [
            { id: "tout", label: "Depuis le début" },
            { id: "aujourdhui", label: "Aujourd'hui" },
            { id: "semaine", label: "Cette semaine" },
            { id: "mois", label: "Ce mois" },
            { id: "mois_choisi", label: "Mois précis" },
          ] as { id: Periode; label: string }[]
        ).map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriode(p.id)}
            className={`min-w-0 rounded-md px-2 py-2 text-center text-xs font-medium transition-colors sm:shrink-0 sm:px-3.5 sm:text-sm ${
              periode === p.id
                ? "bg-white text-onyx-900 shadow-sm"
                : "text-onyx-500 hover:text-onyx-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {periode === "mois_choisi" && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
          <select
            value={moisChoisi ?? ""}
            onChange={(e) => setMoisChoisi(e.target.value === "" ? null : Number(e.target.value))}
            className="rounded-lg border border-onyx-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          >
            <option value="">Tous les mois</option>
            {NOMS_MOIS.map((nom, i) => (
              <option key={i} value={i}>
                {nom}
              </option>
            ))}
          </select>
          <select
            value={anneeChoisie ?? ""}
            onChange={(e) => setAnneeChoisie(e.target.value === "" ? null : Number(e.target.value))}
            className="rounded-lg border border-onyx-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          >
            <option value="">Toutes les années</option>
            {Array.from({ length: 8 }).map((_, i) => {
              const annee = new Date().getFullYear() - 5 + i;
              return (
                <option key={annee} value={annee}>
                  {annee}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-onyx-400">
          Chargement...
        </p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <div className="rounded-xl border border-onyx-100 bg-white p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <TrendingUp size={18} />
              </div>
              <p className="mt-3 text-xl font-semibold text-emerald-600">
                {totalEncaissements.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-400">Encaissements (FCFA)</p>
            </div>

            <div className="rounded-xl border border-onyx-100 bg-white p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-500">
                <TrendingDown size={18} />
              </div>
              <p className="mt-3 text-xl font-semibold text-red-500">
                {totalDecaissements.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-400">Décaissements (FCFA)</p>
            </div>

            <div className="rounded-xl border border-onyx-900 bg-onyx-900 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-accent-400">
                <Wallet size={18} />
              </div>
              <p className="mt-3 text-xl font-semibold text-white">
                {(afficheSoldeReel ? soldeFin : variationPeriode).toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-300">
                {afficheSoldeReel ? "Solde fin de période" : "Variation cumulée"} (FCFA)
              </p>
            </div>
          </div>

          {afficheSoldeReel && (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-onyx-100 bg-white p-4">
                <p className="text-xs text-onyx-400">Solde début de période</p>
                <p className="mt-1 text-lg font-semibold text-onyx-800">
                  {soldeDebutCalcule.toLocaleString("fr-FR")} FCFA
                </p>
              </div>
              <div className="rounded-xl border border-onyx-100 bg-white p-4">
                <p className="text-xs text-onyx-400">Variation de la période</p>
                <p className={`mt-1 text-lg font-semibold ${variationPeriode >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {variationPeriode.toLocaleString("fr-FR")} FCFA
                </p>
              </div>
            </div>
          )}

          <div className="mt-5 hidden overflow-hidden rounded-xl border border-onyx-100 bg-white md:block">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                  <th className="px-4 py-3">N°</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Désignation</th>
                  <th className="px-4 py-3 text-right">Recette</th>
                  <th className="px-4 py-3 text-right">Dépense</th>
                  <th className="px-4 py-3 text-right">{afficheSoldeReel ? "Solde cumulatif" : "Variation cumulée"}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 && periode !== "tout" ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-onyx-400">
                      Aucune opération sur la période.
                    </td>
                  </tr>
                ) : (
                  <>
                    {periode === "tout" && (
                      <tr className="border-b border-onyx-100 bg-onyx-50/50">
                        <td className="px-4 py-2.5 text-onyx-400">—</td>
                        <td className="px-4 py-2.5 text-onyx-500">—</td>
                        <td className="px-4 py-2.5 font-medium text-onyx-800">
                          Solde initial
                        </td>
                        <td className="px-4 py-2.5 text-right text-onyx-400">—</td>
                        <td className="px-4 py-2.5 text-right text-onyx-400">—</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-onyx-900">
                          {soldeInitial.toLocaleString("fr-FR")}
                        </td>
                      </tr>
                    )}
                    {lignes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-onyx-400">
                          Aucune opération enregistrée depuis le solde initial.
                        </td>
                      </tr>
                    ) : (
                      lignes.map((l, i) => {
                        cumulAffiche += l.recette - l.depense;
                        return (
                          <tr key={l.id} className="border-b border-onyx-50 last:border-0">
                            <td className="px-4 py-2.5 text-onyx-400">{i + 1}</td>
                            <td className="px-4 py-2.5 text-onyx-500">
                              {new Date(l.date_operation).toLocaleDateString("fr-FR")}
                            </td>
                            <td className="px-4 py-2.5 text-onyx-700">
                              {l.description || l.reference}
                            </td>
                            <td className="px-4 py-2.5 text-right text-emerald-600">
                              {l.recette ? l.recette.toLocaleString("fr-FR") : ""}
                            </td>
                            <td className="px-4 py-2.5 text-right text-red-500">
                              {l.depense ? l.depense.toLocaleString("fr-FR") : ""}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium text-onyx-800">
                              {cumulAffiche.toLocaleString("fr-FR")}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </>
                )}
              </tbody>
            </table>
            </div>
          </div>

          <div className="mt-5 space-y-2 md:hidden">
            {periode === "tout" && (
              <div className="rounded-xl border border-onyx-200 bg-onyx-50/60 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-xs text-onyx-400">Solde initial</p><p className="mt-1 text-sm font-semibold text-onyx-800">Avant les opérations</p></div>
                  <p className="text-sm font-semibold text-onyx-900">{soldeInitial.toLocaleString("fr-FR")} F</p>
                </div>
              </div>
            )}
            {lignes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-onyx-200 bg-white p-6 text-center text-sm text-onyx-400">
                {periode === "tout" ? "Aucune opération enregistrée depuis le solde initial." : "Aucune opération sur la période."}
              </div>
            ) : lignes.map((l, i) => {
              cumulAfficheMobile += l.recette - l.depense;
              return (
                <div key={l.id} className="rounded-xl border border-onyx-100 bg-white p-3.5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-onyx-800">{l.description || l.reference}</p>
                      <p className="mt-0.5 text-xs text-onyx-400">{new Date(l.date_operation).toLocaleDateString("fr-FR")} · #{i + 1}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-onyx-900">{cumulAfficheMobile.toLocaleString("fr-FR")} F</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-onyx-100 pt-2.5 text-xs">
                    <div><p className="text-onyx-400">Recette</p><p className="mt-0.5 font-semibold text-emerald-600">{l.recette ? `${l.recette.toLocaleString("fr-FR")} F` : "—"}</p></div>
                    <div><p className="text-onyx-400">Dépense</p><p className="mt-0.5 font-semibold text-red-500">{l.depense ? `${l.depense.toLocaleString("fr-FR")} F` : "—"}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {modalSoldeOpen && (
        <Modal title="Modifier le solde initial" onClose={() => setModalSoldeOpen(false)}>
          <form onSubmit={handleModifierSolde} className="space-y-4">
            {error && <InlineBanner message={error} />}
            <p className="text-sm text-onyx-500">
              Ce montant représente la trésorerie disponible avant le début
              de l&apos;utilisation de l&apos;application.
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Solde initial (FCFA)
              </label>
              <input
                type="number"
                step="1"
                required
                value={nouveauSolde}
                onChange={(e) => setNouveauSolde(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <SecondaryButton
                type="button"
                onClick={() => setModalSoldeOpen(false)}
                className="flex-1"
              >
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" loading={saving} className="flex-1">
                Enregistrer
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {modalOperation && (
        <Modal
          title={modalOperation === "recette" ? "Ajouter une recette" : "Ajouter une dépense"}
          onClose={() => setModalOperation(null)}
        >
          <form onSubmit={handleSubmitOperation} className="space-y-4">
            {opError && <InlineBanner message={opError} />}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Montant (FCFA)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={opMontant}
                onChange={(e) => setOpMontant(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Désignation
              </label>
              <input
                value={opDescription}
                onChange={(e) => setOpDescription(e.target.value)}
                placeholder={
                  modalOperation === "recette"
                    ? "Ex : apport de fonds"
                    : "Ex : loyer, salaire, fourniture..."
                }
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <SelectField
              id="mode-paiement-operation-caisse"
              label="Mode de paiement"
              value={opMode}
              onChange={(e) => setOpMode(e.target.value)}
            >
              <option value="Espèces">Espèces</option>
              <option value="Banque">Banque</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Autre">Autre</option>
            </SelectField>
            <PrimaryButton type="submit" loading={opSaving} className="w-full">
              Enregistrer
            </PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  );
}
