"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, ArrowUpCircle, ArrowDownCircle, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { ClientSelect } from "@/components/tiers/ClientSelect";
import { FournisseurSelect } from "@/components/tiers/FournisseurSelect";

type OperationRow = {
  id: string;
  reference: string;
  date_operation: string;
  montant: number;
  mode_paiement: string;
  categorie: string | null;
  description: string | null;
  vente_id?: string | null;
  achat_id?: string | null;
  clients?: { nom: string } | null;
  fournisseurs?: { nom: string } | null;
  ventes?: { reference: string } | null;
  achats?: { reference: string } | null;
};

export function CaisseManager({
  type,
  titre,
  prefixe,
}: {
  type: "encaissement" | "decaissement";
  titre: string;
  prefixe: "ENC" | "DEC";
}) {
  const supabase = createClient();
  const table = type === "encaissement" ? "encaissements" : "decaissements";
  const isEncaissement = type === "encaissement";

  const [operations, setOperations] = useState<OperationRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("Espèces");
  const [categorie, setCategorie] = useState("Autre");
  const [description, setDescription] = useState("");
  const [tiersId, setTiersId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relationTiers = isEncaissement ? "clients(nom)" : "fournisseurs(nom)";
  const relationDocument = isEncaissement
    ? "ventes(reference)"
    : "achats(reference)";

  const load = useCallback(async () => {
    setLoading(true);
    const [opsRes, catRes] = await Promise.all([
      supabase
        .from(table)
        .select(
          `id, reference, date_operation, montant, mode_paiement, categorie, description, ${relationTiers}, ${relationDocument}`
        )
        .order("date_operation", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("parametres_options")
        .select("valeur")
        .eq("groupe", "categorie_caisse")
        .eq("actif", true)
        .order("ordre"),
    ]);
    if (opsRes.data) setOperations(opsRes.data as unknown as OperationRow[]);
    if (catRes.data) setCategories(catRes.data.map((c) => c.valeur));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setMontant("");
    setMode("Espèces");
    setCategorie(isEncaissement ? "Autre" : "Dépense");
    setDescription("");
    setTiersId("");
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const val = Number(montant);
    if (!val || val <= 0) {
      setError("Montant invalide.");
      return;
    }

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: refData, error: refError } = await supabase.rpc(
      "generer_numero_document",
      { p_prefixe: prefixe }
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

    const payload: Record<string, unknown> = {
      reference: refData,
      montant: val,
      mode_paiement: mode,
      categorie,
      description: description.trim() || null,
      created_by: user?.id ?? null,
    };
    if (isEncaissement) payload.client_id = tiersId || null;
    else payload.fournisseur_id = tiersId || null;

    const { error } = await supabase.from(table).insert(payload);

    setSaving(false);
    if (error) {
      setError(
        logSupabaseError(
          { table, operation: "insert" },
          error,
          "Impossible d'enregistrer cette opération. Réessayez."
        )
      );
      return;
    }
    setModalOpen(false);
    load();
  }

  const filtres = operations.filter((o) => {
    if (
      search &&
      !`${o.description ?? ""} ${o.reference}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    if (filtreCategorie && o.categorie !== filtreCategorie) return false;
    return true;
  });

  const totalAffiche = filtres.reduce((s, o) => s + o.montant, 0);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
            {titre}
          </h1>
          <p className="mt-1 text-sm text-onyx-500">
            {isEncaissement
              ? "Toutes les sommes reçues (ventes et autres entrées)."
              : "Toutes les sommes sorties (achats et autres dépenses)."}
          </p>
        </div>
        <PrimaryButton onClick={openCreate} className="shrink-0">
          <Plus size={17} />
          {isEncaissement ? "Nouvel encaissement" : "Nouveau décaissement"}
        </PrimaryButton>
      </div>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-onyx-300"
          />
          <input
            type="search"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-onyx-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          />
        </div>
        <select
          value={filtreCategorie}
          onChange={(e) => setFiltreCategorie(e.target.value)}
          className="rounded-lg border border-onyx-200 px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="ml-auto text-sm font-medium text-onyx-600">
          Total affiché :{" "}
          <span
            className={isEncaissement ? "text-emerald-600" : "text-red-500"}
          >
            {totalAffiche.toLocaleString("fr-FR")} FCFA
          </span>
        </p>
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-onyx-400">
            Chargement...
          </p>
        ) : filtres.length === 0 ? (
          <div className="rounded-xl border border-dashed border-onyx-200 bg-white py-14 text-center">
            <p className="text-sm font-medium text-onyx-600">
              Aucune opération pour le moment
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-onyx-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-onyx-50 last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-onyx-500">
                      {new Date(o.date_operation).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-2.5 text-onyx-700">
                      {o.description ||
                        o.ventes?.reference ||
                        o.achats?.reference ||
                        o.reference}
                      {(o.clients?.nom || o.fournisseurs?.nom) && (
                        <span className="text-onyx-400">
                          {" "}
                          — {o.clients?.nom || o.fournisseurs?.nom}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-onyx-500">
                      {o.categorie || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-onyx-500">
                      {o.mode_paiement}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          isEncaissement ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {isEncaissement ? (
                          <ArrowUpCircle size={13} />
                        ) : (
                          <ArrowDownCircle size={13} />
                        )}
                        {o.montant.toLocaleString("fr-FR")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <Modal
          title={
            isEncaissement ? "Nouvel encaissement" : "Nouveau décaissement"
          }
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <InlineBanner message={error} />}

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
              id="mode-caisse"
              label="Mode de paiement"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="Espèces">Espèces</option>
              <option value="Banque">Banque</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Autre">Autre</option>
            </SelectField>

            <SelectField
              id="categorie-caisse"
              label="Catégorie"
              value={categorie}
              onChange={(e) => setCategorie(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>

            {isEncaissement ? (
              <ClientSelect value={tiersId} onChange={setTiersId} />
            ) : (
              <FournisseurSelect
                value={tiersId}
                onChange={setTiersId}
                optionnel
              />
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-onyx-700">
                Description
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex : loyer, électricité, apport personnel..."
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
                Enregistrer
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
