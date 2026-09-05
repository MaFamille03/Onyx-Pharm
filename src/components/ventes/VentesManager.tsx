"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, ArrowLeft, Pencil, Trash2, CreditCard, XCircle, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner, StatutBadge } from "@/components/ui/Badges";
import { ClientSelect } from "@/components/tiers/ClientSelect";
import { ConteneurLigneSelect } from "@/components/conteneurs/ConteneurLigneSelect";
import { useReferenceData } from "@/lib/hooks/useReferenceData";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { SecondPasswordModal } from "@/components/securite/SecondPasswordModal";
import { DocumentImprimable } from "@/components/documents/DocumentImprimable";

type VenteRow = {
  id: string;
  reference: string;
  date_vente: string;
  montant_total: number;
  montant_paye: number;
  statut: string;
  clients: { nom: string } | null;
};

type ArticleOption = {
  id: string;
  designation: string;
  prix_vente_conseille: number;
};

type LigneBrouillon = {
  article_id: string;
  quantite: string;
  prix_vente_conseille_reference: string;
  prix_vente_reel: string;
  remise: string;
  emplacement_id: string;
  conteneur_id: string;
};

export function VentesManager() {
  const [vue, setVue] = useState<"liste" | "creation" | "detail">("liste");
  const [venteOuverteId, setVenteOuverteId] = useState<string | null>(null);
  const [venteEditionId, setVenteEditionId] = useState<string | null>(null);

  if (vue === "creation") {
    return (
      <NouvelleVente
        editVenteId={venteEditionId ?? undefined}
        onCancel={() => {
          setVenteEditionId(null);
          setVue(venteEditionId ? "detail" : "liste");
        }}
        onCreated={(id) => {
          setVenteEditionId(null);
          setVenteOuverteId(id);
          setVue("detail");
        }}
      />
    );
  }

  if (vue === "detail" && venteOuverteId) {
    return (
      <VenteDetail
        venteId={venteOuverteId}
        onBack={() => setVue("liste")}
        onEdit={() => {
          setVenteEditionId(venteOuverteId);
          setVue("creation");
        }}
      />
    );
  }

  return (
    <ListeVentes
      onCreate={() => setVue("creation")}
      onOpen={(id) => {
        setVenteOuverteId(id);
        setVue("detail");
      }}
    />
  );
}

