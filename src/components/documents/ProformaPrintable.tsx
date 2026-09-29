"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Printer } from "lucide-react";
import { useNomUtilisateurConnecte } from "@/lib/hooks/useEntrepriseInfo";

export type LigneProforma = {
  designation: string;
  quantite: number;
  unite?: string;
  prixUnitaireHT: number;
};

function formatMontant(value: number) {
  return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function ProformaPrintable({
  reference,
  clientNom,
  clientAdresse,
  delaiLivraison,
  modalitePaiement,
  validiteOffre,
  lignes,
  onClose,
}: {
  reference: string;
  clientNom?: string;
  clientAdresse?: string;
  delaiLivraison?: string;
  modalitePaiement?: string;
  validiteOffre?: string;
  lignes: LigneProforma[];
  onClose: () => void;
}) {
  const nomUtilisateur = useNomUtilisateurConnecte();
  const [emisPar] = useState(nomUtilisateur);

  const totalHT = lignes.reduce(
    (s, l) => s + Number(l.quantite || 0) * Number(l.prixUnitaireHT || 0),
    0
  );

  const dateEmission = new Date();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-onyx-950/60">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-onyx-100 bg-white px-4 py-3">
        <p className="text-sm font-medium text-onyx-700">
          Aperçu du proforma
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

      <div className="zone-impression relative mx-auto min-h-[297mm] w-[210mm] overflow-hidden bg-white px-[15mm] pb-[27mm] pt-[13mm] text-[11px] text-onyx-800 shadow-xl print:shadow-none">
        {/* En-tête reproduisant le papier à en-tête ONYX PHARM */}
        <header className="relative z-10 min-h-[31mm]">
          <Image
            src="/onyx-pharm-logo.png"
            alt="ONYX Pharm Sarl"
            width={190}
            height={64}
            priority
            className="h-auto w-[54mm] object-contain"
          />
          <div className="ml-[16mm] mt-1.5">
            <p className="text-[7.5px] leading-[1.35] text-onyx-700">
              Matériel Biomédical - Consommables
              <br />
              Instruments Chirurgicaux Dentaires et Orthopédiques
              <br />
              Mobilier - Fournitures
              <br />
              Matériel Informatique
            </p>
          </div>
        </header>

        {/* Filigrane discret, comme sur le papier fourni */}
        <div className="pointer-events-none absolute left-1/2 top-[112mm] -translate-x-1/2 -translate-y-1/2 rotate-[-32deg] opacity-[0.035]">
          <Image
            src="/onyx-pharm-icon.png"
            alt=""
            width={330}
            height={330}
            className="h-[72mm] w-[72mm]"
          />
        </div>

        <main className="relative z-10">
          <div className="border-b-[1.5px] border-onyx-800 pb-3">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="text-[19px] font-bold uppercase tracking-[0.08em] text-onyx-900">
                  PROFORMA
                </p>
                <p className="mt-1 text-[9px] uppercase tracking-wide text-onyx-500">
                  Offre commerciale
                </p>
              </div>

              <div className="text-right text-[10px] leading-5">
                <p>
                  <span className="font-semibold">Référence :</span>{" "}
                  {reference || "—"}
                </p>
                <p>
                  <span className="font-semibold">Date :</span>{" "}
                  {formatDate(dateEmission)}
                </p>
              </div>
            </div>
          </div>

          <section className="mt-5 grid grid-cols-[1fr_1fr] gap-5">
            <div className="rounded-sm border border-onyx-200 px-3 py-2.5">
              <p className="text-[8px] font-bold uppercase tracking-wide text-onyx-500">
                Client
              </p>
              <p className="mt-1 text-[12px] font-semibold text-onyx-900">
                {clientNom || "—"}
              </p>
              {clientAdresse && (
                <p className="mt-0.5 text-[9px] leading-4 text-onyx-600">
                  {clientAdresse}
                </p>
              )}
            </div>

            <div className="rounded-sm border border-onyx-200 px-3 py-2.5">
              <p className="text-[8px] font-bold uppercase tracking-wide text-onyx-500">
                Conditions commerciales
              </p>
              <div className="mt-1.5 space-y-1 text-[9px]">
                <p>
                  <span className="font-semibold">Livraison :</span>{" "}
                  {delaiLivraison || "À convenir"}
                </p>
                <p>
                  <span className="font-semibold">Paiement :</span>{" "}
                  {modalitePaiement || "À convenir"}
                </p>
                <p>
                  <span className="font-semibold">Validité :</span>{" "}
                  {validiteOffre || "15 jours"}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-5">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-onyx-800 text-white">
                  <th className="border border-onyx-800 px-2.5 py-2 text-left text-[9px] font-semibold">
                    Désignation
                  </th>
                  <th className="w-[18mm] border border-onyx-800 px-2 py-2 text-center text-[9px] font-semibold">
                    Qté
                  </th>
                  <th className="w-[25mm] border border-onyx-800 px-2 py-2 text-center text-[9px] font-semibold">
                    Unité
                  </th>
                  <th className="w-[35mm] border border-onyx-800 px-2 py-2 text-right text-[9px] font-semibold">
                    Prix unitaire
                  </th>
                  <th className="w-[40mm] border border-onyx-800 px-2 py-2 text-right text-[9px] font-semibold">
                    Montant
                  </th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne, index) => {
                  const montant =
                    Number(ligne.quantite || 0) *
                    Number(ligne.prixUnitaireHT || 0);

                  return (
                    <tr key={`${ligne.designation}-${index}`}>
                      <td className="border border-onyx-200 px-2.5 py-2 text-[10px]">
                        {ligne.designation}
                      </td>
                      <td className="border border-onyx-200 px-2 py-2 text-center text-[10px]">
                        {ligne.quantite}
                      </td>
                      <td className="border border-onyx-200 px-2 py-2 text-center text-[10px]">
                        {ligne.unite || "Pce"}
                      </td>
                      <td className="border border-onyx-200 px-2 py-2 text-right text-[10px]">
                        {formatMontant(ligne.prixUnitaireHT)}
                      </td>
                      <td className="border border-onyx-200 px-2 py-2 text-right text-[10px] font-semibold">
                        {formatMontant(montant)}
                      </td>
                    </tr>
                  );
                })}

                {Array.from({
                  length: Math.max(0, Math.min(7, 7 - lignes.length)),
                }).map((_, index) => (
                  <tr key={`vide-${index}`} className="h-[9mm]">
                    <td className="border border-onyx-200" />
                    <td className="border border-onyx-200" />
                    <td className="border border-onyx-200" />
                    <td className="border border-onyx-200" />
                    <td className="border border-onyx-200" />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-5 flex justify-end">
            <div className="w-[76mm] border-t-[1.5px] border-onyx-800 pt-2.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold">TOTAL PROFORMA</span>
                <span className="text-[13px] font-bold">
                  {formatMontant(totalHT)}
                </span>
              </div>
            </div>
          </section>

          <section className="mt-5 border border-onyx-200 px-3 py-2.5">
            <p className="text-[8px] font-bold uppercase tracking-wide text-onyx-500">
              Observations
            </p>
            <p className="mt-1 text-[9px] leading-4 text-onyx-600">
              Le présent document constitue une offre proforma et ne vaut pas
              facture. Les quantités, prix et conditions indiqués sont ceux de
              l'offre présentée à la date d'émission.
            </p>
          </section>

          <section className="mt-7 flex items-end justify-between">
            <div className="text-[9px] text-onyx-600">
              <p className="font-semibold">Pour ONYX Pharm Sarl</p>
              {emisPar && <p className="mt-1">Émis par : {emisPar}</p>}
            </div>
            <div className="w-[48mm] border-t border-onyx-400 pt-1 text-center text-[9px] text-onyx-500">
              Signature et cachet
            </div>
          </section>
        </main>

        {/* Pied de page inspiré du papier à en-tête fourni */}
        <footer className="absolute bottom-[8mm] left-[15mm] right-[15mm] border-t-[1.5px] border-onyx-500 pt-2 text-center text-[7px] leading-[1.35] text-onyx-600">
          <p>
            Adresse : Abidjan-Cocody Riviera Palmeraie Sicogi, Rue lumière
            villa 222, non loin de la pharmacie du Bonheur
          </p>
          <p>
            Centre des impôts : RIVIERA 2 · Régime d'imposition : RME ·
            CC N° : 1317450 T
          </p>
          <p>
            RCCM : CI-ABJ-01-2012-B13-14398 · Compte Bancaire : CI54 01508
            00010019265 65 BSIC-Côte d&apos;Ivoire
          </p>
          <p>
            25 BP 1897 Abidjan 25 · Cel : (225) 07 47 78 08 39 · Email :
            onyxpharm@yahoo.fr
          </p>
        </footer>
      </div>
    </div>
  );
}
