"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  MapPin,
  PackageCheck,
  Pencil,
  Search,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logSupabaseError } from "@/lib/errors";
import { exporterExcelMisEnForme, lireFichierExcel } from "@/lib/excel";
import { normaliser, trouverOuCreer } from "@/lib/normaliser";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Buttons";
import { InlineBanner } from "@/components/ui/Badges";
import { useReferenceData } from "@/lib/hooks/useReferenceData";

const COLONNES_MODELE = [
  "N° de BL",
  "Date de vente",
  "Client",
  "Article",
  "Emplacement",
  "Quantité",
  "Prix de vente unitaire",
  "Avance",
  "Reste",
  "Statut",
  "Mode de paiement",
  "Observation",
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

type StockDisponible = {
  id: string;
  nom: string;
  quantite: number;
};

type CorrespondanceArticle = {
  article: ArticleImport;
  type: "exact" | "approx";
  score: number;
};

type LigneResolue = {
  article_id: string | null;
  designation: string;
  emplacement_id: string | null;
  quantite: number;
  prix: number;
  hors_catalogue?: boolean;
};

type VerificationLigne = {
  ligneIndex: number;
  articleSaisi: string;
  article: ArticleImport | null;
  articleType: "exact" | "approx" | null;
  articleScore: number;
  quantiteSaisie: number;
  quantite: number;
  emplacementSaisi: string;
  emplacementId: string | null;
  emplacementNom: string | null;
  disponible: number;
  stocksParEmplacement: StockDisponible[];
  suggestionsArticles: CorrespondanceArticle[];
  prix: number;
  erreur: string | null;
  besoinCorrection: boolean;
  horsCatalogue: boolean;
};

type GroupeVente = {
  numero: string;
  lignesBrutes: LigneBrute[];
  verifications: VerificationLigne[];
  lignesResolues: LigneResolue[];
  dateVente: string | null;
  nomClient: string;
  montantTotal: number;
  erreurs: string[];
  doublonProbable: boolean;
  valide: boolean;
};

type CorrectionsLigne = {
  articleId?: string;
  articleDesignation?: string;
  quantite?: number;
  emplacementId?: string;
  horsCatalogue?: boolean;
};

function distanceLevenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cout);
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

  return couvertureImport * 0.70 + jaccard * 0.20 + proximiteEdition * 0.10;
}