function ListeVentes({
  onCreate,
  onOpen,
}: {
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  const supabase = createClient();
  const [ventes, setVentes] = useState<VenteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ventes")
      .select(
        "id, reference, date_vente, montant_total, montant_paye, statut, clients(nom)"
      )
      .order("created_at", { ascending: false });
    if (data) setVentes(data as unknown as VenteRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(["ventes"], load);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
            Ventes
          </h1>
          <p className="mt-1 text-sm text-onyx-500">
            Ventes multi-articles et paiements.
          </p>
        </div>
        <PrimaryButton onClick={onCreate} className="shrink-0">
          <Plus size={17} />
          Nouvelle vente
        </PrimaryButton>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-onyx-400">
            Chargement...
          </p>
        ) : ventes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-onyx-200 bg-white py-14 text-center">
            <p className="text-sm font-medium text-onyx-600">
              Aucune vente pour le moment
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {ventes.map((v) => {
              const reste = v.montant_total - v.montant_paye;
              return (
                <button
                  key={v.id}
                  onClick={() => onOpen(v.id)}
                  className="flex w-full flex-col gap-1 rounded-xl border border-onyx-100 bg-white p-4 text-left hover:bg-onyx-50/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-onyx-900">
                      {v.reference}
                      {v.clients?.nom ? ` — ${v.clients.nom}` : ""}
                    </p>
                    <p className="text-xs text-onyx-400">
                      {new Date(v.date_vente).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm">
                      <p className="font-semibold text-onyx-800">
                        {v.montant_total.toLocaleString("fr-FR")} FCFA
                      </p>
                      {reste > 0 && v.statut !== "Brouillon" && (
                        <p className="text-xs text-red-500">
                          Reste : {reste.toLocaleString("fr-FR")}
                        </p>
                      )}
                    </div>
                    <StatutBadge statut={v.statut} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NouvelleVente({
  editVenteId,
  onCancel,
  onCreated,
}: {
  editVenteId?: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const supabase = createClient();
  const { emplacements } = useReferenceData();
  const emplacementsActifs = emplacements.filter((e) => e.actif);

  const [clientId, setClientId] = useState("");
  const [dateVente, setDateVente] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [articlesOptions, setArticlesOptions] = useState<ArticleOption[]>([]);
  const [lignes, setLignes] = useState<LigneBrouillon[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingEdition, setLoadingEdition] = useState(Boolean(editVenteId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("articles")
      .select("id, designation, prix_vente_conseille")
      .eq("statut", "Actif")
      .order("designation")
      .then(({ data }) => {
        if (data) setArticlesOptions(data as ArticleOption[]);
      });

    if (editVenteId) {
      Promise.all([
        supabase
          .from("ventes")
          .select("client_id, date_vente")
          .eq("id", editVenteId)
          .single(),
        supabase
          .from("lignes_ventes")
          .select(
            "article_id, quantite, prix_vente_conseille_reference, prix_vente_reel, remise, emplacement_id, conteneur_id"
          )
          .eq("vente_id", editVenteId),
      ]).then(([venteRes, lignesRes]) => {
        if (venteRes.data) {
          setClientId(venteRes.data.client_id ?? "");
          setDateVente(venteRes.data.date_vente);
        }
        if (lignesRes.data) {
          setLignes(
            lignesRes.data.map((l) => ({
              article_id: l.article_id,
              quantite: String(l.quantite),
              prix_vente_conseille_reference: String(
                l.prix_vente_conseille_reference ?? ""
              ),
              prix_vente_reel: String(l.prix_vente_reel),
              remise: String(l.remise ?? "0"),
              emplacement_id: l.emplacement_id,
              conteneur_id: l.conteneur_id ?? "",
            }))
          );
        }
        setLoadingEdition(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editVenteId]);

  function ajouterLigne() {
    setLignes([
      ...lignes,
      {
        article_id: "",
        quantite: "1",
        prix_vente_conseille_reference: "",
        prix_vente_reel: "",
        remise: "0",
        emplacement_id: emplacementsActifs[0]?.id ?? "",
        conteneur_id: "",
      },
    ]);
  }

  function majLigne(index: number, patch: Partial<LigneBrouillon>) {
    setLignes(lignes.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function supprimerLigne(index: number) {
    setLignes(lignes.filter((_, i) => i !== index));
  }

  function choisirArticle(index: number, articleId: string) {
    const article = articlesOptions.find((a) => a.id === articleId);
    majLigne(index, {
      article_id: articleId,
      prix_vente_conseille_reference: article
        ? String(article.prix_vente_conseille)
        : "",
      prix_vente_reel: article ? String(article.prix_vente_conseille) : "",
    });
  }

  function designationDe(articleId: string) {
    return articlesOptions.find((a) => a.id === articleId)?.designation ?? "";
  }

  const montantTotal = lignes.reduce((sum, l) => {
    const qte = Number(l.quantite) || 0;
    const prix = Number(l.prix_vente_reel) || 0;
    const remise = Number(l.remise) || 0;
    return sum + (qte * prix - remise);
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (lignes.length === 0) {
      setError("Ajoutez au moins un article.");
      return;
    }
    for (const l of lignes) {
      if (!l.article_id || !l.quantite || Number(l.quantite) <= 0) {
        setError("Chaque ligne doit avoir un article et une quantité valide.");
        return;
      }
      if (!l.emplacement_id) {
        setError("Chaque ligne doit avoir un emplacement de sortie.");
        return;
      }
    }

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let venteId = editVenteId;

    if (editVenteId) {
      const { error: updateError } = await supabase
        .from("ventes")
        .update({
          client_id: clientId || null,
          date_vente: dateVente,
          montant_total: montantTotal,
        })
        .eq("id", editVenteId);

      if (updateError) {
        setError(
          logSupabaseError(
            { table: "ventes", operation: "update (édition brouillon)" },
            updateError,
            "Impossible d'enregistrer les modifications. Réessayez."
          )
        );
        setSaving(false);
        return;
      }

      const { error: deleteLignesError } = await supabase
        .from("lignes_ventes")
        .delete()
        .eq("vente_id", editVenteId);

      if (deleteLignesError) {
        setError(
          logSupabaseError(
            { table: "lignes_ventes", operation: "delete (édition brouillon)" },
            deleteLignesError,
            "Impossible de mettre à jour les lignes. Réessayez."
          )
        );
        setSaving(false);
        return;
      }
    } else {
      const { data: refData, error: refError } = await supabase.rpc(
        "generer_numero_document",
        { p_prefixe: "FAC" }
      );
      if (refError || !refData) {
        setError(
          logSupabaseError(
            { table: "numero_sequences", operation: "rpc generer_numero_document" },
            refError,
            "Impossible de générer la référence. Réessayez."
          )
        );
        setSaving(false);
        return;
      }

      const { data: vente, error: venteError } = await supabase
        .from("ventes")
        .insert({
          reference: refData,
          client_id: clientId || null,
          date_vente: dateVente,
          montant_total: montantTotal,
          statut: "Brouillon",
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();

      if (venteError || !vente) {
        setError(
          logSupabaseError(
            { table: "ventes", operation: "insert" },
            venteError,
            "Impossible de créer la vente. Réessayez."
          )
        );
        setSaving(false);
        return;
      }
      venteId = vente.id;
    }

    const { error: lignesError } = await supabase.from("lignes_ventes").insert(
      lignes.map((l) => ({
        vente_id: venteId,
        article_id: l.article_id,
        emplacement_id: l.emplacement_id,
        quantite: Number(l.quantite),
        // Colonne historique héritée de l'ancien système de marge, non
        // utilisée par le nouveau modèle (prix de vente entièrement
        // libre). Conservée à 0 pour satisfaire la contrainte de la base.
        prix_achat_reference: 0,
        prix_vente_conseille_reference:
          Number(l.prix_vente_conseille_reference) || 0,
        prix_vente_reel: Number(l.prix_vente_reel) || 0,
        remise: Number(l.remise) || 0,
        conteneur_id: l.conteneur_id || null,
      }))
    );

    setSaving(false);

    if (lignesError) {
      setError(
        "La vente a été enregistrée mais les lignes n'ont pas pu être créées."
      );
      return;
    }

    onCreated(venteId!);
  }

  if (loadingEdition) {
    return <p className="py-10 text-center text-sm text-onyx-400">Chargement...</p>;
  }

  return (
    <div>
      <button
        onClick={onCancel}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-onyx-500 hover:text-onyx-800"
      >
        <ArrowLeft size={16} />
        Retour aux ventes
      </button>

      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        {editVenteId ? "Modifier le brouillon" : "Nouvelle vente"}
      </h1>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        {error && <InlineBanner message={error} />}

        <div className="grid grid-cols-1 gap-4 rounded-xl border border-onyx-100 bg-white p-4 sm:grid-cols-2">
          <ClientSelect value={clientId} onChange={setClientId} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-onyx-700">
              Date de vente
            </label>
            <input
              type="date"
              required
              value={dateVente}
              onChange={(e) => setDateVente(e.target.value)}
              className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
            />
          </div>
        </div>

        <div className="rounded-xl border border-onyx-100 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-onyx-800">Articles</h2>
            <SecondaryButton
              type="button"
              onClick={ajouterLigne}
              className="min-h-0 px-3 py-1.5 text-xs"
            >
              <Plus size={14} />
              Ajouter une ligne
            </SecondaryButton>
          </div>

          {lignes.length === 0 ? (
            <p className="mt-3 text-sm text-onyx-400">Aucun article ajouté.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {lignes.map((l, i) => {
                const sousTotal =
                  (Number(l.quantite) || 0) * (Number(l.prix_vente_reel) || 0) -
                  (Number(l.remise) || 0);
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-onyx-100 bg-onyx-50/40 p-3"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
                      <div className="sm:col-span-4">
                        <label className="mb-1 block text-xs font-medium text-onyx-500">
                          Article
                        </label>
                        <select
                          value={l.article_id}
                          onChange={(e) => choisirArticle(i, e.target.value)}
                          required
                          className="w-full rounded-md border border-onyx-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                        >
                          <option value="">— Article —</option>
                          {articlesOptions.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.designation}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-1">
                        <label className="mb-1 block text-xs font-medium text-onyx-500">
                          Qté
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={l.quantite}
                          onChange={(e) =>
                            majLigne(i, { quantite: e.target.value })
                          }
                          className="w-full rounded-md border border-onyx-200 px-2.5 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <div className="mb-1 flex items-baseline justify-between">
                          <label className="block text-xs font-medium text-onyx-500">
                            Prix de vente
                          </label>
                          <span className="text-[11px] text-onyx-400">
                            Référence :{" "}
                            {l.prix_vente_conseille_reference
                              ? Number(
                                  l.prix_vente_conseille_reference
                                ).toLocaleString("fr-FR")
                              : "—"}
                          </span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={l.prix_vente_reel}
                          onChange={(e) =>
                            majLigne(i, { prix_vente_reel: e.target.value })
                          }
                          className="w-full rounded-md border border-onyx-200 px-2.5 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                        />
                        {Number(l.prix_vente_conseille_reference) > 0 &&
                          l.prix_vente_reel !== "" &&
                          Number(l.prix_vente_reel) <
                            Number(l.prix_vente_conseille_reference) && (
                            <p className="mt-0.5 text-[11px] text-red-500">
                              Sous le prix de référence
                            </p>
                          )}
                      </div>

                      <div className="sm:col-span-1">
                        <label className="mb-1 block text-xs font-medium text-onyx-500">
                          Remise
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={l.remise}
                          onChange={(e) =>
                            majLigne(i, { remise: e.target.value })
                          }
                          className="w-full rounded-md border border-onyx-200 px-2.5 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-xs font-medium text-onyx-500">
                          Emplacement (sortie)
                        </label>
                        <select
                          value={l.emplacement_id}
                          onChange={(e) =>
                            majLigne(i, { emplacement_id: e.target.value })
                          }
                          required
                          className="w-full rounded-md border border-onyx-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                        >
                          {emplacementsActifs.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.nom}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center justify-end sm:col-span-1">
                        <button
                          type="button"
                          onClick={() => supprimerLigne(i)}
                          className="rounded-md p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Supprimer la ligne"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2">
                      <ConteneurLigneSelect
                        articleId={l.article_id}
                        emplacementId={l.emplacement_id}
                        value={l.conteneur_id}
                        onChange={(conteneurId) => majLigne(i, { conteneur_id: conteneurId })}
                      />
                    </div>

                    <p className="mt-1.5 text-xs text-onyx-400">
                      {designationDe(l.article_id)} · Sous-total :{" "}
                      <span className="font-medium text-onyx-600">
                        {sousTotal.toLocaleString("fr-FR")} FCFA
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center justify-end border-t border-onyx-100 pt-3">
            <p className="text-sm font-semibold text-onyx-800">
              Total : {montantTotal.toLocaleString("fr-FR")} FCFA
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <SecondaryButton type="button" onClick={onCancel} className="flex-1">
            Annuler
          </SecondaryButton>
          <PrimaryButton type="submit" loading={saving} className="flex-1">
            {editVenteId ? "Enregistrer les modifications" : "Créer la vente"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

function VenteDetail({
  venteId,
  onBack,
  onEdit,
}: {
  venteId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  const supabase = createClient();
  const [vente, setVente] = useState<VenteRow | null>(null);
  const [lignes, setLignes] = useState<
    {
      id: string;
      quantite: number;
      prix_vente_reel: number;
      prix_vente_conseille_reference: number;
      montant_ligne: number;
      articles: { designation: string } | null;
      emplacements: { nom: string } | null;
    }[]
  >([]);
  const [paiements, setPaiements] = useState<
    { id: string; montant: number; mode_paiement: string; date_paiement: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [paiementModalOpen, setPaiementModalOpen] = useState(false);
  const [montantPaiement, setMontantPaiement] = useState("");
  const [modePaiement, setModePaiement] = useState("Espèces");
  const [annulationModalOpen, setAnnulationModalOpen] = useState(false);
  const [impressionOpen, setImpressionOpen] = useState(false);
  const [suppressionBrouillonOpen, setSuppressionBrouillonOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [venteRes, lignesRes, paiementsRes] = await Promise.all([
      supabase
        .from("ventes")
        .select(
          "id, reference, date_vente, montant_total, montant_paye, statut, clients(nom)"
        )
        .eq("id", venteId)
        .single(),
      supabase
        .from("lignes_ventes")
        .select(
          "id, quantite, prix_vente_reel, prix_vente_conseille_reference, montant_ligne, articles(designation), emplacements(nom)"
        )
        .eq("vente_id", venteId),
      supabase
        .from("paiements_ventes")
        .select("id, montant, mode_paiement, date_paiement")
        .eq("vente_id", venteId)
        .order("date_paiement", { ascending: false }),
    ]);

    if (venteRes.data) setVente(venteRes.data as unknown as VenteRow);
    if (lignesRes.data) setLignes(lignesRes.data as unknown as typeof lignes);
    if (paiementsRes.data) setPaiements(paiementsRes.data);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venteId]);

  useEffect(() => {
    load();
  }, [load]);

  async function validerVente() {
    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.rpc("valider_vente", {
      p_vente_id: venteId,
      p_utilisateur_id: user?.id ?? null,
    });

    setBusy(false);
    if (error) {
      setError(
        error.message.includes("Stock insuffisant")
          ? error.message
          : "Impossible de valider cette vente."
      );
      return;
    }
    load();
  }

  async function supprimerBrouillon() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("supprimer_vente_brouillon", {
      p_vente_id: venteId,
    });
    setBusy(false);
    if (error) {
      setError(
        logSupabaseError(
          { table: "ventes", operation: "rpc supprimer_vente_brouillon" },
          error,
          "Impossible de supprimer ce brouillon. Réessayez."
        )
      );
      return;
    }
    setSuppressionBrouillonOpen(false);
    onBack();
  }

  async function annulerVenteAvecMotDePasse(motDePasse: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.rpc("annuler_vente", {
      p_vente_id: venteId,
      p_second_mdp: motDePasse,
      p_utilisateur_id: user?.id ?? null,
    });

    if (error) {
      throw new Error(
        error.message.includes("Mot de passe")
          ? "Mot de passe de sécurité incorrect."
          : "Impossible d'annuler cette vente."
      );
    }

    setAnnulationModalOpen(false);
    load();
  }

  async function handleAjouterPaiement(e: React.FormEvent) {
    e.preventDefault();
    if (!vente) return;
    const montant = Number(montantPaiement);
    const reste = vente.montant_total - vente.montant_paye;
    if (!montant || montant <= 0) {
      setError("Montant invalide.");
      return;
    }
    if (montant > reste) {
      setError(
        `Le montant dépasse le reste à payer (${reste.toLocaleString("fr-FR")} FCFA).`
      );
      return;
    }

    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("paiements_ventes").insert({
      vente_id: venteId,
      montant,
      mode_paiement: modePaiement,
      created_by: user?.id ?? null,
    });

    setBusy(false);
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
    setPaiementModalOpen(false);
    setMontantPaiement("");
    load();
  }

  if (loading || !vente) {
    return (
      <p className="py-10 text-center text-sm text-onyx-400">Chargement...</p>
    );
  }

  const reste = vente.montant_total - vente.montant_paye;

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-onyx-500 hover:text-onyx-800"
      >
        <ArrowLeft size={16} />
        Retour aux ventes
      </button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-onyx-900 sm:text-2xl">
            {vente.reference}
            <StatutBadge statut={vente.statut} />
          </h1>
          <p className="mt-1 text-sm text-onyx-500">
            {vente.clients?.nom ?? "Client de passage"} ·{" "}
            {new Date(vente.date_vente).toLocaleDateString("fr-FR")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {vente.statut === "Brouillon" && (
            <>
              <SecondaryButton onClick={onEdit}>
                <Pencil size={16} />
                Modifier
              </SecondaryButton>
              <SecondaryButton
                onClick={() => setSuppressionBrouillonOpen(true)}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 size={16} />
                Supprimer
              </SecondaryButton>
              <PrimaryButton onClick={validerVente} loading={busy}>
                Valider la vente
              </PrimaryButton>
            </>
          )}
          {vente.statut !== "Brouillon" && (
            <SecondaryButton onClick={() => setImpressionOpen(true)}>
              <Printer size={16} />
              Imprimer
            </SecondaryButton>
          )}
          {vente.statut !== "Brouillon" && vente.statut !== "Annulé" && (
            <SecondaryButton onClick={() => setAnnulationModalOpen(true)}>
              <XCircle size={16} />
              Annuler la vente
            </SecondaryButton>
          )}
          {vente.statut !== "Brouillon" && vente.statut !== "Annulé" && reste > 0 && (
            <PrimaryButton
              onClick={() => {
                setMontantPaiement(String(reste));
                setError(null);
                setPaiementModalOpen(true);
              }}
            >
              <CreditCard size={16} />
              Enregistrer un paiement
            </PrimaryButton>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <InlineBanner message={error} />
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-onyx-100 bg-white p-4 text-center">
          <p className="text-lg font-semibold text-onyx-900">
            {vente.montant_total.toLocaleString("fr-FR")}
          </p>
          <p className="text-xs text-onyx-400">Total (FCFA)</p>
        </div>
        <div className="rounded-xl border border-onyx-100 bg-white p-4 text-center">
          <p className="text-lg font-semibold text-emerald-600">
            {vente.montant_paye.toLocaleString("fr-FR")}
          </p>
          <p className="text-xs text-onyx-400">Payé</p>
        </div>
        <div className="rounded-xl border border-onyx-100 bg-white p-4 text-center">
          <p
            className={`text-lg font-semibold ${
              reste > 0 ? "text-red-500" : "text-onyx-400"
            }`}
          >
            {reste.toLocaleString("fr-FR")}
          </p>
          <p className="text-xs text-onyx-400">Créance</p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-onyx-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
              <th className="px-4 py-3">Article</th>
              <th className="px-4 py-3 text-right">Qté</th>
              <th className="px-4 py-3 text-right">Prix référence</th>
              <th className="px-4 py-3 text-right">Prix vente</th>
              <th className="px-4 py-3 text-right">Montant</th>
              <th className="px-4 py-3">Emplacement</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className="border-b border-onyx-50 last:border-0">
                <td className="px-4 py-2.5 font-medium text-onyx-800">
                  {l.articles?.designation}
                </td>
                <td className="px-4 py-2.5 text-right text-onyx-500">
                  {l.quantite}
                </td>
                <td className="px-4 py-2.5 text-right text-onyx-400">
                  {l.prix_vente_conseille_reference
                    ? l.prix_vente_conseille_reference.toLocaleString("fr-FR")
                    : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-onyx-500">
                  {l.prix_vente_reel.toLocaleString("fr-FR")}
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-onyx-700">
                  {l.montant_ligne.toLocaleString("fr-FR")}
                </td>
                <td className="px-4 py-2.5 text-onyx-500">
                  {l.emplacements?.nom}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5">
        <h2 className="text-sm font-semibold text-onyx-800">Paiements</h2>
        {paiements.length === 0 ? (
          <p className="mt-2 text-sm text-onyx-400">
            Aucun paiement enregistré.
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {paiements.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-onyx-100 bg-white px-4 py-2.5 text-sm"
              >
                <span className="text-onyx-600">
                  {new Date(p.date_paiement).toLocaleDateString("fr-FR")} ·{" "}
                  {p.mode_paiement}
                </span>
                <span className="font-medium text-onyx-800">
                  {p.montant.toLocaleString("fr-FR")} FCFA
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {paiementModalOpen && (
        <Modal
          title="Enregistrer un paiement"
          onClose={() => setPaiementModalOpen(false)}
        >
          <form onSubmit={handleAjouterPaiement} className="space-y-4">
            {error && <InlineBanner message={error} />}
            <p className="text-sm text-onyx-500">
              Reste à payer :{" "}
              <span className="font-medium text-onyx-800">
                {reste.toLocaleString("fr-FR")} FCFA
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
                value={montantPaiement}
                onChange={(e) => setMontantPaiement(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <SelectField
              id="mode-paiement-vente"
              label="Mode de paiement"
              value={modePaiement}
              onChange={(e) => setModePaiement(e.target.value)}
            >
              <option value="Espèces">Espèces</option>
              <option value="Banque">Banque</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Autre">Autre</option>
            </SelectField>
            <div className="flex gap-3 pt-2">
              <SecondaryButton
                type="button"
                onClick={() => setPaiementModalOpen(false)}
                className="flex-1"
              >
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" loading={busy} className="flex-1">
                Enregistrer
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {annulationModalOpen && (
        <SecondPasswordModal
          title="Annuler la vente"
          message={`Cette action restituera au stock les quantités vendues pour ${vente.reference} et ne peut pas être défaite. Les paiements déjà reçus (${vente.montant_paye.toLocaleString("fr-FR")} FCFA) ne seront pas remboursés automatiquement.`}
          onCancel={() => setAnnulationModalOpen(false)}
          onConfirm={annulerVenteAvecMotDePasse}
        />
      )}

      {suppressionBrouillonOpen && (
        <Modal title="Supprimer ce brouillon" onClose={() => setSuppressionBrouillonOpen(false)}>
          <p className="text-sm text-onyx-600">
            Supprimer définitivement le brouillon <strong>{vente.reference}</strong> ?
            Aucun stock n&apos;est engagé pour un brouillon, cette action est
            donc sans risque pour vos données mais reste irréversible.
          </p>
          <div className="mt-5 flex gap-3">
            <SecondaryButton
              onClick={() => setSuppressionBrouillonOpen(false)}
              className="flex-1"
            >
              Annuler
            </SecondaryButton>
            <PrimaryButton
              onClick={supprimerBrouillon}
              loading={busy}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {impressionOpen && (
        <DocumentImprimable
          typeDocument="Facture"
          reference={vente.reference}
          date={vente.date_vente}
          tiersLabel="Client"
          tiersNom={vente.clients?.nom}
          lignes={lignes.map((l) => ({
            designation: l.articles?.designation ?? "",
            quantite: l.quantite,
            prixUnitaire: l.prix_vente_reel,
            montant: l.montant_ligne,
          }))}
          montantTotal={vente.montant_total}
          montantPaye={vente.montant_paye}
          onClose={() => setImpressionOpen(false)}
        />
      )}
    </div>
  );
}
