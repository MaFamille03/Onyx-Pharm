"use client";

import { useState } from "react";
import { ArrowLeftRight, History } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";
import { ArticleSelect } from "@/components/articles/ArticleSelect";
import { SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { useReferenceData } from "@/lib/hooks/useReferenceData";

export function MouvementModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const { emplacements } = useReferenceData();
  const emplacementsActifs = emplacements.filter((e) => e.actif);

  const [articleId, setArticleId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [quantite, setQuantite] = useState("");
  const [observation, setObservation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!articleId || !sourceId || !destinationId) {
      setError("Article, emplacement source et destination sont obligatoires.");
      return;
    }
    if (sourceId === destinationId) {
      setError("La source et la destination doivent être différentes.");
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

    const { error } = await supabase.rpc("effectuer_transfert", {
      p_article_id: articleId,
      p_source_id: sourceId,
      p_destination_id: destinationId,
      p_quantite: qte,
      p_observation: observation.trim() || null,
      p_utilisateur_id: user?.id ?? null,
    });

    setSaving(false);
    if (error) {
      setError(
        error.message.includes("Stock insuffisant")
          ? error.message
          : logSupabaseError(
              { table: "transferts", operation: "rpc effectuer_transfert" },
              error,
              "Impossible d'effectuer ce mouvement. Réessayez."
            )
      );
      return;
    }

    setSuccess("Mouvement enregistré.");
    setArticleId("");
    setQuantite("");
    setObservation("");
  }

  return (
    <Modal title="Mouvement entre emplacements" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <InlineBanner message={error} />}
        {success && <InlineBanner type="success" message={success} />}

        <a
          href="/stock/mouvements"
          className="flex items-center gap-1.5 text-xs font-medium text-accent-600 hover:underline"
        >
          <History size={13} />
          Voir l&apos;historique complet des mouvements
        </a>

        <ArticleSelect value={articleId} onChange={setArticleId} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            id="mouvement-source"
            label="Depuis"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            required
          >
            <option value="">— Emplacement source —</option>
            {emplacementsActifs.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="mouvement-destination"
            label="Vers"
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            required
          >
            <option value="">— Emplacement destination —</option>
            {emplacementsActifs.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </SelectField>
        </div>

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
            Observation
          </label>
          <input
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Optionnel"
            className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <SecondaryButton type="button" onClick={onClose} className="flex-1">
            Fermer
          </SecondaryButton>
          <PrimaryButton type="submit" loading={saving} className="flex-1">
            <ArrowLeftRight size={16} />
            Enregistrer
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
