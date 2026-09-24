"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, MapPin } from "lucide-react";
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

type ArticleImport = {
  id: string;
  designation: string;
  statut: string;
};

type StockImport = {
  article_id: string;
  emplacement_id: string;
  quantite: number;
};

type CorrespondanceArticle = {
  article: ArticleImport;
  type: "exact" | "approx";
  score: number;
};

type LigneResolue = {
  article_id: string;
  designation: string;
  emplacement_id: string;
  quantite: number;
  prix: number;
  problemeQuantite?: { disponible: number; demande: number };
};

type GroupeVente = {
  numero: string;
  lignesBrutes: LigneBrute[];
  lignesResolues: LigneResolue[];
  dateVente: string | null;
  nomClient: string;
  montantTotal: number;
  erreurs: string[];
  doublonProbable: boolean;
  valide: boolean;
  avertissements: string[];
  suggestionsArticles: string[];
};


/**
 * Distance de Levenshtein utilisée uniquement pour départager les
 * désignations proches. Elle ne remplace jamais la correspondance exacte.
 */
function distanceLevenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cout
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function normaliserDesignation(texte: string): string {
  return normaliser(texte)
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2");
}

function similariteTexte(a: string, b: string): number {
  const gauche = normaliserDesignation(a);
  const droite = normaliserDesignation(b);
  if (!gauche || !droite) return 0;
  if (gauche === droite) return 1;

  // Une désignation importée peut être une forme courte de celle du stock.
  // Exemple : "gants nitrile M" vs "gants nitrile non stériles taille M".
  // On valorise donc les mots significatifs présents dans les deux textes.
  const motsA = new Set(gauche.split(" ").filter((mot) => mot.length >= 2));
  const motsB = new Set(droite.split(" ").filter((mot) => mot.length >= 2));
  const communs = Array.from(motsA).filter((mot) => motsB.has(mot)).length;

  const couvertureImport = motsA.size > 0 ? communs / motsA.size : 0;
  const jaccard = motsA.size + motsB.size - communs > 0
    ? communs / (motsA.size + motsB.size - communs)
    : 0;

  const longueurMax = Math.max(gauche.length, droite.length);
  const proximiteEdition = longueurMax
    ? 1 - distanceLevenshtein(gauche, droite) / longueurMax
    : 0;

  // La couverture de la désignation importée est volontairement prioritaire :
  // une forme courte peut être reconnue si tous ses mots sont présents dans
  // la désignation du stock.
  return (
    couvertureImport * 0.70 +
    jaccard * 0.20 +
    proximiteEdition * 0.10
  );
}

function trouverArticle(
  designationRecherchee: string,
  articles: ArticleImport[]
): CorrespondanceArticle | null {
  const recherche = normaliserDesignation(designationRecherchee);
  if (!recherche) return null;

  // 1. Correspondance exacte après normalisation : priorité absolue.
  const exacts = articles.filter((article) => normaliserDesignation(article.designation) === recherche);
  if (exacts.length === 1) {
    return { article: exacts[0], type: "exact", score: 1 };
  }
  if (exacts.length > 1) {
    // Cette situation est anormale (deux articles portant le même nom).
    return null;
  }

  // 2. Correspondance approximative uniquement si elle est suffisamment forte.
  const candidats = articles
    .map((article) => ({
      article,
      score: similariteTexte(designationRecherchee, article.designation),
    }))
    .filter((candidat) => candidat.score >= 0.58)
    .sort((a, b) => b.score - a.score);

  if (candidats.length === 0) return null;

  const meilleur = candidats[0];
  const second = candidats[1];

  // On refuse une correspondance approximative si deux articles sont trop
  // proches : mieux vaut demander une désignation plus précise que vendre le
  // mauvais article.
  if (second && meilleur.score - second.score < 0.05) return null;

  return {
    article: meilleur.article,
    type: "approx",
    score: meilleur.score,
  };
}

