"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { exporterExcelMisEnForme, lireFichierExcel } from "@/lib/excel";
import { normaliser } from "@/lib/normaliser";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";

const COLONNES_MODELE = ["Nom", "Téléphone", "Email", "Adresse", "Observations"];

export function ImportTiersSection() {
  const supabase = createClient();
  const fileInputRefClients = useRef<HTMLInputElement>(null);
  const fileInputRefFournisseurs = useRef<HTMLInputElement>(null);

  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<string | null>(null);
  const [importing, setImporting] = useState<"clients" | "fournisseurs" | null>(null);
  const [progression, setProgression] = useState({ actuel: 0, total: 0 });

  function telechargerModele(type: "clients" | "fournisseurs") {
    exporterExcelMisEnForme(
      type === "clients" ? "Modèle_Clients_Onyx_Pharm" : "Modèle_Fournisseurs_Onyx_Pharm",
      type === "clients" ? "Clients" : "Fournisseurs",
      COLONNES_MODELE,
      [
        {
          Nom: type === "clients" ? "Client Exemple" : "Fournisseur Exemple",
          Téléphone: "0700000000",
          Email: "",
          Adresse: "",
          Observations: "",
        },
      ]
    );
  }

  async function handleFichier(
    e: React.ChangeEvent<HTMLInputElement>,
    type: "clients" | "fournisseurs"
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErreur(null);
    setResultat(null);
    setImporting(type);

    try {
      const brutes = await lireFichierExcel(file);
      if (brutes.length === 0) {
        setErreur("Ce fichier ne contient aucune ligne.");
        setImporting(null);
        return;
      }

      let reussis = 0;
      let echoues = 0;
      let doublons = 0;
      const nomsVus = new Set<string>();

      const { data: existants } = await supabase.from(type).select("nom");
      const nomsExistants = new Set(
        (existants ?? []).map((t: { nom: string }) => normaliser(t.nom))
      );

      setProgression({ actuel: 0, total: brutes.length });

      for (const row of brutes) {
        setProgression((p) => ({ ...p, actuel: p.actuel + 1 }));
        const nom = String(row["Nom"] ?? "").trim();
        if (!nom) {
          echoues += 1;
          continue;
        }
        const nomNormalise = normaliser(nom);
        if (nomsExistants.has(nomNormalise) || nomsVus.has(nomNormalise)) {
          doublons += 1;
          continue;
        }
        nomsVus.add(nomNormalise);
        const { error } = await supabase.from(type).insert({
          nom,
          telephone: String(row["Téléphone"] ?? "").trim() || null,
          email: String(row["Email"] ?? "").trim() || null,
          adresse: String(row["Adresse"] ?? "").trim() || null,
          observations: String(row["Observations"] ?? "").trim() || null,
        });
        if (error) echoues += 1;
        else reussis += 1;
      }

      setResultat(
        `${reussis} ${type === "clients" ? "client(s)" : "fournisseur(s)"} importé(s)` +
          (doublons > 0 ? `, ${doublons} déjà existant(s) ignoré(s)` : "") +
          (echoues > 0 ? `, ${echoues} échec(s)` : "") +
          "."
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ONYX PHARM] Erreur lecture fichier import tiers", err);
      setErreur("Impossible de lire ce fichier. Utilisez le modèle .xlsx fourni.");
    }

    setImporting(null);
    if (type === "clients" && fileInputRefClients.current)
      fileInputRefClients.current.value = "";
    if (type === "fournisseurs" && fileInputRefFournisseurs.current)
      fileInputRefFournisseurs.current.value = "";
  }

  return (
    <div className="rounded-xl border border-onyx-100 bg-white p-5">
      <h2 className="text-sm font-semibold text-onyx-800">
        Importer des clients ou fournisseurs
      </h2>
      <p className="mt-1 text-sm text-onyx-500">
        Pour ajouter une liste existante d&apos;un coup plutôt qu&apos;un par
        un. Seul le nom est obligatoire.
      </p>

      {erreur && (
        <div className="mt-3">
          <InlineBanner message={erreur} />
        </div>
      )}
      {resultat && (
        <div className="mt-3">
          <InlineBanner type="success" message={resultat} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-onyx-50 p-4">
          <p className="mb-2 text-sm font-medium text-onyx-700">Clients</p>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton
              onClick={() => telechargerModele("clients")}
              className="min-h-0 px-3 py-2 text-xs"
            >
              <FileSpreadsheet size={14} />
              Modèle
            </SecondaryButton>
            <PrimaryButton
              onClick={() => fileInputRefClients.current?.click()}
              loading={importing === "clients"}
              className="min-h-0 px-3 py-2 text-xs"
            >
              <Upload size={14} />
              Importer
            </PrimaryButton>
            <input
              ref={fileInputRefClients}
              type="file"
              accept=".xlsx"
              onChange={(e) => handleFichier(e, "clients")}
              className="hidden"
            />
          </div>
        </div>

        <div className="rounded-lg bg-onyx-50 p-4">
          <p className="mb-2 text-sm font-medium text-onyx-700">Fournisseurs</p>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton
              onClick={() => telechargerModele("fournisseurs")}
              className="min-h-0 px-3 py-2 text-xs"
            >
              <FileSpreadsheet size={14} />
              Modèle
            </SecondaryButton>
            <PrimaryButton
              onClick={() => fileInputRefFournisseurs.current?.click()}
              loading={importing === "fournisseurs"}
              className="min-h-0 px-3 py-2 text-xs"
            >
              <Upload size={14} />
              Importer
            </PrimaryButton>
            <input
              ref={fileInputRefFournisseurs}
              type="file"
              accept=".xlsx"
              onChange={(e) => handleFichier(e, "fournisseurs")}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {importing && progression.total > 0 && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-onyx-100">
            <div
              className="h-full rounded-full bg-accent-500 transition-all duration-200"
              style={{
                width: `${Math.round((progression.actuel / progression.total) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-xs text-onyx-400">
            {progression.actuel} / {progression.total} traité
            {progression.actuel > 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
