"use client";

import { useEffect, useState, useCallback } from "react";
import { CreditCard, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { PinModal } from "@/components/securite/PinModal";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

type CreanceRow = {
  vente_id: string;
  reference: string;
  client_id: string | null;
  montant_total: number;
  montant_paye: number;
  creance: number;
};

type PaiementRow = {
  id: string;
  montant: number;
  mode_paiement: string;
  date_paiement: string;
  ventes: { reference: string; clients: { nom: string } | null } | null;
};

export function PaiementsVentesManager() {
  const supabase = createClient();
  const [creances, setCreances] = useState<(CreanceRow & { client_nom: string })[]>(
    []
  );
  const [paiements, setPaiements] = useState<PaiementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalVente, setModalVente] = useState<
    (CreanceRow & { client_nom: string }) | null
  >(null);
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("Espèces");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editPaiement, setEditPaiement] = useState<PaiementRow | null>(null);
  const [editMontant, setEditMontant] = useState("");
  const [editMode, setEditMode] = useState("Espèces");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletePaiement, setDeletePaiement] = useState<PaiementRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [creancesRes, paiementsRes] = await Promise.all([
      supabase
        .from("v_creances_clients")
        .select("vente_id, reference, client_id, montant_total, montant_paye, creance"),
      supabase
        .from("paiements_ventes")
        .select("id, montant, mode_paiement, date_paiement, ventes(reference, clients(nom))")
        .order("date_paiement", { ascending: false })
        .limit(50),
    ]);

    if (creancesRes.data) {
      const clientIds = Array.from(
        new Set(
          creancesRes.data
            .map((c) => c.client_id)
            .filter((id): id is string => Boolean(id))
        )
      );
      const { data: clients } = await supabase
        .from("clients")
        .select("id, nom")
        .in("id", clientIds);
      const nomsMap = new Map((clients ?? []).map((c) => [c.id, c.nom]));
      setCreances(
        creancesRes.data.map((c) => ({
          ...c,
          client_nom: c.client_id
            ? nomsMap.get(c.client_id) ?? "—"
            : "Client de passage",
        }))
      );
    }
    if (paiementsRes.data)
      setPaiements(paiementsRes.data as unknown as PaiementRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(["paiements_ventes"], load);

  function ouvrirPaiement(creance: CreanceRow & { client_nom: string }) {
    setModalVente(creance);
    setMontant(String(creance.creance));
    setMode("Espèces");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modalVente) return;
    const val = Number(montant);
    if (!val || val <= 0) {
      setError("Montant invalide.");
      return;
    }
    if (val > modalVente.creance) {
      setError(
        `Le montant dépasse la créance restante (${modalVente.creance.toLocaleString("fr-FR")} FCFA).`
      );
      return;
    }

    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("paiements_ventes").insert({
      vente_id: modalVente.vente_id,
      montant: val,
      mode_paiement: mode,
      created_by: user?.id ?? null,
    });

    setSaving(false);
    if (error) {
      setError(
        logSupabaseError(
          { table: "paiements_ventes", operation: "insert" },
          error,
          "Impossible d'enregistrer ce paiement. Réessayez."
        )
      );
      return;
    }
    setModalVente(null);
    load();
  }

  function ouvrirEdition(p: PaiementRow) {
    setEditPaiement(p);
    setEditMontant(String(p.montant));
    setEditMode(p.mode_paiement);
    setEditError(null);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editPaiement) return;
    const val = Number(editMontant);
    if (!val || val <= 0) {
      setEditError("Montant invalide.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const { error } = await supabase
      .from("paiements_ventes")
      .update({ montant: val, mode_paiement: editMode })
      .eq("id", editPaiement.id);
    setEditSaving(false);
    if (error) {
      setEditError(
        logSupabaseError(
          { table: "paiements_ventes", operation: "update" },
          error,
          "Impossible de modifier ce paiement. Réessayez."
        )
      );
      return;
    }
    setEditPaiement(null);
    load();
  }

  async function confirmerSuppressionPaiement(pin: string) {
    if (!deletePaiement) return;
    const { error } = await supabase.rpc("supprimer_paiement_vente", {
      p_paiement_id: deletePaiement.id,
      p_pin: pin,
    });
    if (error) {
      throw new Error(
        logSupabaseError(
          { table: "paiements_ventes", operation: "rpc supprimer_paiement_vente" },
          error,
          "Impossible de supprimer ce paiement."
        )
      );
    }
    setDeletePaiement(null);
    load();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        Paiements de ventes
      </h1>
      <p className="mt-1 text-sm text-onyx-500">
        Créances clients en cours et historique des règlements.
      </p>

      {loading ? (
        <p className="py-10 text-center text-sm text-onyx-400">
          Chargement...
        </p>
      ) : (
        <>
          <h2 className="mt-6 text-sm font-semibold text-onyx-800">
            Créances en cours ({creances.length})
          </h2>
          {creances.length === 0 ? (
            <p className="mt-2 text-sm text-onyx-400">
              Aucune créance client en cours.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {creances.map((c) => (
                <div
                  key={c.vente_id}
                  className="flex items-center justify-between rounded-lg border border-onyx-100 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-onyx-800">
                      {c.reference} — {c.client_nom}
                    </p>
                    <p className="text-xs text-red-500">
                      Reste dû : {c.creance.toLocaleString("fr-FR")} FCFA
                    </p>
                  </div>
                  <PrimaryButton
                    onClick={() => ouvrirPaiement(c)}
                    className="min-h-0 px-3 py-1.5 text-xs"
                  >
                    <CreditCard size={14} />
                    Encaisser
                  </PrimaryButton>
                </div>
              ))}
            </div>
          )}

          <h2 className="mt-8 text-sm font-semibold text-onyx-800">
            Historique des paiements
          </h2>
          {paiements.length === 0 ? (
            <p className="mt-2 text-sm text-onyx-400">
              Aucun paiement enregistré.
            </p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl border border-onyx-100 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Vente</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {paiements.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-onyx-50 last:border-0"
                    >
                      <td className="px-4 py-2.5 text-onyx-500">
                        {new Date(p.date_paiement).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-2.5 text-onyx-700">
                        {p.ventes?.reference}
                      </td>
                      <td className="px-4 py-2.5 text-onyx-500">
                        {p.ventes?.clients?.nom ?? "Client de passage"}
                      </td>
                      <td className="px-4 py-2.5 text-onyx-500">
                        {p.mode_paiement}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-onyx-800">
                        {p.montant.toLocaleString("fr-FR")}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => ouvrirEdition(p)}
                            className="rounded-md p-1.5 text-onyx-400 hover:bg-onyx-100 hover:text-onyx-700"
                            aria-label="Modifier"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setDeletePaiement(p)}
                            className="rounded-md p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Supprimer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modalVente && (
        <Modal
          title={`Paiement — ${modalVente.reference}`}
          onClose={() => setModalVente(null)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <InlineBanner message={error} />}
            <p className="text-sm text-onyx-500">
              Client :{" "}
              <span className="font-medium text-onyx-800">
                {modalVente.client_nom}
              </span>
              <br />
              Reste dû :{" "}
              <span className="font-medium text-onyx-800">
                {modalVente.creance.toLocaleString("fr-FR")} FCFA
              </span>
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Montant
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <SelectField
              id="mode-paiement-creance"
              label="Mode de paiement"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="Espèces">Espèces</option>
              <option value="Banque">Banque</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Autre">Autre</option>
            </SelectField>
            <PrimaryButton type="submit" loading={saving} className="w-full">
              Enregistrer le paiement
            </PrimaryButton>
          </form>
        </Modal>
      )}

      {editPaiement && (
        <Modal
          title={`Modifier le paiement — ${editPaiement.ventes?.reference}`}
          onClose={() => setEditPaiement(null)}
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {editError && <InlineBanner message={editError} />}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Montant
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={editMontant}
                onChange={(e) => setEditMontant(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <SelectField
              id="mode-paiement-edition"
              label="Mode de paiement"
              value={editMode}
              onChange={(e) => setEditMode(e.target.value)}
            >
              <option value="Espèces">Espèces</option>
              <option value="Banque">Banque</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Autre">Autre</option>
            </SelectField>
            <div className="flex gap-3 pt-2">
              <SecondaryButton
                type="button"
                onClick={() => setEditPaiement(null)}
                className="flex-1"
              >
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" loading={editSaving} className="flex-1">
                Enregistrer
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {deletePaiement && (
        <PinModal
          title="Supprimer ce paiement"
          message={`Supprimer le paiement de ${deletePaiement.montant.toLocaleString("fr-FR")} FCFA sur ${deletePaiement.ventes?.reference} ? Le décaissement/encaissement lié sera aussi retiré.`}
          onCancel={() => setDeletePaiement(null)}
          onConfirm={confirmerSuppressionPaiement}
        />
      )}
    </div>
  );
}