function trouverSuggestionsArticles(
  designationRecherchee: string,
  articles: ArticleImport[],
  limite = 3
): Array<{ article: ArticleImport; score: number }> {
  const recherche = normaliserDesignation(designationRecherchee);
  if (!recherche) return [];

  return articles
    .map((article) => ({
      article,
      score: similariteTexte(designationRecherchee, article.designation),
    }))
    .filter((candidat) => candidat.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}

function trouverEmplacementSouple(nomRecherche: string, emplacements: Array<{ id: string; nom: string }>) {
  const recherche = normaliserDesignation(nomRecherche);
  if (!recherche) return null;

  const exact = emplacements.find((e) => normaliserDesignation(e.nom) === recherche);
  if (exact) return { emplacement: exact, score: 1, exact: true };

  const candidats = emplacements
    .map((e) => ({ emplacement: e, score: similariteTexte(nomRecherche, e.nom) }))
    .sort((a, b) => b.score - a.score);

  const meilleur = candidats[0];
  const second = candidats[1];
  if (!meilleur || meilleur.score < 0.45) return null;
  if (second && meilleur.score - second.score < 0.05) return null;
  return { emplacement: meilleur.emplacement, score: meilleur.score, exact: false };
}


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
      {
        "N° de vente (regroupement)": "V2",
        "Date de vente": "2025-03-15",
        Client: "Ancien Client",
        Article: "Gants stériles",
        Emplacement: "",
        Quantité: 20,
        "Prix de vente unitaire": 300,
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
    setGroupes([]);
    setAnalyse(true);

    try {
      const brutes = await lireFichierExcel(file);
      if (brutes.length === 0) {
        setErreurGenerale("Ce fichier ne contient aucune ligne.");
        setAnalyse(false);
        return;
      }

      // Charge les articles et les stocks une seule fois. L'ancien code faisait
      // une requête Supabase par ligne Excel, ce qui rendait l'import lent et
      // surtout empêchait une vérification cohérente de la quantité disponible.
      const [articlesResult, stocksResult] = await Promise.all([
        supabase
          .from("articles")
          .select("id, designation, statut")
          .order("designation"),
        supabase
          .from("stocks")
          .select("article_id, emplacement_id, quantite"),
      ]);

      if (articlesResult.error) {
        throw new Error(`Impossible de charger les articles : ${articlesResult.error.message}`);
      }
      if (stocksResult.error) {
        throw new Error(`Impossible de charger les stocks : ${stocksResult.error.message}`);
      }

      const articles = (articlesResult.data ?? []) as ArticleImport[];
      const stocks = (stocksResult.data ?? []) as StockImport[];

      if (articles.length === 0) {
        setErreurGenerale("Aucun article n'est enregistré dans le stock/catalogue.");
        setAnalyse(false);
        return;
      }

      const stockParCle = new Map<string, number>();
      for (const stock of stocks) {
        const cle = `${stock.article_id}|${stock.emplacement_id}`;
        stockParCle.set(cle, (stockParCle.get(cle) ?? 0) + Number(stock.quantite || 0));
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

      // Quantités déjà réservées par le fichier importé. Cela évite de valider
      // deux lignes qui consomment ensemble plus que le stock disponible.
      const quantitesImportees = new Map<string, number>();
      const resultats: GroupeVente[] = [];

      for (const [numero, lignesBrutes] of Array.from(parGroupe.entries())) {
        const premiere = lignesBrutes[0];
        const dateVente = String(premiere["Date de vente"] ?? "").trim() || null;
        const nomClient = String(premiere.Client ?? "").trim();
        const erreurs: string[] = [];
        const avertissements: string[] = [];
        const suggestionsArticles: string[] = [];
        const lignesResolues: LigneResolue[] = [];

        for (const l of lignesBrutes) {
          const designation = String(l.Article ?? "").trim();
          const nomEmplacement = String(l.Emplacement ?? "").trim();
          const quantite = Number(l["Quantité"]);
          const prix = Number(l["Prix de vente unitaire"]) || 0;

          if (!designation || !quantite || quantite <= 0) {
            erreurs.push("Ligne incomplète : article et quantité sont obligatoires.");
            continue;
          }

          const correspondance = trouverArticle(designation, articles);
          if (!correspondance) {
            const suggestions = trouverSuggestionsArticles(designation, articles);
            if (suggestions.length > 0) {
              erreurs.push(`Article « ${designation} » non identifié. Choisissez une proposition ci-dessous.`);
              suggestionsArticles.push(
                `Article demandé : ${designation}\nPropositions : ${suggestions.map((s) => s.article.designation).join("\n")}`
              );
            } else {
              erreurs.push(`Article « ${designation} » introuvable. Vérifiez la désignation.`);
            }
            continue;
          }

          const article = correspondance.article;

          // Information utile dans l'interface/logs : on conserve la vraie
          // désignation enregistrée dans le catalogue, même si le fichier Excel
          // utilise une variante de nom.
          if (correspondance.type === "approx") {
            // Pas une erreur : la correspondance est suffisamment forte et
            // unique. Elle sera affichée comme une résolution automatique.
          }

          // En mode historique, l'emplacement n'a pas d'impact sur le stock.
          // On conserve toutefois un emplacement technique pour respecter la
          // structure de la table lignes_ventes.
          let emplacementId: string | undefined;
          if (nomEmplacement) {
            const emplacementTrouve = trouverEmplacementSouple(nomEmplacement, emplacements);
            emplacementId = emplacementTrouve?.emplacement.id;

            if (emplacementTrouve && !emplacementTrouve.exact) {
              avertissements.push(
                `Emplacement « ${nomEmplacement} » rapproché de « ${emplacementTrouve.emplacement.nom} ». Vérifiez le choix.`
              );
            }

            if (!emplacementId && !modeHistorique) {
              // Ne bloque plus l'import : on affecte provisoirement le premier
              // emplacement actif. L'utilisateur peut immédiatement le changer
              // dans le tableau avant de lancer l'import.
              const emplacementParDefaut = emplacements.find((e) => e.actif) ?? emplacements[0];
              emplacementId = emplacementParDefaut?.id;
              if (emplacementId) {
                avertissements.push(
                  `Emplacement « ${nomEmplacement} » non reconnu. Sélectionnez le bon emplacement dans la colonne Emplacement.`
                );
              }
            }
          }

          if (!emplacementId) {
            const emplacementParDefaut = emplacements.find((e) => e.actif) ?? emplacements[0];
            emplacementId = emplacementParDefaut?.id;
            if (!modeHistorique && emplacementId) {
              avertissements.push(
                `Aucun emplacement indiqué pour « ${article.designation} ». Sélectionnez l'emplacement avant l'import.`
              );
            }
          }
          if (!emplacementId) {
            erreurs.push("Aucun emplacement n'existe dans le système.");
            continue;
          }

          if (!modeHistorique) {
            const cleStock = `${article.id}|${emplacementId}`;
            const disponible = stockParCle.get(cleStock) ?? 0;
            const dejaDemande = quantitesImportees.get(cleStock) ?? 0;
            const demandeDansCetteVente = lignesResolues
              .filter((ligne) => `${ligne.article_id}|${ligne.emplacement_id}` === cleStock)
              .reduce((total, ligne) => total + ligne.quantite, 0);
            const disponibleRestant = disponible - dejaDemande - demandeDansCetteVente;

            if (disponibleRestant < quantite) {
              avertissements.push(
                `Stock insuffisant pour « ${article.designation} » à cet emplacement.`
              );
              lignesResolues.push({
                article_id: article.id,
                designation: article.designation,
                emplacement_id: emplacementId,
                quantite,
                prix,
                problemeQuantite: {
                  disponible: Math.max(0, disponibleRestant),
                  demande: quantite,
                },
              });
              continue;
            }
          }

          lignesResolues.push({
            article_id: article.id,
            designation: article.designation,
            emplacement_id: emplacementId,
            quantite,
            prix,
          });
        }

        // On ne réserve les quantités du fichier que si toute la vente est
        // valide. Ainsi une vente contenant une ligne erronée ne consomme pas
        // artificiellement le stock disponible pour les ventes suivantes.
        if (!modeHistorique && erreurs.length === 0) {
          for (const ligne of lignesResolues) {
            const cleStock = `${ligne.article_id}|${ligne.emplacement_id}`;
            quantitesImportees.set(
              cleStock,
              (quantitesImportees.get(cleStock) ?? 0) + ligne.quantite
            );
          }
        }

        const montantTotal = lignesResolues.reduce((s, l) => s + l.quantite * l.prix, 0);

        // Détection de doublon : une vente déjà enregistrée pour le même
        // client, la même date et le même montant total existe-t-elle
        // déjà ? Ce n'est qu'un signal d'alerte (pas un blocage).
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
          avertissements,
          valide: erreurs.length === 0,
          suggestionsArticles,
        });
      }

      setGroupes(resultats);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ONYX PHARM] Erreur lecture fichier import ventes", err);
      setErreurGenerale(
        err instanceof Error
          ? err.message
          : "Impossible de lire ce fichier. Utilisez le modèle .xlsx fourni."
      );
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
      const montantPaye = Number(premiere["Montant payé"]) || 0;
      if (montantPaye > 0) {
        await supabase.from("paiements_ventes").insert({
          vente_id: vente.id,
          montant: montantPaye,
          mode_paiement: String(premiere["Mode de paiement"] ?? "").trim() || "Espèces",
          date_paiement: groupe.dateVente ?? new Date().toISOString().slice(0, 10),
          created_by: user?.id ?? null,
        });
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
  const nbAvertissements = groupes.reduce((total, g) => total + g.avertissements.length, 0);

  function changerEmplacement(numero: string, indexLigne: number, emplacementId: string) {
    setGroupes((precedents) =>
      precedents.map((g) => {
        if (g.numero !== numero) return g;
        const lignes = g.lignesResolues.map((ligne, index) =>
          index === indexLigne
            ? { ...ligne, emplacement_id: emplacementId, problemeQuantite: undefined }
            : ligne
        );
        const avertissements = g.avertissements.filter(
          (a) => !a.includes('Sélectionnez le bon emplacement') && !a.includes('Rapproché de')
        );
        return { ...g, lignesResolues: lignes, avertissements };
      })
    );
  }

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
              <CheckCircle2 size={14} /> {nbValides} prête{nbValides > 1 ? "s" : ""} à importer
            </span>
            {nbErreurs > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertCircle size={14} /> {nbErreurs} bloquée{nbErreurs > 1 ? "s" : ""}
              </span>
            )}
            {nbDoublons > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertCircle size={14} /> {nbDoublons} doublon(s) possible(s)
              </span>
            )}
            {nbAvertissements > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertCircle size={14} /> {nbAvertissements} avertissement{nbAvertissements > 1 ? "s" : ""}
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
                    <td className="px-3 py-2 align-top text-onyx-500">
                      {g.lignesResolues.length > 0 ? (
                        <div className="space-y-1">
                          {g.lignesResolues.map((l, i) => (
                            <div key={`${g.numero}-article-${i}`} className="rounded-md border border-onyx-100 bg-white p-2">
                              <div className="font-medium text-onyx-700">{l.designation}</div>
                              <div className="mt-1 flex items-center gap-2">
                                <MapPin size={12} className="shrink-0 text-onyx-400" />
                                <select
                                  value={l.emplacement_id}
                                  onChange={(e) => changerEmplacement(g.numero, i, e.target.value)}
                                  className="w-full rounded-md border border-onyx-200 bg-white px-2 py-1 text-xs text-onyx-700 outline-none focus:border-accent-400"
                                >
                                  {emplacements.map((e) => (
                                    <option key={e.id} value={e.id}>{e.nom}</option>
                                  ))}
                                </select>
                              </div>
                              {l.problemeQuantite && (
                                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700">
                                  <div className="font-semibold">Problème de quantité</div>
                                  <div className="mt-0.5">
                                    Disponible : <strong>{l.problemeQuantite.disponible}</strong> · Demandé : <strong>{l.problemeQuantite.demande}</strong>
                                  </div>
                                  <div className="mt-0.5">Changez l&apos;emplacement ci-dessus pour vérifier un autre stock.</div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="space-y-1.5">
                        {g.valide ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                            <CheckCircle2 size={12} /> Prête à importer
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700">
                            <AlertCircle size={12} /> Erreur — import bloqué
                          </span>
                        )}
                        {g.doublonProbable && (
                          <div className="text-amber-600">Doublon possible : vérification recommandée.</div>
                        )}
                        {g.erreurs.length > 0 && (
                          <div className="max-w-md space-y-1 text-red-600">
                            {g.erreurs.map((erreur, i) => <div key={i}>{erreur}</div>)}
                          </div>
                        )}
                        {g.suggestionsArticles.length > 0 && (
                          <div className="max-w-md rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
                            <div className="font-semibold">Propositions d&apos;articles</div>
                            {g.suggestionsArticles.flatMap((bloc, blocIndex) => bloc.split("\n").map((ligne, ligneIndex) => (
                              <div key={`${blocIndex}-${ligneIndex}`} className={ligne.startsWith("Propositions :") || ligne.startsWith("Article demandé :") ? "mt-1" : "ml-2 mt-0.5"}>
                                {ligne}
                              </div>
                            )))}
                            <div className="mt-2 text-[11px] text-amber-700">Sélectionnez la bonne désignation dans votre fichier puis relancez l&apos;analyse.</div>
                          </div>
                        )}
                        {g.avertissements.length > 0 && (
                          <div className="max-w-md space-y-1 text-amber-600">
                            {g.avertissements.map((avertissement, i) => <div key={i}>{avertissement}</div>)}
                          </div>
                        )}
                      </div>
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
