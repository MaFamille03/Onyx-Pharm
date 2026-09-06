"use client";

import { useEffect, useState, useCallback } from "react";
import { Hash } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

export function SecuriteSection() {
  const supabase = createClient();

  const [pinDefini, setPinDefini] = useState<boolean | null>(null);
  const [ancienPin, setAncienPin] = useState("");
  const [nouveauPin, setNouveauPin] = useState("");
  const [confirmationPin, setConfirmationPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const [successPin, setSuccessPin] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: pinDef } = await supabase.rpc("pin_securite_est_defini");
    setPinDefini(Boolean(pinDef));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
          : logSupabaseError(
              { table: "parametres_generaux", operation: "rpc definir_pin_securite" },
              error,
              "Impossible de définir le code. Réessayez."
            )
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <Hash size={16} />
          </div>
          <h3 className="text-sm font-semibold text-onyx-800">
            Code PIN (4 chiffres)
          </h3>
        </div>
        <p className="mt-1.5 text-xs text-onyx-400">
          Demandé avant toute suppression ou modification de donnée
          sensible (article, conteneur, vente validée, paiement,
          inventaire...). Partagé par tous les utilisateurs de
          l&apos;application.
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
    </div>
  );
}
