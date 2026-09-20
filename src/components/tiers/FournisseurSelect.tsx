"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type FournisseurOption = { id: string; nom: string };

export function FournisseurSelect({
  value,
  onChange,
  label = "Fournisseur",
  optionnel = false,
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  optionnel?: boolean;
}) {
  const supabase = createClient();
  const [options, setOptions] = useState<FournisseurOption[]>([]);
  const [modeCreation, setModeCreation] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [creating, setCreating] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("fournisseurs")
      .select("id, nom")
      .eq("statut", "Actif")
      .order("nom")
      .then(({ data }) => {
        if (data) setOptions(data as FournisseurOption[]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function creerFournisseur() {
    if (!nouveauNom.trim()) return;
    setCreating(true);
    setErreur(null);
    const { data, error } = await supabase
      .from("fournisseurs")
      .insert({ nom: nouveauNom.trim() })
      .select("id, nom")
      .single();
    setCreating(false);
    if (error || !data) {
      setErreur(
        error?.code === "23505"
          ? "Un fournisseur porte déjà ce nom."
          : "Impossible de créer ce fournisseur. Réessayez."
      );
      return;
    }
    setOptions((prev) => [...prev, data].sort((a, b) => a.nom.localeCompare(b.nom)));
    onChange(data.id);
    setModeCreation(false);
    setNouveauNom("");
  }

  if (modeCreation) {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-onyx-700">
          {label} — nouveau
        </label>
        {erreur && <p className="mb-1.5 text-xs text-red-600">{erreur}</p>}
        <div className="flex gap-2">
          <input
            autoFocus
            value={nouveauNom}
            onChange={(e) => setNouveauNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                creerFournisseur();
              }
            }}
            placeholder="Nom du fournisseur"
            className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] text-onyx-900 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          />
          <button
            type="button"
            onClick={creerFournisseur}
            disabled={creating}
            className="shrink-0 rounded-lg bg-onyx-900 px-3.5 text-sm font-medium text-white hover:bg-onyx-800 disabled:opacity-60"
          >
            Créer
          </button>
          <button
            type="button"
            onClick={() => {
              setModeCreation(false);
              setNouveauNom("");
              setErreur(null);
            }}
            className="shrink-0 rounded-lg border border-onyx-200 px-3 text-onyx-500 hover:bg-onyx-50"
            aria-label="Annuler"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-onyx-700">
        {label}
      </label>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={!optionnel}
          className="w-full rounded-lg border border-onyx-200 bg-white px-3.5 py-2.5 text-[15px] text-onyx-900 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        >
          <option value="">
            {optionnel ? "— Aucun —" : "— Sélectionner un fournisseur —"}
          </option>
          {options.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nom}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setModeCreation(true)}
          title="Nouveau fournisseur"
          className="flex shrink-0 items-center gap-1 rounded-lg border border-onyx-200 px-3 text-sm text-onyx-600 hover:bg-onyx-50"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
