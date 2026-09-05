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
import { exporterExcel } from "@/lib/excel";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

type Periode = "tout" | "aujourdhui" | "semaine" | "mois";

type LigneCaisse = {
  id: string;
  reference: string;
  date_operation: string;
  description: string | null;
  categorie: string | null;
  recette: number;
  depense: number;
};

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

export function SoldeManager() {
  const supabase = createClient();
  const [soldeInitial, setSoldeInitial] = useState(0);
  const [lignes, setLignes] = useState<LigneCaisse[]>([]);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState<Periode>("tout");

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
    const debut = debutPeriode(periode);

    let encQuery = supabase
      .from("encaissements")
      .select("id, reference, date_operation, montant, description, categorie");
    let decQuery = supabase
      .from("decaissements")
      .select("id, reference, date_operation, montant, description, categorie");
    if (debut) {
      encQuery = encQuery.gte("date_operation", debut);
      decQuery = decQuery.gte("date_operation", debut);
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

    const enc = (encRes.data ?? []).map((e) => ({
      id: e.id,
      reference: e.reference,
      date_operation: e.date_operation,
      description: e.description,
      categorie: e.categorie,
      recette: e.montant,
      depense: 0,
    }));
    const dec = (decRes.data ?? []).map((d) => ({
      id: d.id,
      reference: d.reference,
      date_operation: d.date_operation,
      description: d.description,
      categorie: d.categorie,
      recette: 0,
      depense: d.montant,
    }));

    setLignes(
      [...enc, ...dec].sort((a, b) =>
        a.date_operation < b.date_operation
          ? -1
          : a.date_operation > b.date_operation
            ? 1
            : a.reference.localeCompare(b.reference)
      )
    );
    if (paramRes.data?.valeur) setSoldeInitial(Number(paramRes.data.valeur) || 0);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

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
      .update({ valeur: String(val) })
      .eq("cle", "solde_caisse_initial");
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

  function exporter() {
    let cumul = periode === "tout" ? soldeInitial : 0;
    const rows = lignes.map((l, i) => {
      cumul += l.recette - l.depense;
      return {
        Numéro: i + 1,
        Date: new Date(l.date_operation).toLocaleDateString("fr-FR"),
        Désignation: l.description || l.reference,
        Recette: l.recette || "",
        Dépense: l.depense || "",
        "Solde cumulatif": cumul,
      };
    });
    exporterExcel("livre-de-caisse", [{ nom: "Livre de caisse", lignes: rows }]);
  }

  const totalEncaissements = lignes.reduce((s, l) => s + l.recette, 0);
  const totalDecaissements = lignes.reduce((s, l) => s + l.depense, 0);
  const soldeActuel =
    periode === "tout"
      ? soldeInitial + totalEncaissements - totalDecaissements
      : totalEncaissements - totalDecaissements;

  let cumulAffiche = periode === "tout" ? soldeInitial : 0;

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

      <div className="mt-5 flex gap-1.5 overflow-x-auto rounded-lg bg-onyx-50 p-1">
        {(
          [
            { id: "tout", label: "Depuis le début" },
            { id: "aujourdhui", label: "Aujourd'hui" },
            { id: "semaine", label: "Cette semaine" },
            { id: "mois", label: "Ce mois" },
          ] as { id: Periode; label: string }[]
        ).map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriode(p.id)}
            className={`shrink-0 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
              periode === p.id
                ? "bg-white text-onyx-900 shadow-sm"
                : "text-onyx-500 hover:text-onyx-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-onyx-400">
          Chargement...
        </p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                {soldeActuel.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-onyx-300">
                {periode === "tout" ? "Solde actuel" : "Variation sur la période"}{" "}
                (FCFA)
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-onyx-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                  <th className="px-4 py-3">N°</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Désignation</th>
                  <th className="px-4 py-3 text-right">Recette</th>
                  <th className="px-4 py-3 text-right">Dépense</th>
                  <th className="px-4 py-3 text-right">Solde cumulatif</th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-onyx-400">
                      Aucune opération sur la période.
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
              </tbody>
            </table>
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
