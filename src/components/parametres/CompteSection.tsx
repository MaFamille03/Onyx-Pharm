"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, UserX, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { SecondPasswordModal } from "@/components/securite/SecondPasswordModal";

const PHRASE_CONFIRMATION = "SUPPRIMER DEFINITIVEMENT MON COMPTE";

export function CompteSection() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [nomComplet, setNomComplet] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [modalDesactivation, setModalDesactivation] = useState(false);
  const [modalPhrase, setModalPhrase] = useState(false);
  const [modalSuppressionFinal, setModalSuppressionFinal] = useState(false);
  const [confirmationSuppression, setConfirmationSuppression] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      setEmail(user.email ?? null);
      const { data: profile } = await supabase
        .from("profiles")
        .select("nom_complet")
        .eq("id", user.id)
        .maybeSingle();
      setNomComplet(profile?.nom_complet ?? "");
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveNom(e: React.FormEvent) {
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

  async function confirmerDesactivation(motDePasse: string) {
    const ok = await supabase.rpc("verifier_second_mot_de_passe", {
      p_mdp: motDePasse,
    });
    if (ok.error || !ok.data) {
      throw new Error("Mot de passe de sécurité incorrect.");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({ compte_statut: "Désactivé" })
      .eq("id", user.id);

    if (error) {
      throw new Error("Impossible de désactiver le compte.");
    }

    setModalDesactivation(false);
    await supabase.auth.signOut();
    router.push("/connexion");
  }

  async function confirmerSuppression(motDePasse: string) {
    const ok = await supabase.rpc("verifier_second_mot_de_passe", {
      p_mdp: motDePasse,
    });
    if (ok.error || !ok.data) {
      throw new Error("Mot de passe de sécurité incorrect.");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Les données personnelles du compte sont anonymisées. Les documents
    // commerciaux (ventes, achats, historique...) restent intacts pour
    // préserver l'intégrité comptable de l'entreprise.
    const { error } = await supabase
      .from("profiles")
      .update({ nom_complet: null, compte_statut: "Supprimé" })
      .eq("id", user.id);

    if (error) {
      throw new Error("Impossible de supprimer ce compte.");
    }

    setModalSuppressionFinal(false);
    await supabase.auth.signOut();
    router.push("/connexion");
  }

  if (loading) {
    return (
      <p className="py-6 text-center text-sm text-onyx-400">Chargement...</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-onyx-100 bg-white p-4">
        <h3 className="text-sm font-semibold text-onyx-800">Mon compte</h3>
        <form onSubmit={handleSaveNom} className="mt-3 max-w-sm space-y-3">
          {success && (
            <InlineBanner type="success" message="Nom mis à jour." />
          )}
          <FormField
            id="compte-email"
            label="E-mail"
            value={email ?? ""}
            disabled
          />
          <FormField
            id="compte-nom"
            label="Nom complet (affiché dans l'historique)"
            value={nomComplet}
            onChange={(e) => setNomComplet(e.target.value)}
            placeholder="Ex : Jean Kouassi"
          />
          <PrimaryButton type="submit" loading={saving}>
            Enregistrer
          </PrimaryButton>
        </form>
      </div>

      <div className="rounded-xl border border-red-100 bg-red-50/30 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-500" />
          <h3 className="text-sm font-semibold text-red-700">
            Zone dangereuse
          </h3>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-onyx-800">
              Rendre mon compte non fonctionnel
            </p>
            <p className="mt-0.5 max-w-md text-xs text-onyx-500">
              À utiliser lorsqu&apos;une personne quitte l&apos;entreprise.
              Le compte est désactivé (connexion impossible), mais tout
              l&apos;historique des opérations qu&apos;il a réalisées reste
              visible et attribué à son nom.
            </p>
          </div>
          <SecondaryButton
            onClick={() => {
              setError(null);
              setModalDesactivation(true);
            }}
            className="shrink-0"
          >
            <UserX size={16} />
            Désactiver
          </SecondaryButton>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-red-100 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-onyx-800">
              Supprimer définitivement mon compte
            </p>
            <p className="mt-0.5 max-w-md text-xs text-onyx-500">
              Action irréversible. Vos informations personnelles (nom) sont
              retirées. Les ventes, achats et autres documents commerciaux
              liés à votre compte sont conservés pour préserver
              l&apos;intégrité comptable de l&apos;entreprise.
            </p>
          </div>
          <SecondaryButton
            onClick={() => {
              setError(null);
              setConfirmationSuppression("");
              setModalPhrase(true);
            }}
            className="shrink-0 border-red-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 size={16} />
            Supprimer
          </SecondaryButton>
        </div>
      </div>

      {modalDesactivation && (
        <SecondPasswordModal
          title="Désactiver mon compte"
          message="Vous serez déconnecté et ne pourrez plus vous reconnecter avec ce compte. L'historique de vos opérations reste visible pour les autres utilisateurs."
          onCancel={() => setModalDesactivation(false)}
          onConfirm={confirmerDesactivation}
        />
      )}

      {modalPhrase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-onyx-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-red-700">
              Supprimer définitivement mon compte
            </h2>
            {error && (
              <div className="mt-3">
                <InlineBanner message={error} />
              </div>
            )}
            <p className="mt-3 text-sm text-onyx-600">
              Cette action est <strong>irréversible</strong>. Pour confirmer,
              recopiez exactement la phrase suivante :
            </p>
            <p className="mt-2 rounded-lg bg-onyx-50 px-3 py-2 text-sm font-medium text-onyx-800">
              {PHRASE_CONFIRMATION}
            </p>
            <input
              value={confirmationSuppression}
              onChange={(e) => setConfirmationSuppression(e.target.value)}
              className="mt-3 w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              placeholder="Recopiez la phrase ci-dessus"
            />
            <div className="mt-4 flex gap-3">
              <SecondaryButton
                onClick={() => setModalPhrase(false)}
                className="flex-1"
              >
                Annuler
              </SecondaryButton>
              <PrimaryButton
                onClick={() => {
                  if (confirmationSuppression !== PHRASE_CONFIRMATION) {
                    setError(
                      "Recopiez exactement la phrase de confirmation demandée."
                    );
                    return;
                  }
                  setError(null);
                  setModalPhrase(false);
                  setModalSuppressionFinal(true);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                Continuer
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {modalSuppressionFinal && (
        <SecondPasswordModal
          title="Confirmation finale"
          message="Dernière étape : saisissez le second mot de passe pour supprimer définitivement votre compte."
          onCancel={() => setModalSuppressionFinal(false)}
          onConfirm={confirmerSuppression}
        />
      )}
    </div>
  );
}
