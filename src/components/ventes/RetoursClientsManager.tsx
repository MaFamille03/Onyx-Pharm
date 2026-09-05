"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, ArrowLeftRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";
import { ArticleSelect } from "@/components/articles/ArticleSelect";
import { SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { PinModal } from "@/components/securite/PinModal";
import { useReferenceData } from "@/lib/hooks/useReferenceData";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

type RetourRow = {
  id: string;
  reference: string;
  quantite: number;
  motif: string | null;
  montant_impact: number;
  created_at: string;
  articles: { designation: string } | null;
  emplacements: { nom: string } | null;
};

export function RetoursClientsManager() {
  const supabase = createClient();
  const { emplacements } = useReferenceData();
  const emplacementsActifs = emplacements.filter((e) => e.actif);

  const [retours, setRetours] = useState<RetourRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [articleId, setArticleId] = useState("");
  const [emplacementId, setEmplacementId] = useState("");
  const [quantite, setQuantite] = useState("");
  const [motif, setMotif] = useState("");
  const [montantImpact, setMontantImpact] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteRetour, setDeleteRetour] = useState<RetourRow | null>(null);

  const [editRetour, setEditRetour] = useState<RetourRow | null>(null);
  const [editMotif, setEditMotif] = useState("");
  const [editMontantImpact, setEditMontantImpact] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("retours_clients")
      .select(
        "id, reference, quantite, motif, montant_impact, created_at, articles(designation), emplacements(nom)"
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) setRetours(data as unknown as RetourRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(["retours_clients"], load);

  function openCreate() {
    setArticleId("");
    setEmplacementId("");
    setQuantite("");
    setMotif("");
    setMontantImpact("");
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!articleId || !emplacementId) {
      setError("Article et emplacement obligatoires.");
      return;
    }
    const qte = Number(quantite);
    if (!qte || qte <= 0) {
      setError("Quantité invalide.");
      return;
    }

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.rpc("effectuer_retour_client", {
      p_vente_id: null,
      p_article_id: articleId,
      p_emplacement_id: emplacementId,
      p_quantite: qte,
      p_motif: motif.trim() || null,
      p_montant_impact: Number(montantImpact) || 0,
      p_utilisateur_id: user?.id ?? null,
    });

    setSaving(false);
    if (error) {
      setError(
        logSupabaseError(
          { table: "retours_clients", operation: "rpc effectuer_retour_client" },
          error,
          "Impossible d'enregistrer ce retour. Réessayez."
        )
      );
      return;
    }
    setModalOpen(false);
    load();
  }

  function ouvrirEdition(r: RetourRow) {
    setEditRetour(r);
    setEditMotif(r.motif ?? "");
    setEditMontantImpact(String(r.montant_impact ?? 0));
    setEditError(null);
  }

  async function handleModifierRetour(e: React.FormEvent) {
    e.preventDefault();
    if (!editRetour) return;
    setEditSaving(true);
    setEditError(null);
    const { error } = await supabase
      .from("retours_clients")
      .update({
        motif: editMotif.trim() || null,
        montant_impact: Number(editMontantImpact) || 0,
      })
      .eq("id", editRetour.id);
    setEditSaving(false);
    if (error) {
      setEditError(
        logSupabaseError(
          { table: "retours_clients", operation: "update" },
          error,
          "Impossible d'enregistrer les modifications. Réessayez."
        )
      );
      return;
    }
    setEditRetour(null);
    load();
  }

  async function confirmerSuppressionRetour(pin: string) {
    if (!deleteRetour) return;
    const { error } = await supabase.rpc("supprimer_retour_client", {
      p_retour_id: deleteRetour.id,
      p_pin: pin,
    });
    if (error) {
      throw new Error(
        logSupabaseError(
          { table: "retours_clients", operation: "rpc supprimer_retour_client" },
          error,
          "Impossible de supprimer ce retour."
        )
      );
    }
    setDeleteRetour(null);
    load();
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
            Retours clients
          </h1>
          <p className="mt-1 text-sm text-onyx-500">
            Produits retournés par un client (entrée de stock).
          </p>
        </div>
        <PrimaryButton onClick={openCreate} className="shrink-0">
          <Plus size={17} />
          Nouveau retour
        </PrimaryButton>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-onyx-400">
            Chargement...
          </p>
        ) : retours.length === 0 ? (
          <div className="rounded-xl border border-dashed border-onyx-200 bg-white py-14 text-center">
            <p className="text-sm font-medium text-onyx-600">
              Aucun retour pour le moment
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {retours.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-onyx-100 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-onyx-400">
                    {r.reference}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-onyx-400">
                      {new Date(r.created_at).toLocaleDateString("fr-FR")}
                    </span>
                    <button
                      onClick={() => ouvrirEdition(r)}
                      className="rounded-md p-1 text-onyx-400 hover:bg-onyx-100 hover:text-onyx-700"
                      aria-label="Modifier"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteRetour(r)}
                      className="rounded-md p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="mt-1 font-medium text-onyx-900">
                  {r.articles?.designation}
                </p>
                <p className="text-sm text-onyx-500">
                  {r.quantite} unité{r.quantite > 1 ? "s" : ""} vers{" "}
                  {r.emplacements?.nom}
                </p>
                {r.motif && (
                  <p className="mt-1 text-xs text-onyx-400">{r.motif}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <Modal
          title="Nouveau retour client"
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <InlineBanner message={error} />}

            <ArticleSelect value={articleId} onChange={setArticleId} />

            <SelectField
              id="emplacement-retour-client"
              label="Emplacement (entrée)"
              value={emplacementId}
              onChange={(e) => setEmplacementId(e.target.value)}
              required
            >
              <option value="">— Sélectionner —</option>
              {emplacementsActifs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </SelectField>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Quantité
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Motif
              </label>
              <input
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ex : produit défectueux, erreur de commande..."
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Impact financier (optionnel, FCFA)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={montantImpact}
                onChange={(e) => setMontantImpact(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <SecondaryButton
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1"
              >
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" loading={saving} className="flex-1">
                <ArrowLeftRight size={16} />
                Enregistrer
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {deleteRetour && (
        <PinModal
          title="Supprimer ce retour"
          message={`Supprimer le retour "${deleteRetour.reference}" ? Le stock restitué (${deleteRetour.quantite} unité${deleteRetour.quantite > 1 ? "s" : ""}) sera retiré si disponible.`}
          onCancel={() => setDeleteRetour(null)}
          onConfirm={confirmerSuppressionRetour}
        />
      )}

      {editRetour && (
        <Modal title="Modifier le retour" onClose={() => setEditRetour(null)}>
          <form onSubmit={handleModifierRetour} className="space-y-4">
            {editError && <InlineBanner message={editError} />}
            <p className="text-sm text-onyx-500">
              {editRetour.articles?.designation} · {editRetour.quantite}{" "}
              unité{editRetour.quantite > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-onyx-400">
              La quantité et l&apos;emplacement ne sont pas modifiables ici
              (ils affectent le stock) — supprimez ce retour et recréez-en un
              nouveau si besoin.
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Motif
              </label>
              <input
                value={editMotif}
                onChange={(e) => setEditMotif(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Impact financier (FCFA)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={editMontantImpact}
                onChange={(e) => setEditMontantImpact(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <SecondaryButton
                type="button"
                onClick={() => setEditRetour(null)}
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
    </div>
  );
}
