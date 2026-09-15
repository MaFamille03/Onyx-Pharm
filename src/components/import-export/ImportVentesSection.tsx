"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { exporterExcelMisEnForme, lireFichierExcel } from "@/lib/excel";
import { normaliser, trouverOuCreer } from "@/lib/normaliser";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { useReferenceData } from "@/lib/hooks/useReferenceData";

const COLONNES_MODELE = [
  "N° de vente (regroupement)",
  "Date de vente",
  "Client",
  "Article",
  "Emplacement",
  "Quantité",
  "Prix de vente unitaire",
  "Mode de paiement",
  "Montant payé",
];

type LigneBrute = Record<string, unknown>;

export function ImportVentesSection() {
  const supabase = createClient();
  const { emplacements } = useReferenceData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clients, setClients] = useState<{ id: string; nom: string }[]>([]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, nom")
      .then(({ data }) => setClients(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [lignes, setLignes] = useState<LigneBrute[]>([]);
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);

  function telechargerModele() {
    exporterExcelMisEnForme("Modèle_Ventes_Onyx_Pharm", "Modèle", COLONNES_MODELE, [
      {
        "N° de vente (regroupement)": "V1",
        "Date de vente": "2026-09-01",
        Client: "Client Exemple",
        Article: "Paracétamol 500 mg",
        Emplacement: emplacements[0]?.nom ?? "Entrepôt",
        Quantité: 10,
        "Prix de vente unitaire": 500,
        "Mode de paiement": "Espèces",
        "Montant payé": 5000,
      },
      {
        "N° de vente (regroupement)": "V1",
        "Date de vente": "2026-09-01",
        Client: "Client Exemple",
        Article: "Compresses stériles",
        Emplacement: emplacements[0]?.nom ?? "Entrepôt",
        Quantité: 3,
        "Prix de vente unitaire": 1000,
        "Mode de paiement": "",
        "Montant payé": "",
      },
    ]);
  }

  async function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErreurGenerale(null);
    setResultat(null);
    try {
      const brutes = await lireFichierExcel(file);
      if (brutes.length === 0) {
        setErreurGenerale("Ce fichier ne contient aucune ligne.");
        return;
      }
      setLignes(brutes);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ONYX PHARM] Erreur lecture fichier import ventes", err);
      setErreurGenerale("Impossible de lire ce fichier. Utilisez le modèle .xlsx fourni.");
    }
  }

  async function confirmerImport() {
    setImporting(true);
    setErreurGenerale(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const groupes = new Map<string, LigneBrute[]>();
    for (const l of lignes) {
      const cle = String(l["N° de vente (regroupement)"] ?? "").trim();
      if (!cle) continue;
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle)!.push(l);
    }

    if (groupes.size === 0) {
      setErreurGenerale(
        "Aucune ligne valide : la colonne \"N° de vente (regroupement)\" doit être renseignée."
      );
      setImporting(false);
      return;
    }

    const clientsTravail = [...clients];
    let reussies = 0;
    let echouees = 0;
    const erreursDetail: string[] = [];

    for (const [numero, groupeLignes] of Array.from(groupes.entries())) {
      const premiere = groupeLignes[0];
      const dateVente = String(premiere["Date de vente"] ?? "").trim() || null;
      const nomClient = String(premiere.Client ?? "").trim();

      let clientId: string | null = null;
      if (nomClient) {
        clientId = await trouverOuCreer(nomClient, clientsTravail, async (nomSaisi) => {
          const { data } = await supabase
            .from("clients")
            .insert({ nom: nomSaisi })
            .select("id, nom")
            .single();
          return data;
        });
      }

      const lignesResolues: {
        article_id: string;
        emplacement_id: string;
        quantite: number;
        prix: number;
      }[] = [];
      let erreurLigne: string | null = null;

      for (const l of groupeLignes) {
        const designation = String(l.Article ?? "").trim();
        const nomEmplacement = String(l.Emplacement ?? "").trim();
        const quantite = Number(l["Quantité"]);
        const prix = Number(l["Prix de vente unitaire"]) || 0;

        if (!designation || !nomEmplacement || !quantite || quantite <= 0) {
          erreurLigne = `Vente ${numero} : ligne incomplète (article, emplacement et quantité obligatoires).`;
          break;
        }

        const { data: article } = await supabase
          .from("articles")
          .select("id, designation")
          .ilike("designation", designation)
          .limit(1)
          .maybeSingle();
        if (!article) {
          erreurLigne = `Vente ${numero} : article "${designation}" introuvable.`;
          break;
        }

        const emplacement = emplacements.find(
          (e) => normaliser(e.nom) === normaliser(nomEmplacement)
        );
        if (!emplacement) {
          erreurLigne = `Vente ${numero} : emplacement "${nomEmplacement}" introuvable.`;
          break;
        }

        lignesResolues.push({
          article_id: article.id,
          emplacement_id: emplacement.id,
          quantite,
          prix,
        });
      }

      if (erreurLigne) {
        erreursDetail.push(erreurLigne);
        echouees += 1;
        continue;
      }

      const { data: refData, error: refError } = await supabase.rpc(
        "generer_numero_document",
        { p_prefixe: "FAC" }
      );
      if (refError || !refData) {
        erreursDetail.push(`Vente ${numero} : impossible de générer une référence.`);
        echouees += 1;
        continue;
      }

      const montantTotal = lignesResolues.reduce(
        (s, l) => s + l.quantite * l.prix,
        0
      );

      const { data: vente, error: venteError } = await supabase
        .from("ventes")
        .insert({
          reference: refData,
          client_id: clientId,
          date_vente: dateVente ?? new Date().toISOString().slice(0, 10),
          montant_total: montantTotal,
          statut: "Brouillon",
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();

      if (venteError || !vente) {
        erreursDetail.push(
          logSupabaseError(
            { table: "ventes", operation: "insert (import Excel)" },
            venteError,
            `Vente ${numero} : impossible de la créer.`
          )
        );
        echouees += 1;
        continue;
      }

      const { error: lignesError } = await supabase.from("lignes_ventes").insert(
        lignesResolues.map((l) => ({
          vente_id: vente.id,
          article_id: l.article_id,
          emplacement_id: l.emplacement_id,
          quantite: l.quantite,
          prix_achat_reference: 0,
          prix_vente_conseille_reference: l.prix,
          prix_vente_reel: l.prix,
          remise: 0,
        }))
      );

      if (lignesError) {
        erreursDetail.push(`Vente ${numero} : lignes non enregistrées.`);
        echouees += 1;
        continue;
      }

      const { error: validationError } = await supabase.rpc("valider_vente", {
        p_vente_id: vente.id,
        p_utilisateur_id: user?.id ?? null,
      });

      if (validationError) {
        erreursDetail.push(
          `Vente ${numero} créée en brouillon, mais non validée : ${validationError.message}`
        );
        reussies += 1;
        continue;
      }

      const montantPaye = Number(premiere["Montant payé"]) || 0;
      if (montantPaye > 0) {
        await supabase.from("paiements_ventes").insert({
          vente_id: vente.id,
          montant: montantPaye,
          mode_paiement: String(premiere["Mode de paiement"] ?? "").trim() || "Espèces",
          date_paiement: dateVente ?? new Date().toISOString().slice(0, 10),
          created_by: user?.id ?? null,
        });
      }

      reussies += 1;
    }

    setImporting(false);
    setResultat(
      `${reussies} vente(s) importée(s) avec succès${
        echouees > 0 ? `, ${echouees} échec(s)` : ""
      }.${erreursDetail.length > 0 ? " Détail : " + erreursDetail.join(" | ") : ""}`
    );
    setLignes([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const nbGroupes = new Set(
    lignes
      .map((l) => String(l["N° de vente (regroupement)"] ?? "").trim())
      .filter(Boolean)
  ).size;

  return (
    <div className="rounded-xl border border-onyx-100 bg-white p-5">
      <h2 className="text-sm font-semibold text-onyx-800">
        Importer des ventes
      </h2>
      <p className="mt-1 text-sm text-onyx-500">
        Pour enregistrer plusieurs ventes déjà réalisées en une seule fois.
        Chaque ligne du fichier est un article vendu ; regroupez les
        articles d&apos;une même vente avec le même &quot;N° de
        vente&quot; dans la première colonne. Les articles doivent déjà
        exister et être en stock — le client, lui, est créé
        automatiquement s&apos;il n&apos;existe pas encore.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <SecondaryButton onClick={telechargerModele} className="min-h-0 px-3 py-2 text-xs">
          <FileSpreadsheet size={14} />
          Télécharger le modèle
        </SecondaryButton>
        <SecondaryButton
          onClick={() => fileInputRef.current?.click()}
          className="min-h-0 px-3 py-2 text-xs"
        >
          <Upload size={14} />
          Choisir un fichier .xlsx
        </SecondaryButton>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFichier}
          className="hidden"
        />
      </div>

      {erreurGenerale && (
        <div className="mt-3">
          <InlineBanner message={erreurGenerale} />
        </div>
      )}
      {resultat && (
        <div className="mt-3">
          <InlineBanner type="success" message={resultat} />
        </div>
      )}

      {lignes.length > 0 && (
        <div className="mt-4 rounded-lg bg-onyx-50 p-4">
          <p className="flex items-center gap-1.5 text-sm text-onyx-700">
            <CheckCircle2 size={15} className="text-emerald-600" />
            {lignes.length} ligne(s) lue(s), regroupées en {nbGroupes} vente(s).
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-onyx-400">
            <AlertCircle size={13} />
            Vérifiez que les articles et emplacements existent déjà avant de
            confirmer — ils ne seront pas créés automatiquement.
          </p>
          <PrimaryButton onClick={confirmerImport} loading={importing} className="mt-3">
            Importer ces {nbGroupes} vente(s)
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
