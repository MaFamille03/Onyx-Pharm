"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

export function PinModal({
  title = "Confirmation requise",
  message,
  onCancel,
  onConfirm,
}: {
  title?: string;
  message: string;
  onCancel: () => void;
  /** Reçoit le code saisi ; doit lancer une erreur en cas d'échec. */
  onConfirm: (pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      setError("Entrez les 4 chiffres du code.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code incorrect.");
      setLoading(false);
    }
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <InlineBanner message={error} />}

        <div className="flex items-start gap-2.5 rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{message}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-onyx-700">
            Code PIN (4 chiffres)
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-center text-2xl tracking-[0.5em] outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <SecondaryButton type="button" onClick={onCancel} className="flex-1">
            Annuler
          </SecondaryButton>
          <PrimaryButton type="submit" loading={loading} className="flex-1 bg-red-600 hover:bg-red-700">
            Confirmer
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
