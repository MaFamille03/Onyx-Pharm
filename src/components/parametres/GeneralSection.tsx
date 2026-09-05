"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { PrimaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { RevoirPresentationButton } from "@/components/onboarding/OnboardingTour";

type EntrepriseInfo = {
  nom: string;
  activite: string;
  telephone: string;
  email: string;
  logo_url: string;
};

export function GeneralSection() {
  const supabase = createClient();
  const [info, setInfo] = useState<EntrepriseInfo | null>(null);
  const [dateConception, setDateConception] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [entrepriseRes, dateRes] = await Promise.all([
      supabase
        .from("parametres_generaux")
        .select("valeur")
        .eq("cle", "entreprise_info")
        .maybeSingle(),
      supabase
        .from("parametres_generaux")
        .select("valeur")
        .eq("cle", "date_conception_site")
        .maybeSingle(),
    ]);
    if (entrepriseRes.data?.valeur)
      setInfo(entrepriseRes.data.valeur as unknown as EntrepriseInfo);
    if (typeof dateRes.data?.valeur === "string") setDateConception(dateRes.data.valeur);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveDate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);
    const { error } = await supabase
      .from("parametres_generaux")
      .update({ valeur: dateConception })
      .eq("cle", "date_conception_site");
    setSaving(false);
    if (error) {
      setError(
        logSupabaseError(
          { table: "parametres_generaux", operation: "update" },
          error,
          "Impossible d'enregistrer la date. Réessayez."
        )
      );
      return;
    }
    setSuccess(true);
  }

  if (loading) {
    return (
      <p className="py-6 text-center text-sm text-onyx-400">Chargement...</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-onyx-100 bg-white p-4">
        <h3 className="text-sm font-semibold text-onyx-800">Entreprise</h3>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-onyx-100 bg-white p-2">
            <Image
              src={info?.logo_url || "/onyx-pharm-icon.png"}
              alt="Logo ONYX PHARM"
              width={56}
              height={56}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium text-onyx-800">{info?.nom}</p>
            <p className="text-onyx-500">{info?.activite}</p>
            <p className="text-onyx-500">{info?.telephone}</p>
            <p className="text-onyx-500">{info?.email}</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-onyx-400">
          Informations reprises du catalogue officiel ONYX PHARM. Pour toute
          mise à jour (logo, coordonnées), transmettez les nouveaux éléments
          pour intégration.
        </p>
      </div>

      <div className="rounded-xl border border-onyx-100 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-onyx-50 text-onyx-500">
            <Calendar size={16} />
          </div>
          <h3 className="text-sm font-semibold text-onyx-800">
            Date de conception du site
          </h3>
        </div>
        <p className="mt-1.5 text-xs text-onyx-400">
          Affichée dans l&apos;application. Non renseignée par défaut —
          indiquez-la vous-même.
        </p>
        <form onSubmit={handleSaveDate} className="mt-3 flex max-w-xs items-end gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-onyx-700">
              Date
            </label>
            <input
              type="date"
              value={dateConception}
              onChange={(e) => setDateConception(e.target.value)}
              className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <PrimaryButton type="submit" loading={saving}>
            Enregistrer
          </PrimaryButton>
        </form>
        {error && (
          <div className="mt-3">
            <InlineBanner message={error} />
          </div>
        )}
        {success && (
          <div className="mt-3">
            <InlineBanner type="success" message="Date enregistrée." />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-onyx-100 bg-white p-4">
        <h3 className="text-sm font-semibold text-onyx-800">
          Présentation de l&apos;application
        </h3>
        <p className="mt-1 text-xs text-onyx-400">
          Revoyez à tout moment la présentation des modules affichée aux
          nouveaux utilisateurs.
        </p>
        <div className="mt-3">
          <RevoirPresentationButton />
        </div>
      </div>
    </div>
  );
}
