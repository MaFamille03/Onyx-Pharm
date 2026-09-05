"use client";

import Image from "next/image";
import { X, Printer } from "lucide-react";

type LigneInventaireImprimable = {
  designation: string;
  quantite_theorique: number;
  quantite_reelle: number;
  ecart: number;
};

export function InventairePrintable({
  reference,
  dateInventaire,
  emplacementNom,
  statut,
  lignes,
  onClose,
}: {
  reference: string;
  dateInventaire: string;
  emplacementNom: string;
  statut: string;
  lignes: LigneInventaireImprimable[];
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
              <p className="text-sm font-semibold text-onyx-900">ONYX PHARM</p>
              <p className="text-xs text-onyx-400">Équipements médicaux</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold uppercase tracking-wide text-onyx-900">
              Inventaire
            </p>
            <p className="text-sm text-onyx-500">{reference}</p>
            <p className="text-xs text-onyx-400">
              {new Date(dateInventaire).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-between text-sm">
          <div>
            <p className="text-xs font-medium uppercase text-onyx-400">
              Emplacement
            </p>
            <p className="mt-1 font-medium text-onyx-800">{emplacementNom}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase text-onyx-400">
              Statut
            </p>
            <p className="mt-1 font-medium text-onyx-800">{statut}</p>
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-onyx-200 text-left text-xs uppercase text-onyx-400">
              <th className="py-2">Article</th>
              <th className="py-2 text-right">Théorique</th>
              <th className="py-2 text-right">Réel</th>
              <th className="py-2 text-right">Écart</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i} className="border-b border-onyx-100">
                <td className="py-2 text-onyx-700">{l.designation}</td>
                <td className="py-2 text-right text-onyx-500">
                  {l.quantite_theorique}
                </td>
                <td className="py-2 text-right text-onyx-500">
                  {l.quantite_reelle}
                </td>
                <td
                  className={`py-2 text-right font-medium ${
                    l.ecart === 0
                      ? "text-onyx-400"
                      : l.ecart > 0
                        ? "text-emerald-600"
                        : "text-red-500"
                  }`}
                >
                  {l.ecart > 0 ? `+${l.ecart}` : l.ecart}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-10 text-center text-xs text-onyx-300">
          Document généré par ONYX PHARM — Application de gestion intégrée
        </p>
      </div>
    </div>
  );
}
