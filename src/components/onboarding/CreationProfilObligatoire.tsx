"use client";

import { useState } from "react";
import { UserCircle2, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

/**
 * Écran bloquant affiché une seule fois, juste après la démo, tant que
 * l'utilisateur n'a pas encore de nom enregistré. Une fois validé, ce
 * nom remplace l'email dans "Bienvenue" sur le tableau de bord et
 * identifie ses actions dans l'Historique.
 */
export function CreationProfilObligatoire({
  onDone,
}: {
  onDone: (nom: string) => void;
}) {
  const supabase = createClient();
  const [nom, setNom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) {
      setError("Votre nom est nécessaire pour continuer.");
      return;
    }
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ nom_complet: nom.trim() })
      .eq("id", user.id);
    setSaving(false);
    if (updateError) {
      // eslint-disable-next-line no-console
      console.error("[ONYX PHARM] Erreur Supabase", {
        table: "profiles",
        operation: "update (création profil)",
        code: updateError.code,
        message: updateError.message,
      });
      setError("Impossible d'enregistrer votre nom. Réessayez.");
      return;
    }
    onDone(nom.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-onyx-950/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-onyx-900 text-accent-400">
            <UserCircle2 size={28} />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-onyx-900">
            Créez votre profil
          </h1>
          <p className="mt-1.5 text-sm text-onyx-500">
            Ce nom identifiera vos actions dans l&apos;application (ventes,
            corrections, suppressions...) et remplacera votre adresse email
            à l&apos;écran d&apos;accueil.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <InlineBanner message={error} />}
          <FormField
            id="nom-profil-obligatoire"
            label="Votre nom complet"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Ex : Jean Kouassi"
            required
            autoFocus
          />
          <PrimaryButton type="submit" loading={saving} className="w-full">
            Continuer
            <ArrowRight size={16} />
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}
