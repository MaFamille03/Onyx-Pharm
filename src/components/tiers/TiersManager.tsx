"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, Phone, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/auth/FormField";
import { TextareaField, SelectField } from "@/components/ui/FormControls";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { StatutBadge, InlineBanner } from "@/components/ui/Badges";
import { PinModal } from "@/components/securite/PinModal";

type Tier = {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  observations: string | null;
  statut: string;
  created_at: string;
};

const EMPTY_FORM = {
  nom: "",
  telephone: "",
  email: "",
  adresse: "",
  observations: "",
  statut: "Actif",
};

export function TiersManager({
  table,
  titreSingulier,
  titrePluriel,
  description,
}: {
  table: "clients" | "fournisseurs";
  titreSingulier: string;
  titrePluriel: string;
  description: string;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteItem, setDeleteItem] = useState<Tier | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("nom", { ascending: true });
    if (!error && data) setItems(data as Tier[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: Tier) {
    setEditingId(item.id);
    setForm({
      nom: item.nom,
      telephone: item.telephone ?? "",
      email: item.email ?? "",
      adresse: item.adresse ?? "",
      observations: item.observations ?? "",
      statut: item.statut,
    });
    setError(null);
    setModalOpen(true);
  }

  async function confirmerSuppression(pin: string) {
    if (!deleteItem) return;
    const ok = await supabase.rpc("verifier_pin_securite", { p_pin: pin });
    if (ok.error || !ok.data) {
      throw new Error("Code PIN incorrect.");
    }
    const { error } = await supabase.from(table).delete().eq("id", deleteItem.id);
    if (error) {
      throw new Error(
        error.code === "23503"
          ? `Ce ${titreSingulier} est utilisé ailleurs (ventes, conteneurs...) et ne peut pas être supprimé.`
          : logSupabaseError(
              { table, operation: "delete" },
              error,
              `Impossible de supprimer ce ${titreSingulier}. Réessayez.`
            )
      );
    }
    setDeleteItem(null);
    load();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      nom: form.nom.trim(),
      telephone: form.telephone.trim() || null,
      email: form.email.trim() || null,
      adresse: form.adresse.trim() || null,
      observations: form.observations.trim() || null,
      statut: form.statut,
    };

    if (editingId) {
      const { error } = await supabase
        .from(table)
        .update(payload)
        .eq("id", editingId);
      if (error) {
        setError(
          logSupabaseError(
            { table, operation: "update" },
            error,
            "Impossible d'enregistrer les modifications. Réessayez."
          )
        );
        setSaving(false);
        return;
      }
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from(table)
        .insert({ ...payload, created_by: user?.id ?? null });
      if (error) {
        setError(
          logSupabaseError(
            { table, operation: "insert" },
            error,
            "Impossible de créer l'enregistrement. Réessayez."
          )
        );
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setModalOpen(false);
    load();
  }

  const filtered = items.filter((item) =>
    `${item.nom} ${item.telephone ?? ""} ${item.email ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
            {titrePluriel}
          </h1>
          <p className="mt-1 text-sm text-onyx-500">{description}</p>
        </div>
        <PrimaryButton onClick={openCreate} className="shrink-0">
          <Plus size={17} />
          Nouveau {titreSingulier.toLowerCase()}
        </PrimaryButton>
      </div>

      <div className="relative mt-5 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-onyx-300"
        />
        <input
          type="search"
          placeholder={`Rechercher un ${titreSingulier.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-onyx-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        />
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-onyx-400">
            Chargement...
          </p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-onyx-200 bg-white py-14 text-center">
            <p className="text-sm font-medium text-onyx-600">
              Aucun {titreSingulier.toLowerCase()} pour le moment
            </p>
            <p className="mt-1 text-sm text-onyx-400">
              Cliquez sur « Nouveau {titreSingulier.toLowerCase()} » pour en
              ajouter un.
            </p>
          </div>
        ) : (
          <>
            {/* Vue cartes (mobile) */}
            <div className="grid grid-cols-1 gap-3 sm:hidden">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => openEdit(item)}
                  className="rounded-xl border border-onyx-100 bg-white p-4 text-left active:bg-onyx-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-onyx-900">{item.nom}</p>
                    <div className="flex items-center gap-1.5">
                      <StatutBadge statut={item.statut} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteItem(item);
                        }}
                        className="rounded-md p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Supprimer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-onyx-500">
                    {item.telephone && (
                      <p className="flex items-center gap-1.5">
                        <Phone size={13} /> {item.telephone}
                      </p>
                    )}
                    {item.email && (
                      <p className="flex items-center gap-1.5">
                        <Mail size={13} /> {item.email}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Vue tableau (desktop) */}
            <div className="hidden overflow-hidden rounded-xl border border-onyx-100 bg-white sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-onyx-100 bg-onyx-50/50 text-left text-xs font-medium uppercase tracking-wide text-onyx-400">
                    <th className="px-4 py-3">Nom</th>
                    <th className="px-4 py-3">Téléphone</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-onyx-50 last:border-0 hover:bg-onyx-50/40"
                    >
                      <td className="px-4 py-3 font-medium text-onyx-800">
                        {item.nom}
                      </td>
                      <td className="px-4 py-3 text-onyx-500">
                        {item.telephone || "—"}
                      </td>
                      <td className="px-4 py-3 text-onyx-500">
                        {item.email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatutBadge statut={item.statut} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="rounded-md p-1.5 text-onyx-400 hover:bg-onyx-100 hover:text-onyx-700"
                            aria-label="Modifier"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteItem(item)}
                            className="rounded-md p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Supprimer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <Modal
          title={editingId ? `Modifier le ${titreSingulier.toLowerCase()}` : `Nouveau ${titreSingulier.toLowerCase()}`}
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <InlineBanner message={error} />}

            <FormField
              id="nom"
              label="Nom"
              required
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              placeholder="Nom complet ou raison sociale"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                id="telephone"
                label="Téléphone"
                type="tel"
                value={form.telephone}
                onChange={(e) =>
                  setForm({ ...form, telephone: e.target.value })
                }
                placeholder="07 00 00 00 00"
              />
              <FormField
                id="email"
                label="E-mail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contact@exemple.com"
              />
            </div>

            <TextareaField
              id="adresse"
              label="Adresse"
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
              placeholder="Adresse complète"
            />

            <TextareaField
              id="observations"
              label="Observations"
              value={form.observations}
              onChange={(e) =>
                setForm({ ...form, observations: e.target.value })
              }
              placeholder="Notes internes (optionnel)"
            />

            <SelectField
              id="statut"
              label="Statut"
              value={form.statut}
              onChange={(e) => setForm({ ...form, statut: e.target.value })}
            >
              <option value="Actif">Actif</option>
              <option value="Inactif">Inactif</option>
            </SelectField>

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

      {deleteItem && (
        <PinModal
          title={`Supprimer ce ${titreSingulier}`}
          message={`Supprimer définitivement "${deleteItem.nom}" ? Cette action est irréversible.`}
          onCancel={() => setDeleteItem(null)}
          onConfirm={confirmerSuppression}
        />
      )}
    </div>
  );
}
