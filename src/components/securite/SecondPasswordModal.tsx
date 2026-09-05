"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

export function SecondPasswordModal({
  title = "Confirmation requise",
  message,
  onCancel,
  onConfirm,
}: {
  title?: string;
  message: string;
  onCancel: () => void;
  /** Reçoit le mot de passe saisi ; doit lancer une erreur en cas d'échec. */
  onConfirm: (motDePasse: string) => Promise<void>;
}) {
  const [motDePasse, setMotDePasse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!motDePasse) {
      setError("Le mot de passe de sécurité est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm(motDePasse);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Mot de passe de sécurité incorrect."
      );
      setLoading(false);
    }
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <InlineBanner message={error} />}

        <div className="flex items-start gap-2.5 rounded-lg border border-accent-100 bg-accent-50 px-3.5 py-2.5">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-accent-600" />
          <p className="text-sm text-accent-800">{message}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-onyx-700">
            Second mot de passe
          </label>
          <input
            type="password"
            autoFocus
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <SecondaryButton type="button" onClick={onCancel} className="flex-1">
            Annuler
          </SecondaryButton>
          <PrimaryButton type="submit" loading={loading} className="flex-1">
            Confirmer
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