function trouverArticle(
  designationRecherchee: string,
  articles: ArticleImport[],
): { correspondance: CorrespondanceArticle | null; suggestions: CorrespondanceArticle[] } {
  const recherche = normaliserDesignation(designationRecherchee);
  if (!recherche) return { correspondance: null, suggestions: [] };

  const exacts = articles.filter(
    (article) => normaliserDesignation(article.designation) === recherche,
  );
  if (exacts.length === 1) {
    return {
      correspondance: { article: exacts[0], type: "exact", score: 1 },
      suggestions: [],
    };
  }

  const candidats = articles
    .map((article) => ({
      article,
      score: similariteTexte(designationRecherchee, article.designation),
    }))
    .filter((candidat) => candidat.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((candidat) => ({
      article: candidat.article,
      type: "approx" as const,
      score: candidat.score,
    }));

  if (candidats.length === 0) return { correspondance: null, suggestions: [] };

  const meilleur = candidats[0];
  const second = candidats[1];
  // Une correspondance est automatiquement retenue si elle est clairement
  // dominante. Sinon l'utilisateur choisit lui-même dans la zone de vérification.
  const automatique = meilleur.score >= 0.68 && (!second || meilleur.score - second.score >= 0.06);

  return {
    correspondance: automatique ? meilleur : null,
    suggestions: candidats,
  };
}

function trouverEmplacement(nomRecherche: string, emplacements: { id: string; nom: string }[]) {
  const recherche = normaliserDesignation(nomRecherche);
  if (!recherche) return null;

  const exacts = emplacements.filter(
    (e) => normaliserDesignation(e.nom) === recherche,
  );
  if (exacts.length === 1) return { emplacement: exacts[0], type: "exact" as const, score: 1 };

  const candidats = emplacements
    .map((emplacement) => ({
      emplacement,
      score: similariteTexte(nomRecherche, emplacement.nom),
    }))
    .filter((candidat) => candidat.score >= 0.50)
    .sort((a, b) => b.score - a.score);

  if (candidats.length === 0) return null;
  const meilleur = candidats[0];
  const second = candidats[1];
  if (second && meilleur.score - second.score < 0.08) return null;
  return {
    emplacement: meilleur.emplacement,
    type: "approx" as const,
    score: meilleur.score,
  };
}

export function ImportVentesSection() {
  const supabase = createClient();
  const { emplacements } = useReferenceData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const correctionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [clients, setClients] = useState<{ id: string; nom: string }[]>([]);
  const [articles, setArticles] = useState<ArticleImport[]>([]);
  const [stocks, setStocks] = useState<StockImport[]>([]);
  const [groupes, setGroupes] = useState<GroupeVente[]>([]);
  const [lignesBrutesCourantes, setLignesBrutesCourantes] = useState<LigneBrute[]>([]);
  const [corrections, setCorrections] = useState<Record<string, CorrectionsLigne>>({});
  const [analyse, setAnalyse] = useState(false);
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progression, setProgression] = useState({ actuel: 0, total: 0 });
  const [resultat, setResultat] = useState<string | null>(null);
  const [resultatErreur, setResultatErreur] = useState(false);
  const [modeHistorique, setModeHistorique] = useState(false);
  const [clientOuverts, setClientOuverts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, nom")
      .then(({ data }) => setClients(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lignesBrutesCourantes.length > 0) {
      void analyser(lignesBrutesCourantes, corrections);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeHistorique]);

  function convertirDateImport(valeur: unknown): string | null {
    if (valeur === undefined || valeur === null || String(valeur).trim() === "") return null;
    if (valeur instanceof Date && !Number.isNaN(valeur.getTime())) return valeur.toISOString().slice(0, 10);
    const texte = String(valeur).trim();
    if (/^\d+(\.\d+)?$/.test(texte)) {
      const serial = Number(texte);
      if (serial > 20000 && serial < 100000) {
        const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        return date.toISOString().slice(0, 10);
      }
    }
    const iso = texte.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
      return Number.isNaN(d.getTime()) ? null : texte;
    }
    const fr = texte.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (fr) {
      const [, jour, mois, annee] = fr;
      const d = new Date(Date.UTC(Number(annee), Number(mois) - 1, Number(jour)));
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    return null;
  }

  function telechargerModele() {
    exporterExcelMisEnForme("Modèle_Ventes_Onyx_Pharm", "Modèle", COLONNES_MODELE, [
      {
        "N° de BL": "BL001",
        "Date de vente": "2026-09-01",
        Client: "Client Exemple",
        Article: "Paracétamol 500 mg",
        Emplacement: emplacements[0]?.nom ?? "Entrepôt",
        Quantité: 10,
        "Prix de vente unitaire": 500,
        Avance: 3000,
        Reste: 2000,
        Statut: "Avance",
        "Mode de paiement": "Espèces",
        Observation: "",
      },
      {
        "N° de BL": "BL001",
        "Date de vente": "2026-09-01",
        Client: "Client Exemple",
        Article: "Compresses stériles",
        Emplacement: emplacements[0]?.nom ?? "Entrepôt",
        Quantité: 3,
        "Prix de vente unitaire": 1000,
        Avance: "",
        Reste: "",
        Statut: "",
        "Mode de paiement": "",
        Observation: "Avance et reste peuvent être renseignés ligne par ligne ; les avances sont additionnées pour le BL.",
      },
      {
        "N° de BL": "BL002",
        "Date de vente": "2025-03-15",
        Client: "Ancien Client",
        Article: "Gants stériles",
        Emplacement: "",
        Quantité: 20,
        "Prix de vente unitaire": 300,
        Avance: 0,
        Reste: 6000,
        Statut: "Non payée",
        "Mode de paiement": "",
        Observation: "Vente ancienne : emplacement facultatif et aucun impact sur le stock actuel.",
      },
    ]);
  }

  function cleLigne(numero: string, ligneIndex: number) {
    return `${numero}|${ligneIndex}`;
  }

  async function chargerDonneesReference() {
    const [articlesResult, stocksResult] = await Promise.all([
      supabase.from("articles").select("id, designation, statut").order("designation"),
      supabase.from("stocks").select("article_id, emplacement_id, quantite"),
    ]);
    if (articlesResult.error) throw new Error(`Impossible de charger les articles : ${articlesResult.error.message}`);
    if (stocksResult.error) throw new Error(`Impossible de charger les stocks : ${stocksResult.error.message}`);
    setArticles((articlesResult.data ?? []) as ArticleImport[]);
    setStocks((stocksResult.data ?? []) as StockImport[]);
    return {
      articles: (articlesResult.data ?? []) as ArticleImport[],
      stocks: (stocksResult.data ?? []) as StockImport[],
    };
  }

  async function analyser(brutes: LigneBrute[], correctionsActuelles: Record<string, CorrectionsLigne>) {
    setAnalyse(true);
    setErreurGenerale(null);
    try {
      const refs = articles.length > 0 ? { articles, stocks } : await chargerDonneesReference();
      const stockParCle = new Map<string, number>();
      for (const stock of refs.stocks) {
        const cle = `${stock.article_id}|${stock.emplacement_id}`;
        stockParCle.set(cle, (stockParCle.get(cle) ?? 0) + Number(stock.quantite || 0));
      }

      const parGroupe = new Map<string, LigneBrute[]>();
      for (const ligne of brutes) {
        const cle = String(ligne["N° de BL"] ?? "").trim();
        if (!cle) continue;
        if (!parGroupe.has(cle)) parGroupe.set(cle, []);
        parGroupe.get(cle)!.push(ligne);
      }
      if (parGroupe.size === 0) {
        setErreurGenerale("Aucune ligne valide : la colonne \"N° de BL\" doit être renseignée.");
        setGroupes([]);
        return;
      }

      // On réserve virtuellement le stock au fur et à mesure. Cela prend en
      // compte toutes les ventes du fichier, même lorsqu'elles concernent le
      // même article et le même emplacement.
      const quantitesReservees = new Map<string, number>();
      const resultats: GroupeVente[] = [];

      for (const [numero, lignesBrutes] of Array.from(parGroupe.entries())) {
        const premiere = lignesBrutes[0];
        const valeurDateVente = premiere["Date de vente"];
        const erreurs: string[] = [];
        const dateVente = convertirDateImport(valeurDateVente);
        if (valeurDateVente !== undefined && valeurDateVente !== null && String(valeurDateVente).trim() !== "" && !dateVente) {
          erreurs.push(`Date de vente invalide : « ${String(valeurDateVente)} ».`);
        }
        const nomClient = String(premiere.Client ?? "").trim();
        const verifications: VerificationLigne[] = [];
        const lignesResolues: LigneResolue[] = [];

        for (let ligneIndex = 0; ligneIndex < lignesBrutes.length; ligneIndex += 1) {
          const l = lignesBrutes[ligneIndex];
          const cle = cleLigne(numero, ligneIndex);
          const correction = correctionsActuelles[cle] ?? {};
          const articleSaisi = String(l.Article ?? "").trim();
          const designationRecherchee = correction.articleDesignation?.trim() || articleSaisi;
          const quantiteImportee = Number(l["Quantité"]);
          const quantite = correction.quantite !== undefined ? Number(correction.quantite) : quantiteImportee;
          const prix = Number(l["Prix de vente unitaire"]) || 0;
          const emplacementSaisi = String(l.Emplacement ?? "").trim();

          const rechercheArticle = correction.articleId
            ? { correspondance: refs.articles.find((a) => a.id === correction.articleId)
                ? { article: refs.articles.find((a) => a.id === correction.articleId)!, type: "approx" as const, score: 1 }
                : null, suggestions: [] }
            : trouverArticle(designationRecherchee, refs.articles);

          const horsCatalogue = correction.horsCatalogue === true;
          const article = horsCatalogue ? null : rechercheArticle.correspondance?.article ?? null;
          const articleType = horsCatalogue ? null : rechercheArticle.correspondance?.type ?? null;
          const stocksArticle = article
            ? emplacements.map((emplacement) => ({
                id: emplacement.id,
                nom: emplacement.nom,
                quantite: stockParCle.get(`${article.id}|${emplacement.id}`) ?? 0,
              }))
            : [];

          let emplacementId: string | null = correction.emplacementId ?? null;
          let emplacementNom: string | null = null;
          let disponible = 0;
          let erreur: string | null = null;

          if (horsCatalogue) {
            emplacementId = null;
            emplacementNom = null;
            disponible = 0;
            if (!articleSaisi) {
              erreur = "Désignation de l'article hors catalogue manquante.";
            } else if (!Number.isFinite(quantite) || quantite <= 0) {
              erreur = "Quantité invalide : indiquez une quantité supérieure à 0.";
            }
          } else if (!article) {
            erreur = articleSaisi
              ? `Article « ${articleSaisi} » à confirmer : aucune correspondance suffisamment sûre.`
              : "Désignation de l'article manquante.";
          } else {
            if (!emplacementId && emplacementSaisi) {
              emplacementId = trouverEmplacement(emplacementSaisi, emplacements)?.emplacement.id ?? null;
            }
            if (!emplacementId && modeHistorique) emplacementId = emplacements[0]?.id ?? null;
            emplacementNom = emplacements.find((e) => e.id === emplacementId)?.nom ?? null;
            disponible = emplacementId ? stockParCle.get(`${article.id}|${emplacementId}`) ?? 0 : 0;

            if (!Number.isFinite(quantite) || quantite <= 0) {
              erreur = "Quantité invalide : indiquez une quantité supérieure à 0.";
            } else if (!modeHistorique && !emplacementId) {
              erreur = `Choisissez l'emplacement pour « ${article.designation} ».`;
            } else if (!modeHistorique) {
              const dejaReserve = emplacementId ? quantitesReservees.get(`${article.id}|${emplacementId}`) ?? 0 : 0;
              const restant = Math.max(0, disponible - dejaReserve);
              if (!emplacementId || restant < quantite) {
                const alternatives = stocksArticle.filter((s) => {
                  const reserve = quantitesReservees.get(`${article.id}|${s.id}`) ?? 0;
                  return s.quantite - reserve >= quantite;
                });
                erreur = alternatives.length > 0
                  ? `Stock insuffisant à « ${emplacementNom ?? emplacementSaisi ?? "l'emplacement choisi"} » : ${restant} disponible(s) pour ${quantite} demandé(s). Choisissez un emplacement suffisant.`
                  : `Stock insuffisant pour « ${article.designation} » : ${restant} disponible(s) à « ${emplacementNom ?? emplacementSaisi ?? "l'emplacement choisi"} » et aucun autre emplacement ne couvre ${quantite}.`;
              }
            }
          }

          const besoinCorrection = Boolean(
            erreur ||
            (!horsCatalogue && !article) ||
            articleType === "approx" ||
            (!horsCatalogue && article && !modeHistorique && (!emplacementId || disponible < quantite)),
          );

          const verification: VerificationLigne = {
            ligneIndex,
            articleSaisi,
            article,
            articleType,
            articleScore: rechercheArticle.correspondance?.score ?? 0,
            quantiteSaisie: Number.isFinite(quantiteImportee) ? quantiteImportee : 0,
            quantite: Number.isFinite(quantite) ? quantite : 0,
            emplacementSaisi,
            emplacementId,
            emplacementNom,
            disponible,
            stocksParEmplacement: stocksArticle,
            suggestionsArticles: rechercheArticle.suggestions,
            prix,
            erreur,
            besoinCorrection,
            horsCatalogue,
          };
          verifications.push(verification);

          if (!erreur && ((article && emplacementId) || horsCatalogue)) {
            lignesResolues.push({
              article_id: article?.id ?? null,
              designation: horsCatalogue ? articleSaisi : article!.designation,
              emplacement_id: horsCatalogue ? null : emplacementId,
              quantite,
              prix,
              hors_catalogue: horsCatalogue,
            });
            if (!modeHistorique) {
              const cleStock = `${article.id}|${emplacementId}`;
              quantitesReservees.set(cleStock, (quantitesReservees.get(cleStock) ?? 0) + quantite);
            }
          }
        }

        const lignesAvecErreur = verifications.filter((v) => v.erreur);
        const montantTotal = lignesResolues.reduce((s, l) => s + l.quantite * l.prix, 0);
        let doublonProbable = false;
        if (lignesAvecErreur.length === 0 && lignesResolues.length === lignesBrutes.length && nomClient && dateVente && montantTotal > 0) {
          const clientExistant = clients.find(
            (c) => normaliserDesignation(c.nom) === normaliserDesignation(nomClient),
          ) ?? clients
            .map((c) => ({ client: c, score: similariteTexte(nomClient, c.nom) }))
            .filter((c) => c.score >= 0.78)
            .sort((a, b) => b.score - a.score)[0]?.client;
          if (clientExistant) {
            const { data: doublons } = await supabase
              .from("ventes")
              .select("id")
              .eq("client_id", clientExistant.id)
              .eq("date_vente", dateVente)
              .eq("montant_total", montantTotal)
              .neq("statut", "Annulé")
              .limit(1);
            doublonProbable = Boolean(doublons?.length);
          }
        }

        resultats.push({
          numero,
          lignesBrutes,
          verifications,
          lignesResolues,
          dateVente,
          nomClient,
          montantTotal,
          erreurs: [...erreurs, ...lignesAvecErreur.map((v) => v.erreur!).filter(Boolean)],
          doublonProbable,
          valide: erreurs.length === 0 && lignesAvecErreur.length === 0 && lignesResolues.length === lignesBrutes.length && !doublonProbable,
        });
      }

      // Classement principal par client, puis par numéro de vente.
      resultats.sort((a, b) => normaliserDesignation(a.nomClient).localeCompare(normaliserDesignation(b.nomClient)) || a.numero.localeCompare(b.numero));
      setGroupes(resultats);
      setClientOuverts((precedentes) => {
        const next = { ...precedentes };
        for (const groupe of resultats) next[cleClient(groupe.nomClient)] = true;
        return next;
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ONYX PHARM] Erreur analyse import ventes", err);
      setErreurGenerale(err instanceof Error ? err.message : "Impossible d'analyser ce fichier.");
      setGroupes([]);
    } finally {
      setAnalyse(false);
    }
  }

  async function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErreurGenerale(null);
    setResultat(null);
    setGroupes([]);
    setCorrections({});
    setAnalyse(true);
    try {
      const brutes = await lireFichierExcel(file);
      if (brutes.length === 0) {
        setErreurGenerale("Ce fichier ne contient aucune ligne.");
        return;
      }
      setLignesBrutesCourantes(brutes);
      const refs = await chargerDonneesReference();
      if (refs.articles.length === 0) {
        setErreurGenerale("Aucun article n'est enregistré dans le stock/catalogue.");
        return;
      }
      await analyser(brutes, {});
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ONYX PHARM] Erreur lecture fichier import ventes", err);
      setErreurGenerale(err instanceof Error ? err.message : "Impossible de lire ce fichier. Utilisez le modèle .xlsx fourni.");
      setGroupes([]);
    } finally {
      setAnalyse(false);
    }
  }

  function modifierLigne(numero: string, ligneIndex: number, patch: CorrectionsLigne) {
    const cle = cleLigne(numero, ligneIndex);
    setCorrections((precedentes) => ({
      ...precedentes,
      [cle]: { ...precedentes[cle], ...patch },
    }));
  }

  function appliquerCorrection(numero: string, ligneIndex: number, patch: CorrectionsLigne) {
    const cle = cleLigne(numero, ligneIndex);
    const next = {
      ...corrections,
      [cle]: {
        ...corrections[cle],
        ...patch,
      },
    };
    setCorrections(next);

    // Une correction ne doit pas relancer immédiatement l'analyse complète
    // du fichier. Plusieurs contrôles peuvent être corrigés à la suite ; on
    // attend brièvement la fin de la saisie pour ne lancer qu'une seule
    // analyse avec toutes les corrections cumulées.
    if (correctionTimerRef.current) clearTimeout(correctionTimerRef.current);
    if (lignesBrutesCourantes.length === 0) return;
    setAnalyse(true);
    correctionTimerRef.current = setTimeout(() => {
      void analyser(lignesBrutesCourantes, next);
    }, 160);
  }

  async function confirmerImport() {
    setImporting(true);
    setProgression({ actuel: 0, total: groupes.length });
    setErreurGenerale(null);

    const { data: { user } } = await supabase.auth.getUser();
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
          const { data } = await supabase.from("clients").insert({ nom: nomSaisi }).select("id, nom").single();
          return data;
        });
      }

      const { data: refData, error: refError } = await supabase.rpc("generer_numero_document", { p_prefixe: "FAC" });
      if (refError || !refData) {
        erreursDetail.push(`BL ${groupe.numero} : impossible de générer une référence.`);
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
        erreursDetail.push(logSupabaseError({ table: "ventes", operation: "insert (import Excel)" }, venteError, `BL ${groupe.numero} : impossible de la créer.`));
        echouees += 1;
        continue;
      }

      const { error: lignesError } = await supabase.from("lignes_ventes").insert(
        groupe.lignesResolues.map((l) => ({
          vente_id: vente.id,
          article_id: l.article_id,
          emplacement_id: l.emplacement_id,
          designation_hors_catalogue: l.hors_catalogue ? l.designation : null,
          hors_catalogue: Boolean(l.hors_catalogue),
          quantite: l.quantite,
          prix_achat_reference: 0,
          prix_vente_conseille_reference: l.prix,
          prix_vente_reel: l.prix,
          remise: 0,
        })),
      );

      if (lignesError) {
        erreursDetail.push(`BL ${groupe.numero} : lignes non enregistrées.`);
        echouees += 1;
        continue;
      }

      const prixManquant = groupe.lignesResolues.some((l) => !l.prix || l.prix <= 0);
      if (prixManquant) {
        enBrouillon += 1;
        continue;
      }

      if (modeHistorique) {
        const { error: majStatutError } = await supabase.from("ventes").update({ statut: "Validé" }).eq("id", vente.id);
        if (majStatutError) {
          erreursDetail.push(`BL ${groupe.numero} créée en brouillon, mais non validée.`);
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
          erreursDetail.push(`BL ${groupe.numero} créée en brouillon, mais non validée : ${validationError.message}`);
          enBrouillon += 1;
          continue;
        }
      }

      // Le paiement est saisi ligne par ligne dans Excel, mais enregistré comme
      // un paiement global de la vente dans la base. On additionne donc les
      // avances de toutes les lignes du même BL. Cela permet par exemple :
      // article A = 7 000 d'avance sur 10 000 + article B = 0 d'avance.
      const avancesLignes = groupe.lignesBrutes.map((ligne, index) => {
        const brut = ligne["Avance"];
        const valeur = brut === undefined || brut === null || String(brut).trim() === "" ? 0 : Number(brut);
        const ligneMontant = groupe.verifications[index] ? groupe.verifications[index].quantite * groupe.verifications[index].prix : 0;
        return { ligne, index, brut, valeur, ligneMontant };
      });
      let avanceTotale = 0;
      for (const item of avancesLignes) {
        if (!Number.isFinite(item.valeur) || item.valeur < 0 || item.valeur > item.ligneMontant) {
          erreursDetail.push(`BL ${groupe.numero} : avance invalide à la ligne ${item.index + 1} (${String(item.brut)}).`);
          continue;
        }
        avanceTotale += item.valeur;
        const resteBrut = item.ligne["Reste"];
        if (resteBrut !== undefined && resteBrut !== null && String(resteBrut).trim() !== "") {
          const resteExcel = Number(resteBrut);
          const resteAttendu = Math.max(0, item.ligneMontant - item.valeur);
          if (!Number.isFinite(resteExcel) || resteExcel < 0 || Math.abs(resteExcel - resteAttendu) > 0.01) {
            erreursDetail.push(`BL ${groupe.numero} : reste invalide à la ligne ${item.index + 1} (${String(resteBrut)}), attendu ${resteAttendu}.`);
          }
        }
      }
      if (avanceTotale > groupe.montantTotal) {
        erreursDetail.push(`BL ${groupe.numero} : le total des avances (${avanceTotale}) dépasse le montant total (${groupe.montantTotal}).`);
      }
      const lignePaiement = avancesLignes.find((item) => item.valeur > 0)?.ligne ?? groupe.lignesBrutes[0];
      if (avanceTotale > 0) {
        const { error: paiementError } = await supabase.from("paiements_ventes").insert({
          vente_id: vente.id,
          montant: avanceTotale,
          mode_paiement: String(lignePaiement?.["Mode de paiement"] ?? "").trim() || "Espèces",
          date_paiement: groupe.dateVente ?? new Date().toISOString().slice(0, 10),
          created_by: user?.id ?? null,
        });
        if (paiementError) erreursDetail.push(`BL ${groupe.numero} : paiement initial non enregistré : ${paiementError.message}`);
      }
      reussies += 1;
    }

    setImporting(false);
    setResultatErreur(echouees > 0);
    setResultat(
      `${reussies} vente(s) validée(s)` +
      (enBrouillon > 0 ? `, ${enBrouillon} laissée(s) en brouillon (prix manquant)` : "") +
      (echouees > 0 ? `, ${echouees} échec(s) ou ignorée(s)` : "") +
      "." +
      (erreursDetail.length > 0 ? " Détail : " + erreursDetail.join(" | ") : ""),
    );
    setGroupes([]);
    setLignesBrutesCourantes([]);
    setCorrections({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function cleClient(nom: string) {
    return normaliserDesignation(nom) || "sans client";
  }

  function groupeParClient() {
    const groupesClients = new Map<string, { nom: string; groupes: GroupeVente[] }>();
    for (const groupe of groupes) {
      const cle = cleClient(groupe.nomClient);
      const existant = groupesClients.get(cle);
      if (existant) {
        existant.groupes.push(groupe);
      } else {
        groupesClients.set(cle, { nom: groupe.nomClient || "Sans client", groupes: [groupe] });
      }
    }
    return Array.from(groupesClients.values()).map(({ nom, groupes: groupesDuClient }) => [nom, groupesDuClient] as [string, GroupeVente[]]);
  }

  const nbValides = groupes.filter((g) => g.valide).length;
  const nbErreurs = groupes.length - nbValides;
  const nbDoublons = groupes.filter((g) => g.doublonProbable).length;
  const totalClients = groupeParClient().length;

  function renderLigneVerification(groupe: GroupeVente, verification: VerificationLigne) {
    const key = cleLigne(groupe.numero, verification.ligneIndex);
    const hasStockAlternatives = verification.stocksParEmplacement.some((s) => s.quantite >= verification.quantite);
    const stockTotal = verification.stocksParEmplacement.reduce((sum, s) => sum + s.quantite, 0);
    const articleExactEtStockOK = verification.articleType === "exact" && !verification.erreur;

    return (
      <div key={key} className={`rounded-lg border p-3 ${articleExactEtStockOK ? "border-emerald-100 bg-emerald-50/30" : "border-onyx-200 bg-white"}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-onyx-100 px-2 py-1 text-[11px] font-semibold text-onyx-500">
                Ligne {verification.ligneIndex + 1}
              </span>
              {verification.horsCatalogue ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-1 text-[11px] font-semibold text-accent-700">
                  Article hors catalogue
                </span>
              ) : articleExactEtStockOK ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  <PackageCheck size={12} /> Correspondance exacte · stock disponible
                </span>
              ) : verification.articleType === "approx" && verification.article ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                  <Search size={12} /> Correspondance souple
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700">
                  <AlertCircle size={12} /> Vérification nécessaire
                </span>
              )}
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_180px_220px]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-onyx-400">Article importé</p>
                <p className="mt-1 break-words text-sm font-medium text-onyx-800">{verification.articleSaisi || "—"}</p>
                {verification.article && (
                  <p className="mt-1 text-xs text-onyx-500">
                    → Catalogue : <span className="font-semibold text-onyx-700">{verification.article.designation}</span>
                    {verification.articleType === "approx" ? ` · ${(verification.articleScore * 100).toFixed(0)} %` : ""}
                  </p>
                )}
              </div>

              {articleExactEtStockOK ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-onyx-400">Quantité</p>
                  <p className="mt-1 text-sm font-semibold text-onyx-800">{verification.quantite}</p>
                </div>
              ) : (
                <label>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-onyx-400">Quantité à importer</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={corrections[key]?.quantite ?? verification.quantite}
                    onChange={(e) => modifierLigne(groupe.numero, verification.ligneIndex, { quantite: Number(e.target.value) })}
                    onBlur={(e) => void appliquerCorrection(groupe.numero, verification.ligneIndex, { quantite: Number(e.currentTarget.value) })}
                    className="mt-1 w-full rounded-md border border-onyx-200 bg-white px-2.5 py-2 text-sm text-onyx-800 outline-none focus:border-accent-400"
                  />
                </label>
              )}

              {verification.horsCatalogue ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-onyx-400">Emplacement</p>
                  <p className="mt-1 text-sm font-medium text-accent-700">Hors catalogue · aucun stock</p>
                </div>
              ) : articleExactEtStockOK ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-onyx-400">Emplacement</p>
                  <p className="mt-1 flex items-center gap-1 text-sm font-medium text-onyx-800"><MapPin size={13} /> {verification.emplacementNom}</p>
                  <p className="mt-0.5 text-xs text-emerald-600">{verification.disponible} disponible(s)</p>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-onyx-400">Emplacement</p>
                  <select
                    value={verification.emplacementId ?? ""}
                    onChange={(e) => void appliquerCorrection(groupe.numero, verification.ligneIndex, { emplacementId: e.target.value || undefined })}
                    className="mt-1 w-full rounded-md border border-onyx-200 bg-white px-2.5 py-2 text-sm text-onyx-800 outline-none focus:border-accent-400"
                    disabled={!verification.article}
                  >
                    <option value="">Choisir un emplacement…</option>
                    {verification.stocksParEmplacement.map((stock) => {
                      const suffisant = stock.quantite >= verification.quantite;
                      return (
                        <option key={stock.id} value={stock.id}>
                          {stock.nom} — {stock.quantite} disponible{suffisant ? " · suffisant" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {!articleExactEtStockOK && (
          <div className="mt-3 grid gap-3 border-t border-onyx-100 pt-3 lg:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-onyx-400">
                <Pencil size={11} /> Modifier / confirmer l&apos;article
              </div>
              <input
                value={corrections[key]?.articleDesignation ?? verification.articleSaisi}
                onChange={(e) => modifierLigne(groupe.numero, verification.ligneIndex, { articleDesignation: e.target.value, articleId: undefined })}
                onBlur={(e) => void appliquerCorrection(groupe.numero, verification.ligneIndex, { articleDesignation: e.currentTarget.value, articleId: undefined })}
                placeholder="Nom de l’article…"
                className="w-full rounded-md border border-onyx-200 bg-white px-2.5 py-2 text-sm text-onyx-800 outline-none focus:border-accent-400"
              />
              {verification.suggestionsArticles.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] font-semibold text-onyx-400">Suggestions du catalogue :</p>
                  {verification.suggestionsArticles.slice(0, 3).map((suggestion) => (
                    <button
                      key={suggestion.article.id}
                      type="button"
                      onClick={() => void appliquerCorrection(groupe.numero, verification.ligneIndex, {
                        articleId: suggestion.article.id,
                        articleDesignation: suggestion.article.designation,
                      })}
                      className="flex w-full items-center justify-between rounded-md border border-onyx-100 bg-onyx-50 px-2.5 py-2 text-left text-xs hover:border-accent-300 hover:bg-accent-50"
                    >
                      <span className="font-medium text-onyx-700">{suggestion.article.designation}</span>
                      <span className="text-onyx-400">{Math.round(suggestion.score * 100)} %</span>
                    </button>
                  ))}
                </div>
              )}
              {!verification.article && !verification.horsCatalogue && verification.articleSaisi.trim() && (
                <button
                  type="button"
                  onClick={() => void appliquerCorrection(groupe.numero, verification.ligneIndex, {
                    horsCatalogue: true,
                    articleId: undefined,
                    articleDesignation: verification.articleSaisi,
                    emplacementId: undefined,
                  })}
                  className="mt-2 inline-flex items-center rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-xs font-semibold text-accent-700 hover:bg-accent-100"
                >
                  Utiliser comme article hors catalogue
                </button>
              )}
              {verification.horsCatalogue && (
                <div className="mt-2 rounded-md border border-accent-100 bg-accent-50 px-3 py-2 text-xs text-accent-700">
                  Article hors catalogue : enregistré dans la facture sans ajout au catalogue et sans mouvement de stock.
                </div>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-onyx-400">
                <MapPin size={11} /> Stock disponible par emplacement
              </div>
              {verification.horsCatalogue ? (
                <p className="rounded-md bg-accent-50 px-3 py-2 text-xs text-accent-700">Aucun emplacement ni stock ne sont requis pour un article hors catalogue.</p>
              ) : !verification.article ? (
                <p className="rounded-md bg-onyx-50 px-3 py-2 text-xs text-onyx-500">Sélectionnez d&apos;abord l&apos;article correspondant pour afficher son stock par emplacement.</p>
              ) : (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {verification.stocksParEmplacement.map((stock) => {
                    const suffisant = stock.quantite >= verification.quantite;
                    const selected = verification.emplacementId === stock.id;
                    return (
                      <button
                        key={stock.id}
                        type="button"
                        onClick={() => void appliquerCorrection(groupe.numero, verification.ligneIndex, { emplacementId: stock.id })}
                        className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
                          selected
                            ? suffisant
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-red-300 bg-red-50"
                            : suffisant
                              ? "border-emerald-100 bg-emerald-50/40 hover:border-emerald-300"
                              : "border-onyx-100 bg-onyx-50 hover:border-onyx-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-onyx-700">{stock.nom}</span>
                          <span className={`text-xs font-bold ${suffisant ? "text-emerald-700" : "text-red-600"}`}>{stock.quantite}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-onyx-400">
                          {suffisant ? "Quantité suffisante" : stock.quantite === 0 ? "Rupture" : `Insuffisant pour ${verification.quantite}`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              {verification.article && (
                <p className={`mt-2 text-[10px] ${hasStockAlternatives ? "text-emerald-600" : "text-red-500"}`}>
                  Stock total de l&apos;article : {stockTotal}. {hasStockAlternatives ? "Un ou plusieurs emplacements permettent cette vente." : "Aucun emplacement ne dispose de la quantité demandée."}
                </p>
              )}
            </div>
          </div>
        )}

        {verification.erreur && (
          <div className="mt-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            <div className="flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" /> <span>{verification.erreur}</span></div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-onyx-100 bg-white p-5">
      <h2 className="text-sm font-semibold text-onyx-800">Importer des ventes</h2>
      <p className="mt-1 text-sm text-onyx-500">
        Importez vos ventes Excel. La vérification reconnaît les désignations proches, contrôle le stock par emplacement et vous laisse corriger chaque ligne avant l&apos;import.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setModeHistorique(false)}
          className={`rounded-lg border p-3.5 text-left transition-colors ${!modeHistorique ? "border-accent-400 bg-accent-50" : "border-onyx-200 hover:bg-onyx-50"}`}
        >
          <p className="text-sm font-medium text-onyx-800">Ventes récentes</p>
          <p className="mt-0.5 text-xs text-onyx-500">Diminue le stock actuel</p>
        </button>
        <button
          type="button"
          onClick={() => setModeHistorique(true)}
          className={`rounded-lg border p-3.5 text-left transition-colors ${modeHistorique ? "border-accent-400 bg-accent-50" : "border-onyx-200 hover:bg-onyx-50"}`}
        >
          <p className="text-sm font-medium text-onyx-800">Ventes anciennes</p>
          <p className="mt-0.5 text-xs text-onyx-500">Ne touche pas au stock</p>
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <SecondaryButton onClick={telechargerModele} className="min-h-0 px-3 py-2 text-xs">
          <FileSpreadsheet size={14} /> Télécharger le modèle
        </SecondaryButton>
        <SecondaryButton onClick={() => fileInputRef.current?.click()} className="min-h-0 px-3 py-2 text-xs">
          <Upload size={14} /> Choisir un fichier .xlsx
        </SecondaryButton>
        <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFichier} className="hidden" />
      </div>

      {erreurGenerale && <div className="mt-3"><InlineBanner message={erreurGenerale} /></div>}
      {resultat && <div className="mt-3"><InlineBanner type={resultatErreur ? "error" : "success"} message={resultat} /></div>}
      {analyse && <p className="mt-3 text-sm text-onyx-400">Vérification des articles, quantités et emplacements en cours…</p>}

      {groupes.length > 0 && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-onyx-50/50 px-3.5 py-2.5 text-sm">
            <span className="text-onyx-600">{groupes.length} vente{groupes.length > 1 ? "s" : ""} · {totalClients} client{totalClients > 1 ? "s" : ""}</span>
            <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={14} /> {nbValides} prête{nbValides > 1 ? "s" : ""}</span>
            {nbErreurs > 0 && <span className="flex items-center gap-1 text-red-500"><AlertCircle size={14} /> {nbErreurs} à corriger</span>}
            {nbDoublons > 0 && <span className="flex items-center gap-1 text-amber-600"><AlertCircle size={14} /> {nbDoublons} doublon(s) possible(s)</span>}
          </div>

          <div className="mt-3 space-y-4">
            {groupeParClient().map(([client, ventesClient]) => {
              const clientKey = cleClient(client);
              const ouvert = clientOuverts[clientKey] !== false;
              const validesClient = ventesClient.filter((g) => g.valide).length;
              return (
                <section key={client} className="overflow-hidden rounded-xl border border-onyx-100">
                  <button
                    type="button"
                    onClick={() => setClientOuverts((p) => ({ ...p, [clientKey]: !ouvert }))}
                    className="flex w-full items-center justify-between gap-3 bg-onyx-50 px-4 py-3 text-left hover:bg-onyx-100/70"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {ouvert ? <ChevronDown size={16} className="shrink-0 text-onyx-400" /> : <ChevronRight size={16} className="shrink-0 text-onyx-400" />}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-onyx-800">{client}</p>
                        <p className="text-xs text-onyx-400">{ventesClient.length} vente{ventesClient.length > 1 ? "s" : ""} · {validesClient} prête{validesClient > 1 ? "s" : ""}</p>
                      </div>
                    </div>
                  </button>

                  {ouvert && (
                    <div className="divide-y divide-onyx-100">
                      {ventesClient.map((groupe) => (
                        <div key={groupe.numero} className="p-3 md:p-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-sm font-semibold text-onyx-800">BL {groupe.numero}</span>
                              <span className="ml-2 text-xs text-onyx-400">{groupe.dateVente ?? "Date non renseignée"}</span>
                            </div>
                            {groupe.valide ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 size={12} /> Prête à importer</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700"><AlertCircle size={12} /> Correction nécessaire</span>
                            )}
                          </div>

                          <div className="space-y-2">
                            {groupe.verifications.map((verification) => renderLigneVerification(groupe, verification))}
                          </div>

                          {groupe.doublonProbable && (
                            <div className="mt-3 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              <AlertCircle size={13} className="mr-1 inline" /> Doublon possible : une vente similaire existe déjà pour ce client, cette date et ce montant.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <div className="mt-4">
            <PrimaryButton onClick={confirmerImport} loading={importing} disabled={nbValides === 0 || analyse}>
              Importer {nbValides} vente{nbValides > 1 ? "s" : ""}
            </PrimaryButton>
            {importing && progression.total > 0 && (
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-onyx-100">
                  <div className="h-full rounded-full bg-accent-500 transition-all duration-200" style={{ width: `${Math.round((progression.actuel / progression.total) * 100)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-onyx-400">{progression.actuel} / {progression.total} traitée{progression.actuel > 1 ? "s" : ""}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
