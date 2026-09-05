"use client";

import { useEffect, useState } from "react";
import { UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

export default function UtilisateursPage() {
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);
  const [dateCreation, setDateCreation] = useState<string>("—");
  const [nomComplet, setNomComplet] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? null);
      setDateCreation(
        user.created_at
          ? new Date(user.created_at).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : "—"
      );
      const { data: profile } = await supabase
        .from("profiles")
        .select("nom_complet")
        .eq("id", user.id)
        .maybeSingle();
      setNomComplet(profile?.nom_complet ?? "");
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ nom_complet: nomComplet.trim() || null })
        .eq("id", user.id);
      setSuccess(true);
    }
    setSaving(false);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        Utilisateurs
      </h1>
      <p className="mt-1 text-sm text-onyx-500">
        Chaque compte identifie précisément son titulaire pour assurer la
        traçabilité des opérations.
      </p>

      <div className="mt-6 max-w-lg rounded-xl border border-onyx-100 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-onyx-900 text-white">
            <UserCog size={20} />
          </div>
          <div>
            <p className="text-sm font-medium text-onyx-800">
              {email ?? "—"}
            </p>
            <p className="text-xs text-onyx-400">
              Compte créé le {dateCreation}
            </p>
          </div>
        </div>

        {!loading && (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            {success && (
              <InlineBanner type="success" message="Nom mis à jour." />
            )}
            <FormField
              id="nom-complet"
              label="Nom complet (affiché dans l'historique)"
              value={nomComplet}
              onChange={(e) => setNomComplet(e.target.value)}
              placeholder="Ex : Jean Kouassi"
            />
            <PrimaryButton type="submit" loading={saving}>
              Enregistrer
            </PrimaryButton>
          </form>
        )}
      </div>

      <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-onyx-200 bg-white px-6 py-12 text-center">
        <p className="text-sm font-medium text-onyx-700">
          Liste des utilisateurs et gestion des comptes
        </p>
        <p className="mt-1 max-w-sm text-sm text-onyx-400">
          La liste complète des comptes de l&apos;équipe sera développée
          ultérieurement ; l&apos;historique (menu Historique) trace déjà
          les actions de chaque utilisateur connecté.
        </p>
      </div>
    </div>
  );
}
