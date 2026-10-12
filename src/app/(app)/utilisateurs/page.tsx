"use client";

import { useEffect, useState } from "react";
import { UserCog, Users2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton } from "@/components/ui/Buttons";
import { InlineBanner, StatutBadge } from "@/components/ui/Badges";

type AutreProfil = {
  id: string;
  email: string | null;
  nom_complet: string | null;
  compte_statut: string;
  created_at: string;
};

export default function UtilisateursPage() {
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);
  const [dateCreation, setDateCreation] = useState<string>("—");
  const [nomComplet, setNomComplet] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [autresProfils, setAutresProfils] = useState<AutreProfil[]>([]);
  const [loadingListe, setLoadingListe] = useState(true);

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

      const { data: tous } = await supabase
        .from("profiles")
        .select("id, email, nom_complet, compte_statut, created_at")
        .neq("id", user.id)
        .order("created_at", { ascending: true });
      setAutresProfils((tous as AutreProfil[]) ?? []);
      setLoadingListe(false);
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

      <div className="mt-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-onyx-800">
          <Users2 size={16} />
          Autres utilisateurs de l&apos;application
        </h2>
        <p className="mt-1 text-xs text-onyx-400">
          Tous les comptes connectés partagent les mêmes données. Cette
          liste est consultative — chacun ne peut modifier que son propre
          nom, ci-dessus.
        </p>

        <div className="mt-3 space-y-2">
          {loadingListe ? (
            <p className="py-6 text-center text-sm text-onyx-400">
              Chargement...
            </p>
          ) : autresProfils.length === 0 ? (
            <div className="rounded-xl border border-dashed border-onyx-200 bg-white px-6 py-8 text-center">
              <p className="text-sm text-onyx-400">
                Aucun autre utilisateur pour le moment.
              </p>
            </div>
          ) : (
            autresProfils.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-onyx-100 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-onyx-100 text-onyx-500">
                    <UserCog size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-onyx-800">
                      {p.nom_complet || p.email || "—"}
                    </p>
                    <p className="text-xs text-onyx-400">
                      Depuis le{" "}
                      {new Date(p.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
                <StatutBadge statut={p.compte_statut} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
