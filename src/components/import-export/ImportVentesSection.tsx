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
  "Avance",
  "Reste",
];

type LigneBrute = Record<string, unknown>;

type LigneResolue = {
  article_id: string;
  designation: string;
  emplacement_id: string;
  quantite: number;
  prix: number;
};

type GroupeVente = {
  numero: string;
  lignesBrutes: LigneBrute[];
  lignesResolues: LigneResolue[];
  dateVente: string | null;
  nomClient: string;
  montantTotal: number;
  erreurs: string[];
  avertissements: string[];
  doublonProbable: boolean;
  valide: boolean;
};

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

  const [groupes, setGroupes] = useState<GroupeVente[]>([]);
  const [analyse, setAnalyse] = useState(false);
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progression, setProgression] = useState({ actuel: 0, total: 0 });
  const [resultat, setResultat] = useState<string | null>(null);
  const [resultatErreur, setResultatErreur] = useState(false);
  const [modeHistorique, setModeHistorique] = useState(false);

  // Si un fichier a déjà été analysé et qu'on change de mode ensuite,
  // les règles de validation (emplacement obligatoire ou non) changent
  // aussi — on efface la liste pour éviter d'importer sur la base
  // d'une analyse faite avec l'ancien mode.
  useEffect(() => {
    if (groupes.length > 0) {
      setGroupes([]);
      setErreurGenerale(
        "Mode changé : rechargez le fichier."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeHistorique]);

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
        Avance: 5000,
        Reste: "",
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
        Avance: "",
        Reste: "",
      },
      {
        "N° de vente (regroupement)": "V2",
        "Date de vente": "2025-03-15",
        Client: "Ancien Client",
        Article: "Gants stériles",
        Emplacement: "",
        Quantité: 20,
        "Prix de vente unitaire": 300,
        "Mode de paiement": "",
        Avance: "",
        Reste: "",
      },
    ]);
  }

  async function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErreurGenerale(null);
    setResultat(null);
    setGroupes([]);
    setAnalyse(true);

    try {
      const brutes = await lireFichierExcel(file);
      if (brutes.length === 0) {
        setErreurGenerale("Ce fichier ne contient aucune ligne.");
        setAnalyse(false);
        return;
      }

      // Regroupe les lignes par numéro de vente.
      const parGroupe = new Map<string, LigneBrute[]>();
      for (const l of brutes) {
        const cle = String(l["N° de vente (regroupement)"] ?? "").trim();
        if (!cle) continue;
        if (!parGroupe.has(cle)) parGroupe.set(cle, []);
        parGroupe.get(cle)!.push(l);
      }

      if (parGroupe.size === 0) {
        setErreurGenerale(
          "Aucune ligne valide : la colonne \"N° de vente (regroupement)\" doit être renseignée."
        );
        setAnalyse(false);
        return;
      }

      const resultats: GroupeVente[] = [];

      for (const [numero, lignesBrutes] of Array.from(parGroupe.entries())) {
        const premiere = lignesBrutes[0];
        const dateVente = String(premiere["Date de vente"] ?? "").trim() || null;
        const nomClient = String(premiere.Client ?? "").trim();
        const erreurs: string[] = [];
        const avertissements: string[] = [];
        const lignesResolues: LigneResolue[] = [];

        for (const l of lignesBrutes) {
          const designation = String(l.Article ?? "").trim();
          const nomEmplacement = String(l.Emplacement ?? "").trim();
          const quantite = Number(l["Quantité"]);
          const prix = Number(l["Prix de vente unitaire"]) || 0;

          if (!designation || !quantite || quantite <= 0) {
            erreurs.push("Ligne incomplète (article et quantité obligatoires)");
            continue;
          }
          if (!modeHistorique && !nomEmplacement) {
            erreurs.push("Emplacement obligatoire pour une vente récente");
            continue;
          }

          const { data: article } = await supabase
            .from("articles")
            .select("id, designation")
            .ilike("designation", designation)
            .limit(1)
            .maybeSingle();
          if (!article) {
            erreurs.push(`Article "${designation}" introuvable`);
            continue;
          }

          // En mode "ventes anciennes", l'emplacement n'a plus aucun
          // effet réel (rien n'est retiré du stock) — on ne bloque donc
          // jamais sur lui : s'il est absent ou introuvable, on utilise
          // un emplacement technique par défaut, juste pour respecter
          // la structure de la base.
          let emplacementId: string | undefined;
          if (nomEmplacement) {
            const emplacementTrouve = emplacements.find(
              (e) => normaliser(e.nom) === normaliser(nomEmplacement)
            );
            emplacementId = emplacementTrouve?.id;
            if (!emplacementId && !modeHistorique) {
              erreurs.push(`Emplacement "${nomEmplacement}" introuvable`);
              continue;
            }
          }
          if (!emplacementId) {
            if (!modeHistorique) {
              erreurs.push("Emplacement obligatoire pour une vente récente");
              continue;
            }
            emplacementId = emplacements[0]?.id;
          }
          if (!emplacementId) {
            erreurs.push("Aucun emplacement n'existe dans le système.");
            continue;
          }

          lignesResolues.push({
            article_id: article.id,
            designation: article.designation,
            emplacement_id: emplacementId,
            quantite,
            prix,
          });
        }

        const montantTotal = lignesResolues.reduce((s, l) => s + l.quantite * l.prix, 0);
        const avanceBrute = premiere["Avance"];
        const avance = avanceBrute === undefined || avanceBrute === null || String(avanceBrute).trim() === ""
          ? 0
          : Number(avanceBrute);
        const resteBrut = premiere["Reste"];
        const resteExcel = resteBrut === undefined || resteBrut === null || String(resteBrut).trim() === ""
          ? null
          : Number(resteBrut);
        if (!Number.isFinite(avance) || avance < 0) {
          erreurs.push(`Avance invalide : « ${String(avanceBrute ?? "")} ». Utilisez un montant supérieur ou égal à 0.`);
        } else if (avance > montantTotal && montantTotal >= 0) {
          erreurs.push(`Avance trop élevée : ${avance.toLocaleString("fr-FR")} FCFA pour une vente de ${montantTotal.toLocaleString("fr-FR")} FCFA.`);
        }
        const resteCalcule = Math.max(0, montantTotal - (Number.isFinite(avance) ? avance : 0));
        if (resteExcel !== null && (!Number.isFinite(resteExcel) || resteExcel < 0)) {
          erreurs.push(`Reste invalide : « ${String(resteBrut)} ».`);
        } else if (resteExcel !== null && Math.abs((resteExcel as number) - resteCalcule) > 0.01) {
          avertissements.push(`Reste Excel (${(resteExcel as number).toLocaleString("fr-FR")} FCFA) différent du reste calculé (${resteCalcule.toLocaleString("fr-FR")} FCFA). Le calcul système sera conservé.`);
        }

        // Détection de doublon : une vente déjà enregistrée pour le même
        // client, la même date et le même montant total existe-t-elle
        // déjà ? Ce n'est qu'un signal d'alerte (pas un blocage) — deux
        // vraies ventes différentes peuvent coïncider par hasard.
        let doublonProbable = false;
        if (nomClient && dateVente && montantTotal > 0) {
          const clientExistant = clients.find(
            (c) => normaliser(c.nom) === normaliser(nomClient)
          );
          if (clientExistant) {
            const { data: doublons } = await supabase
              .from("ventes")
              .select("id")
              .eq("client_id", clientExistant.id)
              .eq("date_vente", dateVente)
              .eq("montant_total", montantTotal)
              .neq("statut", "Annulé")
              .limit(1);
            doublonProbable = Boolean(doublons && doublons.length > 0);
          }
        }

        resultats.push({
          numero,
          lignesBrutes,
          lignesResolues,
          dateVente,
          nomClient,
          montantTotal,
          erreurs,
          doublonProbable,
          valide: erreurs.length === 0,
        });
      }

      setGroupes(resultats);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ONYX PHARM] Erreur lecture fichier import ventes", err);
      setErreurGenerale("Impossible de lire ce fichier. Utilisez le modèle .xlsx fourni.");
    }
    setAnalyse(false);
  }

  async function confirmerImport() {
    setImporting(true);
    setProgression({ actuel: 0, total: groupes.length });
    setErreurGenerale(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const clientsTravail = [...clients];
    let reussies = 0;
    let enBrouillon = 0;
    let echouees = 0;
    const erreursDetail: string[] = [];

    for (const groupe of groupes) {
      setProgression((p) => ({ ...p, actuel: p.actuel + 1 }));
      if (!groupe.valide) {
        echouees += 1;
        continue;
      }

      let clientId: string | null = null;
      if (groupe.nomClient) {
        clientId = await trouverOuCreer(groupe.nomClient, clientsTravail, async (nomSaisi) => {
          const { data } = await supabase
            .from("clients")
            .insert({ nom: nomSaisi })
            .select("id, nom")
            .single();
          return data;
        });
      }

      const { data: refData, error: refError } = await supabase.rpc(
        "generer_numero_document",
        { p_prefixe: "FAC" }
      );
      if (refError || !refData) {
        erreursDetail.push(`Vente ${groupe.numero} : impossible de générer une référence.`);
        echouees += 1;
        continue;
      }

      const { data: vente, error: venteError } = await supabase
        .from("ventes")
        .insert({
          reference: refData,
          client_id: clientId,
          date_vente: groupe.dateVente ?? new Date().toISOString().slice(0, 10),
          montant_total: groupe.montantTotal,
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
            `Vente ${groupe.numero} : impossible de la créer.`
          )
        );
        echouees += 1;
        continue;
      }

      const { error: lignesError } = await supabase.from("lignes_ventes").insert(
        groupe.lignesResolues.map((l) => ({
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
        erreursDetail.push(`Vente ${groupe.numero} : lignes non enregistrées.`);
        echouees += 1;
        continue;
      }

      const prixManquant = groupe.lignesResolues.some((l) => !l.prix || l.prix <= 0);
      if (prixManquant) {
        enBrouillon += 1;
        continue;
      }

      if (modeHistorique) {
        const { error: majStatutError } = await supabase
          .from("ventes")
          .update({ statut: "Validé" })
          .eq("id", vente.id);

        if (majStatutError) {
          erreursDetail.push(`Vente ${groupe.numero} créée en brouillon, mais non validée.`);
          enBrouillon += 1;
          continue;
        }

        await supabase.from("historique").insert({
          utilisateur_id: user?.id ?? null,
          action: "validation",
          table_cible: "ventes",
          enregistrement_id: vente.id,
          description: `Vente historique ${refData} importée et validée sans impact sur le stock actuel (antérieure au suivi de stock).`,
        });
      } else {
        const { error: validationError } = await supabase.rpc("valider_vente", {
          p_vente_id: vente.id,
          p_utilisateur_id: user?.id ?? null,
        });

        if (validationError) {
          erreursDetail.push(
            `Vente ${groupe.numero} créée en brouillon, mais non validée : ${validationError.message}`
          );
          enBrouillon += 1;
          continue;
        }
      }

      const premiere = groupe.lignesBrutes[0];
      // IMPORTANT : le total de la vente n'est pas un paiement.
      // L'Excel utilise désormais "Avance" pour le montant réellement encaissé.
      // "Reste" est une information de contrôle et reste dérivé en base.
      const avance = Number(premiere["Avance"]) || 0;
      const resteExcelBrut = premiere["Reste"];
      const resteExcel =
        resteExcelBrut !== undefined && resteExcelBrut !== null && String(resteExcelBrut).trim() !== ""
          ? Number(resteExcelBrut)
          : null;
      const resteCalcule = Math.max(0, groupe.montantTotal - avance);

      if (resteExcel !== null && Number.isFinite(resteExcel) && Math.abs(resteExcel - resteCalcule) > 0.01) {
        erreursDetail.push(
          `Vente ${groupe.numero} : le reste indiqué dans Excel (${resteExcel.toLocaleString("fr-FR")} FCFA) ne correspond pas au reste calculé (${resteCalcule.toLocaleString("fr-FR")} FCFA).`
        );
      }

      if (avance > 0) {
        if (avance > groupe.montantTotal) {
          erreursDetail.push(
            `Vente ${groupe.numero} : l'avance (${avance.toLocaleString("fr-FR")} FCFA) dépasse le total de la vente (${groupe.montantTotal.toLocaleString("fr-FR")} FCFA).`
          );
        } else {
          const { error: paiementImportError } = await supabase.from("paiements_ventes").insert({
            vente_id: vente.id,
            montant: avance,
            mode_paiement: String(premiere["Mode de paiement"] ?? "").trim() || "Espèces",
            date_paiement: groupe.dateVente ?? new Date().toISOString().slice(0, 10),
            created_by: user?.id ?? null,
          });
          if (paiementImportError) {
            erreursDetail.push(
              `Vente ${groupe.numero} : vente créée mais avance non enregistrée : ${paiementImportError.message}`
            );
          }
        }
      }

      reussies += 1;
    }

    setImporting(false);
    const echecTotal = echouees > 0;
    setResultatErreur(echecTotal);
    setResultat(
      `${reussies} vente(s) validée(s)` +
        (enBrouillon > 0
          ? `, ${enBrouillon} laissée(s) en brouillon (prix manquant — à confirmer puis valider dans Ventes)`
          : "") +
        (echouees > 0 ? `, ${echouees} échec(s) ou ignorée(s)` : "") +
        "." +
        (erreursDetail.length > 0 ? " Détail : " + erreursDetail.join(" | ") : "")
    );
    setGroupes([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const nbValides = groupes.filter((g) => g.valide).length;
  const nbErreurs = groupes.length - nbValides;
  const nbDoublons = groupes.filter((g) => g.doublonProbable).length;

  return (
    <div className="rounded-xl border border-onyx-100 bg-white p-5">
      <h2 className="text-sm font-semibold text-onyx-800">
        Importer des ventes
      </h2>
      <p className="mt-1 text-sm text-onyx-500">
        Une ligne = un article vendu. Regroupez les articles d&apos;une
        même vente avec le même numéro en première colonne.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setModeHistorique(false)}
          className={`rounded-lg border p-3.5 text-left transition-colors ${
            !modeHistorique
              ? "border-accent-400 bg-accent-50"
              : "border-onyx-200 hover:bg-onyx-50"
          }`}
        >
          <p className="text-sm font-medium text-onyx-800">Ventes récentes</p>
          <p className="mt-0.5 text-xs text-onyx-500">
            Diminue le stock actuel
          </p>
        </button>
        <button
          type="button"
          onClick={() => setModeHistorique(true)}
          className={`rounded-lg border p-3.5 text-left transition-colors ${
            modeHistorique
              ? "border-accent-400 bg-accent-50"
              : "border-onyx-200 hover:bg-onyx-50"
          }`}
        >
          <p className="text-sm font-medium text-onyx-800">Ventes anciennes</p>
          <p className="mt-0.5 text-xs text-onyx-500">
            Ne touche pas au stock
          </p>
        </button>
      </div>

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
          <InlineBanner
            type={resultatErreur ? "error" : "success"}
            message={resultat}
          />
        </div>
      )}
      {analyse && (
        <p className="mt-3 text-sm text-onyx-400">Analyse en cours...</p>
      )}

      {groupes.length > 0 && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-onyx-50/50 px-3.5 py-2.5 text-sm">
            <span className="text-onyx-600">
              {groupes.length} vente{groupes.length > 1 ? "s" : ""} détectée
              {groupes.length > 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 size={14} /> {nbValides} valide{nbValides > 1 ? "s" : ""}
            </span>
            {nbErreurs > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertCircle size={14} /> {nbErreurs} en erreur
              </span>
            )}
            {nbDoublons > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertCircle size={14} /> {nbDoublons} doublon(s) possible(s)
              </span>
            )}
          </div>

          <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-onyx-100">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-onyx-50">
                <tr className="text-left text-onyx-400">
                  <th className="px-3 py-2">N°</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Articles</th>
                  <th className="px-3 py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {groupes.map((g) => (
                  <tr key={g.numero} className="border-t border-onyx-50">
                    <td className="px-3 py-2 text-onyx-400">{g.numero}</td>
                    <td className="px-3 py-2 text-onyx-700">
                      {g.nomClient || "Client de passage"}
                    </td>
                    <td className="px-3 py-2 text-onyx-500">{g.dateVente ?? "—"}</td>
                    <td className="px-3 py-2 text-onyx-500">
                      {g.lignesResolues.map((l) => l.designation).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {!g.valide ? (
                        <span className="text-red-500">{g.erreurs.join(" · ")}</span>
                      ) : g.doublonProbable ? (
                        <span className="text-amber-600">
                          Doublon possible
                        </span>
                      ) : (
                        <span className="text-emerald-600">Valide</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <PrimaryButton
              onClick={confirmerImport}
              loading={importing}
              disabled={nbValides === 0}
            >
              Importer {nbValides} vente{nbValides > 1 ? "s" : ""}
            </PrimaryButton>
            {importing && progression.total > 0 && (
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-onyx-100">
                  <div
                    className="h-full rounded-full bg-accent-500 transition-all duration-200"
                    style={{
                      width: `${Math.round(
                        (progression.actuel / progression.total) * 100
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-onyx-400">
                  {progression.actuel} / {progression.total} traitée
                  {progression.actuel > 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
