"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "@/components/auth/FormField";
import { TextareaField } from "@/components/ui/FormControls";
import { PrimaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

type EntrepotInfo = {
  nom: string;
  adresse: string;
  telephone: string;
  responsable: string;
  horaires: string;
  capacite: string;
  observations: string;
};

const VIDE: EntrepotInfo = {
  nom: "",
  adresse: "",
  telephone: "",
  responsable: "",
  horaires: "",
  capacite: "",
  observations: "",
};

export function EntrepotSection() {
  const supabase = createClient();
  const [form, setForm] = useState<EntrepotInfo>(VIDE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("parametres_generaux")
      .select("valeur")
      .eq("cle", "entrepot_info")
      .maybeSingle();
    if (data?.valeur)
      setForm({ ...VIDE, ...(data.valeur as unknown as EntrepotInfo) });
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    await supabase
      .from("parametres_generaux")
      .update({ valeur: form })
      .eq("cle", "entrepot_info");
    setSaving(false);
    setSuccess(true);
  }

  if (loading) {
    return (
      <p className="py-6 text-center text-sm text-onyx-400">Chargement...</p>
    );
  }

  return (
    <div className="rounded-xl border border-onyx-100 bg-white p-4">
      <h3 className="text-sm font-semibold text-onyx-800">
        Informations de l&apos;entrepôt
      </h3>
      <p className="mt-1 text-xs text-onyx-400">
        Ces champs sont volontairement vides tant que les informations
        officielles n&apos;ont pas été transmises — complétez-les dès que
        possible.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {success && (
          <InlineBanner type="success" message="Informations enregistrées." />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            id="entrepot-nom"
            label="Nom"
            value={form.nom}
            onChange={(e) => setForm({ ...form, nom: e.target.value })}
            placeholder="Ex : Entrepôt principal"
          />
          <FormField
            id="entrepot-responsable"
            label="Responsable"
            value={form.responsable}
            onChange={(e) =>
              setForm({ ...form, responsable: e.target.value })
            }
          />
          <FormField
            id="entrepot-telephone"
            label="Téléphone"
            value={form.telephone}
            onChange={(e) => setForm({ ...form, telephone: e.target.value })}
          />
          <FormField
            id="entrepot-horaires"
            label="Horaires"
            value={form.horaires}
            onChange={(e) => setForm({ ...form, horaires: e.target.value })}
          />
          <FormField
            id="entrepot-capacite"
            label="Capacité"
            value={form.capacite}
            onChange={(e) => setForm({ ...form, capacite: e.target.value })}
          />
        </div>

        <TextareaField
          id="entrepot-adresse"
          label="Adresse"
          value={form.adresse}
          onChange={(e) => setForm({ ...form, adresse: e.target.value })}
        />

        <TextareaField
          id="entrepot-observations"
          label="Observations"
          value={form.observations}
          onChange={(e) =>
            setForm({ ...form, observations: e.target.value })
          }
        />

        <PrimaryButton type="submit" loading={saving}>
          Enregistrer
        </PrimaryButton>
      </form>
    </div>
  );
}
