"use client";

import Image from "next/image";
import { X, Printer } from "lucide-react";

export type LigneDocument = {
  designation: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
};

export function DocumentImprimable({
  typeDocument,
  reference,
  date,
  tiersLabel,
  tiersNom,
  lignes,
  montantTotal,
  montantPaye,
  onClose,
}: {
  typeDocument: string;
  reference: string;
  date: string;
  tiersLabel?: string;
  tiersNom?: string;
  lignes: LigneDocument[];
  montantTotal: number;
  montantPaye?: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-onyx-950/60">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-onyx-100 bg-white px-4 py-3">
        <p className="text-sm font-medium text-onyx-700">
          Aperçu avant impression
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-onyx-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-onyx-800"
          >
            <Printer size={15} />
            Imprimer / PDF
          </button>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-onyx-500 hover:bg-onyx-50"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="zone-impression mx-auto max-w-2xl bg-white p-8 sm:p-10">
        <div className="flex items-start justify-between border-b border-onyx-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white p-1">
                <Image
                  src="/onyx-pharm-icon.png"
                  alt="ONYX PHARM"
                  width={36}
                  height={36}
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-onyx-900">
                  ONYX PHARM
                </p>
                <p className="text-xs text-onyx-400">
                  Équipements médicaux
                </p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold uppercase tracking-wide text-onyx-900">
              {typeDocument}
            </p>
            <p className="text-sm text-onyx-500">{reference}</p>
            <p className="text-xs text-onyx-400">
              {new Date(date).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {tiersNom && (
          <div className="mt-6">
            <p className="text-xs font-medium uppercase text-onyx-400">
              {tiersLabel ?? "Client"}
            </p>
            <p className="mt-1 text-sm font-medium text-onyx-800">{tiersNom}</p>
          </div>
        )}

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-onyx-200 text-left text-xs uppercase text-onyx-400">
              <th className="py-2">Désignation</th>
              <th className="py-2 text-right">Qté</th>
              <th className="py-2 text-right">P.U.</th>
              <th className="py-2 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i} className="border-b border-onyx-100">
                <td className="py-2 text-onyx-700">{l.designation}</td>
                <td className="py-2 text-right text-onyx-500">{l.quantite}</td>
                <td className="py-2 text-right text-onyx-500">
                  {l.prixUnitaire.toLocaleString("fr-FR")}
                </td>
                <td className="py-2 text-right font-medium text-onyx-800">
                  {l.montant.toLocaleString("fr-FR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-56 space-y-1.5 text-sm">
            <div className="flex justify-between border-t-2 border-onyx-200 pt-2 font-semibold text-onyx-900">
              <span>Total</span>
              <span>{montantTotal.toLocaleString("fr-FR")} FCFA</span>
            </div>
            {montantPaye !== undefined && (
              <>
                <div className="flex justify-between text-onyx-500">
                  <span>Payé</span>
                  <span>{montantPaye.toLocaleString("fr-FR")} FCFA</span>
                </div>
                <div className="flex justify-between font-medium text-onyx-700">
                  <span>Reste</span>
                  <span>
                    {(montantTotal - montantPaye).toLocaleString("fr-FR")} FCFA
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-onyx-300">
          Document généré par ONYX PHARM — Application de gestion intégrée
        </p>
      </div>
    </div>
  );
}
