"use client";

import Image from "next/image";
import { X, Printer } from "lucide-react";
import { useNomUtilisateurConnecte } from "@/lib/hooks/useEntrepriseInfo";

export type ColonneRapport = {
  label: string;
  cle: string;
  align?: "left" | "right";
};

export function RapportPrintable({
  titre,
  periodeLabel,
  colonnes,
  lignes,
  totalLabel,
  totalValeur,
  onClose,
}: {
  titre: string;
  periodeLabel: string;
  colonnes: ColonneRapport[];
  lignes: Record<string, string | number>[];
  totalLabel?: string;
  totalValeur?: string | number;
  onClose: () => void;
}) {
  const nomUtilisateur = useNomUtilisateurConnecte();
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

      <div className="zone-impression mx-auto max-w-3xl bg-white p-8 sm:p-10">
        <div className="flex items-start justify-between border-b-2 border-onyx-900 pb-6">
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
              {titre}
            </p>
            <p className="text-sm text-onyx-500">{periodeLabel}</p>
            <p className="text-xs text-onyx-400">
              Édité le{" "}
              {new Date().toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-onyx-900">
              {colonnes.map((c) => (
                <th
                  key={c.cle}
                  className={`border border-onyx-200 bg-onyx-50 py-2 px-2.5 text-xs font-semibold uppercase tracking-wide text-onyx-600 ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? (
              <tr>
                <td
                  colSpan={colonnes.length}
                  className="border border-onyx-200 py-6 text-center text-onyx-400"
                >
                  Aucune donnée sur cette période.
                </td>
              </tr>
            ) : (
              lignes.map((ligne, i) => (
                <tr key={i}>
                  {colonnes.map((c) => (
                    <td
                      key={c.cle}
                      className={`border border-onyx-200 py-1.5 px-2.5 text-onyx-700 ${
                        c.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {ligne[c.cle] ?? ""}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {totalLabel && (
            <tfoot>
              <tr className="border-t-2 border-onyx-900 font-semibold">
                <td
                  colSpan={colonnes.length - 1}
                  className="border border-onyx-200 py-2 px-2.5 text-right text-onyx-900"
                >
                  {totalLabel}
                </td>
                <td className="border border-onyx-200 py-2 px-2.5 text-right text-onyx-900">
                  {totalValeur}
                </td>
              </tr>
            </tfoot>
          )}
        </table>

        <p className="mt-8 text-center text-xs text-onyx-300">
          Document généré automatiquement par ONYX PHARM.
        </p>
        <div className="mt-4 border-t border-onyx-100 pt-4 text-center">
          <p className="text-xs font-medium text-onyx-500">
            ONYX Pharm Sarl - la qualité au service de nos clients
          </p>
          {nomUtilisateur && (
            <p className="mt-1 text-[11px] text-onyx-300">
              Imprimé par {nomUtilisateur} le{" "}
              {new Date().toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
