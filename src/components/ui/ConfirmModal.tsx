"use client";

import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";

export function ConfirmModal({
  title = "Confirmation",
  message,
  confirmLabel = "Supprimer",
  danger = true,
  onCancel,
  onConfirm,
}: {
  title?: string;
  message: string;
  confirmLabel?: string;
  /** Style rouge (suppression) ou neutre (confirmation simple). */
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            danger ? "bg-red-50 text-red-500" : "bg-accent-50 text-accent-600"
          }`}
        >
          <AlertTriangle size={18} />
        </div>
        <p className="pt-1.5 text-sm text-onyx-600">{message}</p>
      </div>
      <div className="mt-5 flex gap-3">
        <SecondaryButton onClick={onCancel} className="flex-1">
          Annuler
        </SecondaryButton>
        <PrimaryButton
          onClick={onConfirm}
          className={
            danger ? "flex-1 !bg-red-600 hover:!bg-red-700" : "flex-1"
          }
        >
          {confirmLabel}
        </PrimaryButton>
      </div>
    </Modal>
  );
}
