"use client";

import { useEffect, useState, useCallback } from "react";
import { CreditCard, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { PinModal } from "@/components/securite/PinModal";

type DetteRow = {
  conteneur_id: string;
  reference: string;
  fournisseur_id: string | null;
  montant_total: number;
  montant_paye: number;
  dette: number;
};

type PaiementRow = {
  id: string;
  montant: number;
  mode_paiement: string;
  date_paiement: string;
  conteneurs: { code: string; fournisseurs: { nom: string } | null } | null;
};

export function PaiementsConteneursManager() {
  const supabase = createClient();
  const [dettes, setDettes] = useState<(DetteRow & { fournisseur_nom: string })[]>([]);
  const [paiements, setPaiements] = useState<PaiementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalConteneur, setModalConteneur] = useState<
    (DetteRow & { fournisseur_nom: string }) | null
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
    const [dettesRes, paiementsRes] = await Promise.all([
      supabase
        .from("v_dettes_conteneurs")
        .select("conteneur_id, reference, fournisseur_id, montant_total, montant_paye, dette"),
      supabase
        .from("paiements_conteneurs")
        .select("id, montant, mode_paiement, date_paiement, conteneurs(code, fournisseurs(nom))")
        .order("date_paiement", { ascending: false })
        .limit(50),
    ]);

    if (dettesRes.data) {
      const fournisseurIds = Array.from(
        new Set(
          dettesRes.data.map((d) => d.fournisseur_id).filter((id): id is string => Boolean(id))
        )
      );
      const { data: fournisseurs } =
        fournisseurIds.length > 0
          ? await supabase.from("fournisseurs").select("id, nom").in("id", fournisseurIds)
          : { data: [] as { id: string; nom: string }[] };
      const nomsMap = new Map((fournisseurs ?? []).map((f) => [f.id, f.nom]));
      setDettes(
        dettesRes.data.map((d) => ({
          ...d,
          fournisseur_nom: d.fournisseur_id ? nomsMap.get(d.fournisseur_id) ?? "—" : "Sans fournisseur",
        }))
      );
    }
    if (paiementsRes.data) setPaiements(paiementsRes.data as unknown as PaiementRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(["paiements_conteneurs", "conteneurs"], load);

  function ouvrirPaiement(dette: DetteRow & { fournisseur_nom: string }) {
    setModalConteneur(dette);
    setMontant(String(dette.dette));
    setMode("Espèces");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modalConteneur) return;
    const val = Number(montant);
    if (!val || val <= 0) {
      setError("Montant invalide.");
      return;
    }
    if (val > modalConteneur.dette) {
      setError(`Le montant dépasse la dette restante (${modalConteneur.dette.toLocaleString("fr-FR")} FCFA).`);
      return;
    }

    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("paiements_conteneurs").insert({
      conteneur_id: modalConteneur.conteneur_id,
      montant: val,
      mode_paiement: mode,
      created_by: user?.id ?? null,
    });

    setSaving(false);
    if (error) {
      setError(
        logSupabaseError(
          { table: "paiements_conteneurs", operation: "insert" },
          error,
          "Impossible d'enregistrer ce paiement. Réessayez."
        )
      );
      return;
    }
    setModalConteneur(null);
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
      .from("paiements_conteneurs")
      .update({ montant: val, mode_paiement: editMode })
      .eq("id", editPaiement.id);
    setEditSaving(false);
    if (error) {
      setEditError(
        logSupabaseError(
          { table: "paiements_conteneurs", operation: "update" },
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
    const { error } = await supabase.rpc("supprimer_paiement_conteneur", {
      p_paiement_id: deletePaiement.id,
      p_pin: pin,
    });
    if (error) {
      throw new Error(
        logSupabaseError(
          { table: "paiements_conteneurs", operation: "rpc supprimer_paiement_conteneur" },
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
        Paiements de conteneurs
      </h1>
      <p className="mt-1 text-sm text-onyx-500">
        Dettes fournisseurs en cours (par conteneur) et historique des
        règlements. Sans rapport avec les ventes.
      </p>

      {loading ? (
        <p className="py-10 text-center text-sm text-onyx-400">Chargement...</p>
      ) : (
        <>
          <h2 className="mt-6 text-sm font-semibold text-onyx-800">
            Dettes en cours ({dettes.length})
          </h2>
          {dettes.length === 0 ? (
            <p className="mt-2 text-sm text-onyx-400">
              Aucune dette de conteneur en cours.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {dettes.map((d) => (
                <div
                  key={d.conteneur_id}
                  className="flex items-center justify-between rounded-lg border border-onyx-100 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-onyx-800">
                      {d.reference} — {d.fournisseur_nom}
                    </p>
                    <p className="text-xs text-red-500">
                      Reste dû : {d.dette.toLocaleString("fr-FR")} FCFA
                    </p>
                  </div>
                  <PrimaryButton onClick={() => ouvrirPaiement(d)} className="min-h-0 px-3 py-1.5 text-xs">
                    <CreditCard size={14} />
                    Payer
                  </PrimaryButton>
                </div>
              ))}
            </div>
          )}

          <h2 className="mt-8 text-sm font-semibold text-onyx-800">
            Historique des paiements
          </h2>
          {paiements.length === 0 ? (
            <p className="mt-2 text-sm text-onyx-400">Aucun paiement enregistré.</p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl border border-onyx-100 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Conteneur</th>
                    <th className="px-4 py-3">Fournisseur</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {paiements.map((p) => (
                    <tr key={p.id} className="border-b border-onyx-50 last:border-0">
                      <td className="px-4 py-2.5 text-onyx-500">
                        {new Date(p.date_paiement).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-2.5 text-onyx-700">{p.conteneurs?.code}</td>
                      <td className="px-4 py-2.5 text-onyx-500">
                        {p.conteneurs?.fournisseurs?.nom ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-onyx-500">{p.mode_paiement}</td>
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

      {modalConteneur && (
        <Modal title={`Paiement — ${modalConteneur.reference}`} onClose={() => setModalConteneur(null)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <InlineBanner message={error} />}
            <p className="text-sm text-onyx-500">
              Fournisseur :{" "}
              <span className="font-medium text-onyx-800">{modalConteneur.fournisseur_nom}</span>
              <br />
              Reste dû :{" "}
              <span className="font-medium text-onyx-800">
                {modalConteneur.dette.toLocaleString("fr-FR")} FCFA
              </span>
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">Montant</label>
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
            <SelectField id="mode-paiement-dette-conteneur" label="Mode de paiement" value={mode} onChange={(e) => setMode(e.target.value)}>
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
          title={`Modifier le paiement — ${editPaiement.conteneurs?.code}`}
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
              id="mode-paiement-edition-conteneur"
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
          message={`Supprimer le paiement de ${deletePaiement.montant.toLocaleString("fr-FR")} FCFA sur ${deletePaiement.conteneurs?.code} ? Le décaissement lié sera aussi retiré.`}
          onCancel={() => setDeletePaiement(null)}
          onConfirm={confirmerSuppressionPaiement}
        />
      )}
    </div>
  );
}
