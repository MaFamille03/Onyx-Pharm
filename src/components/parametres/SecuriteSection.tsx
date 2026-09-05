"use client";

import { useEffect, useState, useCallback } from "react";
import { KeyRound, ShieldCheck, Hash } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

export function SecuriteSection() {
  const supabase = createClient();
  const [defini, setDefini] = useState<boolean | null>(null);
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [operations, setOperations] = useState("");
  const [savingOps, setSavingOps] = useState(false);

  const [pinDefini, setPinDefini] = useState<boolean | null>(null);
  const [ancienPin, setAncienPin] = useState("");
  const [nouveauPin, setNouveauPin] = useState("");
  const [confirmationPin, setConfirmationPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const [successPin, setSuccessPin] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: estDefini }, { data: param }, { data: pinDef }] = await Promise.all([
      supabase.rpc("second_mot_de_passe_est_defini"),
      supabase
        .from("parametres_generaux")
        .select("valeur")
        .eq("cle", "operations_protegees_second_mdp")
        .maybeSingle(),
      supabase.rpc("pin_securite_est_defini"),
    ]);
    setDefini(Boolean(estDefini));
    if (param?.valeur && Array.isArray(param.valeur)) {
      setOperations((param.valeur as string[]).join(", "));
    }
    setPinDefini(Boolean(pinDef));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (nouveau.length < 4) {
      setError("Le nouveau mot de passe doit contenir au moins 4 caractères.");
      return;
    }
    if (nouveau !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("definir_second_mot_de_passe", {
      p_nouveau: nouveau,
      p_ancien: defini ? ancien : null,
    });
    setSaving(false);

    if (error) {
      setError(
        error.message.includes("incorrect")
          ? "Ancien mot de passe incorrect."
          : "Impossible de définir le mot de passe."
      );
      return;
    }

    setSuccess(defini ? "Mot de passe mis à jour." : "Mot de passe défini avec succès.");
    setAncien("");
    setNouveau("");
    setConfirmation("");
    load();
  }

  async function handleSaveOperations() {
    setSavingOps(true);
    const liste = operations
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await supabase
      .from("parametres_generaux")
      .update({ valeur: JSON.stringify(liste) })
      .eq("cle", "operations_protegees_second_mdp");
    setSavingOps(false);
  }

  async function handleSubmitPin(e: React.FormEvent) {
    e.preventDefault();
    setErrorPin(null);
    setSuccessPin(null);

    if (!/^\d{4}$/.test(nouveauPin)) {
      setErrorPin("Le code doit contenir exactement 4 chiffres.");
      return;
    }
    if (nouveauPin !== confirmationPin) {
      setErrorPin("Les deux codes ne correspondent pas.");
      return;
    }

    setSavingPin(true);
    const { error } = await supabase.rpc("definir_pin_securite", {
      p_nouveau: nouveauPin,
      p_ancien: pinDefini ? ancienPin : null,
    });
    setSavingPin(false);

    if (error) {
      setErrorPin(
        error.message.includes("incorrect")
          ? "Ancien code incorrect."
          : "Impossible de définir le code."
      );
      return;
    }

    setSuccessPin(pinDefini ? "Code PIN mis à jour." : "Code PIN défini avec succès.");
    setAncienPin("");
    setNouveauPin("");
    setConfirmationPin("");
    load();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-onyx-100 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
            <KeyRound size={16} />
          </div>
          <h3 className="text-sm font-semibold text-onyx-800">
            Second mot de passe de sécurité
          </h3>
        </div>
        <p className="mt-1.5 text-xs text-onyx-400">
          Un mot de passe distinct de la connexion, demandé pour les
          opérations sensibles (ex : annulation d&apos;une vente ou d&apos;un
          achat déjà validé). Partagé par tous les utilisateurs de
          l&apos;application.
        </p>

        {defini === null ? (
          <p className="mt-3 text-sm text-onyx-400">Chargement...</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 max-w-sm space-y-3">
            {error && <InlineBanner message={error} />}
            {success && <InlineBanner type="success" message={success} />}

            {defini && (
              <FormField
                id="ancien-mdp"
                label="Mot de passe actuel"
                type="password"
                required
                value={ancien}
                onChange={(e) => setAncien(e.target.value)}
              />
            )}
            <FormField
              id="nouveau-mdp"
              label={defini ? "Nouveau mot de passe" : "Définir un mot de passe"}
              type="password"
              required
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              placeholder="4 caractères minimum"
            />
            <FormField
              id="confirmation-mdp"
              label="Confirmer"
              type="password"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
            <PrimaryButton type="submit" loading={saving}>
              <ShieldCheck size={16} />
              {defini ? "Mettre à jour" : "Définir le mot de passe"}
            </PrimaryButton>
          </form>
        )}
      </div>

      <div className="rounded-xl border border-onyx-100 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <Hash size={16} />
          </div>
          <h3 className="text-sm font-semibold text-onyx-800">
            Code PIN (4 chiffres)
          </h3>
        </div>
        <p className="mt-1.5 text-xs text-onyx-400">
          Demandé avant toute suppression de donnée sensible (paiement,
          retour...). Distinct du second mot de passe, plus rapide à saisir
          au quotidien.
        </p>

        {pinDefini === null ? (
          <p className="mt-3 text-sm text-onyx-400">Chargement...</p>
        ) : (
          <form onSubmit={handleSubmitPin} className="mt-4 max-w-sm space-y-3">
            {errorPin && <InlineBanner message={errorPin} />}
            {successPin && <InlineBanner type="success" message={successPin} />}

            {pinDefini && (
              <FormField
                id="ancien-pin"
                label="Code actuel"
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                value={ancienPin}
                onChange={(e) => setAncienPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            )}
            <FormField
              id="nouveau-pin"
              label={pinDefini ? "Nouveau code" : "Définir un code"}
              type="password"
              inputMode="numeric"
              maxLength={4}
              required
              value={nouveauPin}
              onChange={(e) => setNouveauPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4 chiffres"
            />
            <FormField
              id="confirmation-pin"
              label="Confirmer"
              type="password"
              inputMode="numeric"
              maxLength={4}
              required
              value={confirmationPin}
              onChange={(e) => setConfirmationPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            <PrimaryButton type="submit" loading={savingPin}>
              <Hash size={16} />
              {pinDefini ? "Mettre à jour" : "Définir le code"}
            </PrimaryButton>
          </form>
        )}
      </div>

      <div className="rounded-xl border border-onyx-100 bg-white p-4">
        <h3 className="text-sm font-semibold text-onyx-800">
          Opérations protégées
        </h3>
        <p className="mt-1.5 text-xs text-onyx-400">
          Liste indicative des opérations sensibles couvertes par le second
          mot de passe (séparées par des virgules).
        </p>
        <textarea
          value={operations}
          onChange={(e) => setOperations(e.target.value)}
          rows={2}
          className="mt-3 w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-sm outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        />
        <div className="mt-2">
          <PrimaryButton
            onClick={handleSaveOperations}
            loading={savingOps}
            className="px-3 py-1.5 text-xs"
          >
            Enregistrer
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
