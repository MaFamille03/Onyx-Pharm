"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, ArrowLeft, CheckCircle2, Trash2, Printer, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner, StatutBadge } from "@/components/ui/Badges";
import { PinModal } from "@/components/securite/PinModal";
import { InventairePrintable } from "@/components/inventaires/InventairePrintable";
import { ArticleSelect } from "@/components/articles/ArticleSelect";
import { useReferenceData } from "@/lib/hooks/useReferenceData";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

type InventaireRow = {
  id: string;
  reference: string;
  statut: string;
  created_at: string;
  date_inventaire: string;
  emplacement_id: string;
  emplacements: { nom: string } | null;
};

type LigneRow = {
  id: string;
  article_id: string;
  quantite_theorique: number;
  quantite_reelle: number;
  ecart: number;
  observation: string | null;
  articles: { designation: string } | null;
};

export function InventairesManager({ embarque }: { embarque?: boolean } = {}) {
  const supabase = createClient();
  const { emplacements } = useReferenceData();
  const emplacementsActifs = emplacements.filter((e) => e.actif);

  const [inventaires, setInventaires] = useState<InventaireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ouvert, setOuvert] = useState<InventaireRow | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [emplacementId, setEmplacementId] = useState("");
  const [dateInventaire, setDateInventaire] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("inventaires")
      .select("id, reference, statut, created_at, date_inventaire, emplacement_id, emplacements(nom)")
      .order("created_at", { ascending: false });
    if (data) setInventaires(data as unknown as InventaireRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(["inventaires"], load);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!emplacementId) {
      setError("Choisissez un emplacement.");
      return;
    }
    setCreating(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: refData, error: refError } = await supabase.rpc(
      "generer_numero_document",
      { p_prefixe: "INV" }
    );
    if (refError || !refData) {
      setError(
        logSupabaseError(
          { table: "numero_sequences", operation: "rpc generer_numero_document" },
          refError,
          "Impossible de générer la référence. Réessayez."
        )
      );
      setCreating(false);
      return;
    }

    const { data: inventaire, error: invError } = await supabase
      .from("inventaires")
      .insert({
        reference: refData,
        emplacement_id: emplacementId,
        date_inventaire: dateInventaire,
        statut: "Brouillon",
        created_by: user?.id ?? null,
      })
      .select("id, reference, statut, created_at, date_inventaire, emplacement_id, emplacements(nom)")
      .single();

    if (invError || !inventaire) {
      setError(
        logSupabaseError(
          { table: "inventaires", operation: "insert" },
          invError,
          "Impossible de créer l'inventaire. Réessayez."
        )
      );
      setCreating(false);
      return;
    }

    const { data: articles } = await supabase
      .from("articles")
      .select("id, stocks(emplacement_id, quantite)")
      .eq("statut", "Actif");

    if (articles && articles.length > 0) {
      const lignes = (
        articles as unknown as {
          id: string;
          stocks: { emplacement_id: string; quantite: number }[];
        }[]
      )
        .map((a) => {
          const theorique = a.stocks
            .filter((s) => s.emplacement_id === emplacementId)
            .reduce((sum, s) => sum + s.quantite, 0);
          return {
            inventaire_id: inventaire.id,
            article_id: a.id,
            quantite_theorique: theorique,
            quantite_reelle: theorique,
          };
        })
        // Seuls les articles déjà présents dans cet emplacement sont
        // proposés au comptage — pour ne pas mélanger tout le
        // catalogue avec ce qui est réellement sur place. Un article
        // nouvellement arrivé doit d'abord y être placé par un
        // mouvement de stock (Stock > bouton Mouvements).
        .filter((l) => l.quantite_theorique > 0);

      if (lignes.length > 0) {
        const { error: lignesError } = await supabase
          .from("inventaire_lignes")
          .insert(lignes);

        if (lignesError) {
          setCreating(false);
          setError(
            logSupabaseError(
              { table: "inventaire_lignes", operation: "insert" },
              lignesError,
              "L'inventaire a été créé mais ses lignes n'ont pas pu être générées. Réessayez."
            )
          );
          return;
        }
      }
    }

    setCreating(false);
    setModalOpen(false);
    load();
    setOuvert(inventaire as unknown as InventaireRow);
  }

  if (ouvert) {
    return (
      <InventaireDetail
        inventaire={ouvert}
        onBack={() => {
          setOuvert(null);
          load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {!embarque && (
            <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
              Inventaires
            </h1>
          )}
          <p className="mt-1 text-sm text-onyx-500">
            Comptez le stock réel par emplacement et ajustez les écarts.
          </p>
        </div>
        <PrimaryButton
          onClick={() => {
            setEmplacementId("");
            setDateInventaire(new Date().toISOString().slice(0, 10));
            setError(null);
            setModalOpen(true);
          }}
          className="shrink-0"
        >
          <Plus size={17} />
          Nouvel inventaire
        </PrimaryButton>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-onyx-400">
            Chargement...
          </p>
        ) : inventaires.length === 0 ? (
          <div className="rounded-xl border border-dashed border-onyx-200 bg-white py-14 text-center">
            <p className="text-sm font-medium text-onyx-600">
              Aucun inventaire pour le moment
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {inventaires.map((inv) => (
              <button
                key={inv.id}
                onClick={() => setOuvert(inv)}
                className="flex w-full items-center justify-between rounded-xl border border-onyx-100 bg-white p-4 text-left hover:bg-onyx-50/50"
              >
                <div>
                  <p className="font-medium text-onyx-900">
                    {inv.reference} — {inv.emplacements?.nom}
                  </p>
                  <p className="text-xs text-onyx-400">
                    {new Date(inv.date_inventaire).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <StatutBadge statut={inv.statut} />
              </button>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <Modal title="Nouvel inventaire" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            {error && <InlineBanner message={error} />}
            <SelectField
              id="emplacement-inventaire"
              label="Emplacement à inventorier"
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
                Date de l&apos;inventaire
              </label>
              <input
                type="date"
                required
                value={dateInventaire}
                onChange={(e) => setDateInventaire(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
            <p className="text-xs text-onyx-400">
              Toutes les quantités théoriques actuelles seront chargées
              automatiquement ; vous n&apos;aurez plus qu&apos;à saisir les
              quantités réellement comptées.
            </p>
            <div className="flex gap-3 pt-2">
              <SecondaryButton
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1"
              >
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" loading={creating} className="flex-1">
                Démarrer l&apos;inventaire
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function InventaireDetail({
  inventaire,
  onBack,
}: {
  inventaire: InventaireRow;
  onBack: () => void;
}) {
  const supabase = createClient();
  const [lignes, setLignes] = useState<LigneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modifs, setModifs] = useState<Record<string, string>>({});
  const [suppressionOpen, setSuppressionOpen] = useState(false);
  const [impressionOpen, setImpressionOpen] = useState(false);
  const [ajoutArticleOuvert, setAjoutArticleOuvert] = useState(false);
  const [nouvelArticleId, setNouvelArticleId] = useState("");
  const [nouvelleQuantiteReelle, setNouvelleQuantiteReelle] = useState("");
  const [ajoutError, setAjoutError] = useState<string | null>(null);
  const [ajoutSaving, setAjoutSaving] = useState(false);
  const [correctionLigne, setCorrectionLigne] = useState<{
    id: string;
    quantite_reelle: number;
    articles: { designation: string } | null;
  } | null>(null);
  const [correctionValeur, setCorrectionValeur] = useState("");

  const estBrouillon = inventaire.statut === "Brouillon";

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("inventaire_lignes")
      .select(
        "id, article_id, quantite_theorique, quantite_reelle, ecart, observation, articles(designation)"
      )
      .eq("inventaire_id", inventaire.id)
      .order("id");
    if (data) setLignes(data as unknown as LigneRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventaire.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function enregistrerComptages() {
    setSaving(true);
    setError(null);
    const entries = Object.entries(modifs);
    for (const [ligneId, valeur] of entries) {
      await supabase
        .from("inventaire_lignes")
        .update({ quantite_reelle: Number(valeur) })
        .eq("id", ligneId);
    }
    setModifs({});
    setSaving(false);
    load();
  }

  async function confirmerAjoutArticle(e: React.FormEvent) {
    e.preventDefault();
    if (!nouvelArticleId) {
      setAjoutError("Choisissez un article.");
      return;
    }
    const qte = Number(nouvelleQuantiteReelle);
    if (Number.isNaN(qte) || qte < 0) {
      setAjoutError("Quantité invalide.");
      return;
    }
    if (lignes.some((l) => l.article_id === nouvelArticleId)) {
      setAjoutError("Cet article est déjà dans cet inventaire.");
      return;
    }

    setAjoutSaving(true);
    setAjoutError(null);

    // La quantité théorique reprend le stock actuellement enregistré
    // pour cet article dans cet emplacement (0 s'il n'y en avait pas
    // encore — l'article vient peut-être d'y arriver physiquement,
    // avant même qu'un mouvement de stock ne l'y ait enregistré).
    const { data: stockActuel } = await supabase
      .from("stocks")
      .select("quantite")
      .eq("article_id", nouvelArticleId)
      .eq("emplacement_id", inventaire.emplacement_id);
    const theorique = (stockActuel ?? []).reduce((s, l) => s + l.quantite, 0);

    const { error } = await supabase.from("inventaire_lignes").insert({
      inventaire_id: inventaire.id,
      article_id: nouvelArticleId,
      quantite_theorique: theorique,
      quantite_reelle: qte,
    });

    setAjoutSaving(false);
    if (error) {
      setAjoutError(
        logSupabaseError(
          { table: "inventaire_lignes", operation: "insert (ajout manuel)" },
          error,
          "Impossible d'ajouter cet article."
        )
      );
      return;
    }

    setAjoutArticleOuvert(false);
    setNouvelArticleId("");
    setNouvelleQuantiteReelle("");
    load();
  }

  async function validerInventaire() {
    if (Object.keys(modifs).length > 0) {
      await enregistrerComptages();
    }
    setValidating(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.rpc("valider_inventaire", {
      p_inventaire_id: inventaire.id,
      p_utilisateur_id: user?.id ?? null,
    });

    setValidating(false);

    if (error) {
      setError(
        logSupabaseError(
          { table: "inventaires", operation: "rpc valider_inventaire" },
          error,
          "Impossible de valider l'inventaire. Réessayez."
        )
      );
      return;
    }

    onBack();
  }

  async function confirmerSuppression(pin: string) {
    const { error } = await supabase.rpc("supprimer_inventaire", {
      p_inventaire_id: inventaire.id,
      p_pin: estBrouillon ? null : pin,
    });
    if (error) {
      throw new Error(
        logSupabaseError(
          { table: "inventaires", operation: "rpc supprimer_inventaire" },
          error,
          "Impossible de supprimer cet inventaire."
        )
      );
    }
    setSuppressionOpen(false);
    onBack();
  }

  async function confirmerCorrectionLigne(pin: string) {
    if (!correctionLigne) return;
    const val = Number(correctionValeur);
    if (Number.isNaN(val) || val < 0) {
      throw new Error("Quantité invalide.");
    }
    const { error } = await supabase.rpc("corriger_ligne_inventaire_validee", {
      p_ligne_id: correctionLigne.id,
      p_nouvelle_quantite_reelle: val,
      p_pin: pin,
    });
    if (error) {
      throw new Error(
        logSupabaseError(
          { table: "inventaire_lignes", operation: "rpc corriger_ligne_inventaire_validee" },
          error,
          "Impossible de corriger cette ligne."
        )
      );
    }
    setCorrectionLigne(null);
    load();
  }

  const totalEcarts = lignes.filter((l) => {
    const val =
      modifs[l.id] !== undefined ? Number(modifs[l.id]) : l.quantite_reelle;
    return val !== l.quantite_theorique;
  }).length;

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-onyx-500 hover:text-onyx-800"
      >
        <ArrowLeft size={16} />
        Retour aux inventaires
      </button>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-onyx-900 sm:text-2xl">
          {inventaire.reference}
          <StatutBadge statut={inventaire.statut} />
        </h1>
        <p className="mt-1 text-sm text-onyx-500">
          Emplacement : {inventaire.emplacements?.nom} · {totalEcarts} écart
          {totalEcarts !== 1 ? "s" : ""} détecté{totalEcarts !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <SecondaryButton onClick={() => setImpressionOpen(true)}>
          <Printer size={16} />
          Exporter en PDF
        </SecondaryButton>
        <SecondaryButton
          onClick={() => setSuppressionOpen(true)}
          className="border-red-200 text-red-600 hover:bg-red-50"
        >
          <Trash2 size={16} />
          Supprimer
        </SecondaryButton>
        {estBrouillon && (
          <>
            <SecondaryButton
              onClick={() => {
                setAjoutError(null);
                setNouvelArticleId("");
                setNouvelleQuantiteReelle("");
                setAjoutArticleOuvert(true);
              }}
            >
              <Plus size={16} />
              Ajouter un article
            </SecondaryButton>
            <SecondaryButton
              onClick={enregistrerComptages}
              loading={saving}
              disabled={Object.keys(modifs).length === 0}
            >
              Enregistrer les comptages
            </SecondaryButton>
            <PrimaryButton onClick={validerInventaire} loading={validating}>
              <CheckCircle2 size={16} />
              Valider l&apos;inventaire
            </PrimaryButton>
          </>
        )}
      </div>

      {estBrouillon && (
        <p className="mt-1 text-xs text-onyx-400">
          &quot;Enregistrer les comptages&quot; sauvegarde ce que vous avez
          saisi sans clôturer l&apos;inventaire ni toucher au stock — utile
          pour reprendre plus tard. &quot;Valider l&apos;inventaire&quot;
          enregistre aussi vos comptages, puis corrige définitivement le
          stock selon les écarts constatés.
        </p>
      )}

      {error && (
        <div className="mt-3">
          <InlineBanner message={error} />
        </div>
      )}

      {!estBrouillon && (
        <div className="mt-3">
          <InlineBanner
            type="success"
            message="Cet inventaire a été validé : le stock a été ajusté en conséquence."
          />
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-onyx-400">
            Chargement...
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-onyx-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                  <th className="px-4 py-3">Article</th>
                  <th className="px-4 py-3 text-right">Théorique</th>
                  <th className="px-4 py-3 text-right">Réel</th>
                  <th className="px-4 py-3 text-right">Écart</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => {
                  const valeurAffichee =
                    modifs[l.id] !== undefined
                      ? modifs[l.id]
                      : String(l.quantite_reelle);
                  const ecartAffiche =
                    Number(valeurAffichee) - l.quantite_theorique;
                  return (
                    <tr
                      key={l.id}
                      className="border-b border-onyx-50 last:border-0"
                    >
                      <td className="px-4 py-2.5 font-medium text-onyx-800">
                        {l.articles?.designation}
                      </td>
                      <td className="px-4 py-2.5 text-right text-onyx-500">
                        {l.quantite_theorique}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {estBrouillon ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={valeurAffichee}
                            onChange={(e) =>
                              setModifs({ ...modifs, [l.id]: e.target.value })
                            }
                            className="w-20 rounded-md border border-onyx-200 px-2 py-1 text-right text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            {l.quantite_reelle}
                            <button
                              onClick={() => {
                                setCorrectionLigne(l);
                                setCorrectionValeur(String(l.quantite_reelle));
                              }}
                              className="rounded p-0.5 text-onyx-400 hover:bg-onyx-100 hover:text-onyx-700"
                              aria-label="Corriger cette quantité comptée"
                            >
                              <Pencil size={13} />
                            </button>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={`font-medium ${
                            ecartAffiche === 0
                              ? "text-onyx-400"
                              : ecartAffiche > 0
                                ? "text-emerald-600"
                                : "text-red-500"
                          }`}
                        >
                          {ecartAffiche > 0 ? "+" : ""}
                          {ecartAffiche}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {suppressionOpen && estBrouillon && (
        <Modal title="Supprimer cet inventaire" onClose={() => setSuppressionOpen(false)}>
          <p className="text-sm text-onyx-600">
            Supprimer définitivement l&apos;inventaire{" "}
            <strong>{inventaire.reference}</strong> ? Ce brouillon n&apos;a
            encore modifié aucun stock, la suppression est donc sans risque
            mais irréversible.
          </p>
          <div className="mt-5 flex gap-3">
            <SecondaryButton onClick={() => setSuppressionOpen(false)} className="flex-1">
              Annuler
            </SecondaryButton>
            <PrimaryButton
              onClick={() => confirmerSuppression("")}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {suppressionOpen && !estBrouillon && (
        <PinModal
          title="Supprimer cet inventaire"
          message={`Cet inventaire est déjà validé : le supprimer annulera les ${totalEcarts} écart(s) déjà appliqué(s) au stock. Cette action est irréversible.`}
          onCancel={() => setSuppressionOpen(false)}
          onConfirm={confirmerSuppression}
        />
      )}

      {ajoutArticleOuvert && (
        <Modal title="Ajouter un article à l'inventaire" onClose={() => setAjoutArticleOuvert(false)}>
          <form onSubmit={confirmerAjoutArticle} className="space-y-4">
            {ajoutError && <InlineBanner message={ajoutError} />}
            <ArticleSelect value={nouvelArticleId} onChange={setNouvelArticleId} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Quantité comptée
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={nouvelleQuantiteReelle}
                onChange={(e) => setNouvelleQuantiteReelle(e.target.value)}
                className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
              <p className="mt-1 text-xs text-onyx-400">
                La quantité théorique reprend automatiquement ce qui est
                déjà enregistré pour cet article dans cet emplacement
                (souvent 0, si l&apos;article vient d&apos;y arriver
                physiquement).
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <SecondaryButton
                type="button"
                onClick={() => setAjoutArticleOuvert(false)}
                className="flex-1"
              >
                Annuler
              </SecondaryButton>
              <PrimaryButton type="submit" loading={ajoutSaving} className="flex-1">
                Ajouter
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {correctionLigne && (
        <PinModal
          title="Corriger cette quantité comptée"
          message={`Nouvelle quantité comptée pour "${correctionLigne.articles?.designation}" (actuellement ${correctionLigne.quantite_reelle}). Cet inventaire est déjà validé : le stock sera ajusté automatiquement selon la différence.`}
          onCancel={() => setCorrectionLigne(null)}
          onConfirm={confirmerCorrectionLigne}
        >
          <input
            type="number"
            min="0"
            step="1"
            value={correctionValeur}
            onChange={(e) => setCorrectionValeur(e.target.value)}
            className="mt-3 w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          />
        </PinModal>
      )}

      {impressionOpen && (
        <InventairePrintable
          reference={inventaire.reference}
          dateInventaire={inventaire.date_inventaire}
          emplacementNom={inventaire.emplacements?.nom ?? "—"}
          statut={inventaire.statut}
          lignes={lignes.map((l) => ({
            designation: l.articles?.designation ?? "",
            quantite_theorique: l.quantite_theorique,
            quantite_reelle:
              modifs[l.id] !== undefined ? Number(modifs[l.id]) : l.quantite_reelle,
            ecart:
              (modifs[l.id] !== undefined ? Number(modifs[l.id]) : l.quantite_reelle) -
              l.quantite_theorique,
          }))}
          onClose={() => setImpressionOpen(false)}
        />
      )}
    </div>
  );
}
