"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Printer } from "lucide-react";
import { useEntrepriseInfo, useNomUtilisateurConnecte } from "@/lib/hooks/useEntrepriseInfo";

export type LigneProforma = {
  designation: string;
  quantite: number;
  unite?: string;
  prixUnitaireHT: number;
  tvaPourcent?: number;
};

export function ProformaPrintable({
  reference,
  clientNom,
  clientAdresse,
  delaiLivraison,
  modeLivraison,
  modalitePaiement,
  validiteOffre,
  fraisPort,
  lignes,
  onClose,
}: {
  reference: string;
  clientNom?: string;
  clientAdresse?: string;
  delaiLivraison?: string;
  modeLivraison?: string;
  modalitePaiement?: string;
  validiteOffre?: string;
  fraisPort?: number;
  lignes: LigneProforma[];
  onClose: () => void;
}) {
  const entreprise = useEntrepriseInfo();
  const nomUtilisateur = useNomUtilisateurConnecte();
  const [emisPar] = useState(nomUtilisateur);

  const totalHT = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireHT, 0);
  const totalTVA = lignes.reduce(
    (s, l) => s + l.quantite * l.prixUnitaireHT * ((l.tvaPourcent ?? 0) / 100),
    0
  );
  const port = fraisPort ?? 0;
  const totalTTC = totalHT + totalTVA + port;

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

      <div className="zone-impression mx-auto max-w-3xl bg-white p-8 text-sm sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg p-1">
              <Image
                src={entreprise?.logo_url || "/onyx-pharm-icon.png"}
                alt={entreprise?.nom ?? "ONYX PHARM"}
                width={44}
                height={44}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="font-bold text-onyx-900">
                {entreprise?.nom ?? "ONYX PHARM SARL"}
              </p>
              {entreprise?.adresse_physique && (
                <p className="text-onyx-600">{entreprise.adresse_physique}</p>
              )}
              {entreprise?.adresse_postale && (
                <p className="text-onyx-600">{entreprise.adresse_postale}</p>
              )}
              {entreprise?.email && (
                <p className="text-onyx-600">{entreprise.email}</p>
              )}
              {entreprise?.telephone && (
                <p className="text-onyx-600">{entreprise.telephone}</p>
              )}
            </div>
          </div>

          <div className="rounded-md bg-onyx-50 px-4 py-3 text-onyx-700">
            <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
              <span className="text-onyx-500">Date d&apos;émission</span>
              <span>
                {new Date().toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </span>
              <span className="text-onyx-500">Émis par</span>
              <span>{emisPar ?? "—"}</span>
              <span className="pt-2 text-onyx-500">Délai de livraison</span>
              <span className="pt-2">{delaiLivraison || "—"}</span>
              <span className="text-onyx-500">Mode de livraison</span>
              <span>{modeLivraison || "—"}</span>
              <span className="text-onyx-500">Modalité de paiement</span>
              <span>{modalitePaiement || "—"}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase text-onyx-400">
              Destinataire
            </p>
            <p className="mt-1 font-medium text-onyx-800">
              {clientNom || "Client de passage"}
            </p>
            {clientAdresse && (
              <p className="text-onyx-600">{clientAdresse}</p>
            )}
          </div>
          <p className="whitespace-nowrap text-xl font-bold uppercase tracking-wide text-onyx-900">
            Facture Proforma n°{reference}
          </p>
        </div>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#dbe5f1] text-left text-onyx-800">
              <th className="border border-onyx-200 px-3 py-2 font-semibold">
                Désignation des produits ou prestations
              </th>
              <th className="border border-onyx-200 px-3 py-2 text-right font-semibold">
                Quantité
              </th>
              <th className="border border-onyx-200 px-3 py-2 text-center font-semibold">
                Unité
              </th>
              <th className="border border-onyx-200 px-3 py-2 text-right font-semibold">
                Prix unitaire HT
              </th>
              <th className="border border-onyx-200 px-3 py-2 text-center font-semibold">
                TVA applicable
              </th>
              <th className="border border-onyx-200 px-3 py-2 text-right font-semibold">
                TOTAL HT
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i}>
                <td className="border border-onyx-200 px-3 py-2 text-onyx-700">
                  {l.designation}
                </td>
                <td className="border border-onyx-200 px-3 py-2 text-right text-onyx-600">
                  {l.quantite}
                </td>
                <td className="border border-onyx-200 px-3 py-2 text-center text-onyx-600">
                  {l.unite || "pce."}
                </td>
                <td className="border border-onyx-200 px-3 py-2 text-right text-onyx-600">
                  {l.prixUnitaireHT.toLocaleString("fr-FR")}
                </td>
                <td className="border border-onyx-200 px-3 py-2 text-center text-onyx-600">
                  {l.tvaPourcent ?? 0}%
                </td>
                <td className="border border-onyx-200 px-3 py-2 text-right font-medium text-onyx-800">
                  {(l.quantite * l.prixUnitaireHT).toLocaleString("fr-FR")}
                </td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 6 - lignes.length) }).map((_, i) => (
              <tr key={`vide-${i}`}>
                <td className="border border-onyx-200 px-3 py-4">&nbsp;</td>
                <td className="border border-onyx-200 px-3 py-4"></td>
                <td className="border border-onyx-200 px-3 py-4"></td>
                <td className="border border-onyx-200 px-3 py-4"></td>
                <td className="border border-onyx-200 px-3 py-4"></td>
                <td className="border border-onyx-200 px-3 py-4"></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-onyx-600">
              Offre valable jusqu&apos;au {validiteOffre || "—"}
            </p>
            <p className="mt-8 text-onyx-600">Signature</p>
          </div>
          <div className="w-64 space-y-1.5">
            <div className="flex justify-between text-onyx-600">
              <span>Total HT</span>
              <span>{totalHT.toLocaleString("fr-FR")} FCFA</span>
            </div>
            <div className="flex justify-between border-b border-onyx-200 pb-1.5 text-onyx-600">
              <span>TVA</span>
              <span>{totalTVA.toLocaleString("fr-FR")} FCFA</span>
            </div>
            <div className="flex justify-between border-b border-onyx-200 pb-1.5 text-onyx-600">
              <span>Frais de port</span>
              <span>{port.toLocaleString("fr-FR")} FCFA</span>
            </div>
            <div className="flex justify-between pt-1 text-base font-bold text-onyx-900">
              <span>Total TTC</span>
              <span>{totalTTC.toLocaleString("fr-FR")} FCFA</span>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-onyx-100 pt-4 text-center">
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
