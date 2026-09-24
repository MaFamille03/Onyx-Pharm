/**
 * Normalise un texte pour la comparaison : minuscules, sans accents,
 * espaces superflus retirés. Utilisé pour reconnaître qu'"Entrepôt",
 * "ENTREPOT" et "entrepot" désignent la même chose, sans jamais
 * modifier l'orthographe déjà enregistrée dans le site — seule la
 * comparaison est insensible à la casse et aux accents, jamais
 * l'affichage.
 */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Cherche un élément existant dont le nom correspond (une fois
 * normalisé) à `valeur`. Si aucun ne correspond, le crée via `creer` et
 * l'ajoute à `existants` pour que les lignes suivantes du même import le
 * retrouvent sans le recréer en double. Retourne l'id trouvé ou créé, ou
 * `null` si `valeur` est vide.
 *
 * Robuste à une liste `existants` périmée (chargée juste avant qu'un
 * autre élément du même nom ait été créé ailleurs) : si la création
 * échoue parce que le nom existe déjà en base (contrainte d'unicité),
 * on va le rechercher directement plutôt que d'abandonner en silence.
 */
export async function trouverOuCreer<T extends { id: string; nom: string }>(
  valeur: string,
  existants: T[],
  creer: (nomSaisi: string) => Promise<T | null>,
  rechercherParNom?: (nomSaisi: string) => Promise<T | null>
): Promise<string | null> {
  const nomSaisi = valeur.trim();
  if (!nomSaisi) return null;

  const trouve = existants.find((e) => normaliser(e.nom) === normaliser(nomSaisi));
  if (trouve) return trouve.id;

  const cree = await creer(nomSaisi);
  if (cree) {
    existants.push(cree);
    return cree.id;
  }

  // La création a échoué (probablement parce que ce nom existe déjà en
  // base, créé entre-temps ou absent de la liste chargée au démarrage) —
  // on va le rechercher directement plutôt que d'abandonner en silence.
  if (rechercherParNom) {
    const trouveEnBase = await rechercherParNom(nomSaisi);
    if (trouveEnBase) {
      existants.push(trouveEnBase);
      return trouveEnBase.id;
    }
  }

  return null;
}


/**
 * Score de rapprochement souple pour les recherches utilisateur.
 * Ne modifie jamais la donnée enregistrée : il sert uniquement à classer
 * les résultats lorsque l'utilisateur saisit un nom incomplet, inversé ou
 * légèrement différent de la désignation stockée.
 */
function distanceLevenshtein(a: string, b: string): number {
  const ligne = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = ligne[0];
    ligne[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const haut = ligne[j];
      ligne[j] = Math.min(
        ligne[j] + 1,
        ligne[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = haut;
    }
  }
  return ligne[b.length];
}

function motsProches(motA: string, motB: string): boolean {
  if (motA === motB || motA.includes(motB) || motB.includes(motA)) return true;
  if (Math.min(motA.length, motB.length) < 4) return false;
  const distance = distanceLevenshtein(motA, motB);
  const similarite = 1 - distance / Math.max(motA.length, motB.length);
  return similarite >= 0.72;
}

export function scoreCorrespondanceTexte(recherche: string, cible: string): number {
  const a = normaliser(recherche);
  const b = normaliser(cible);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a)) return 0.96;
  if (a.includes(b)) return 0.90;

  const motsA = a.split(" ").filter((m) => m.length >= 2);
  const motsB = b.split(" ").filter((m) => m.length >= 2);
  if (!motsA.length || !motsB.length) return 0;

  let correspondants = 0;
  for (const motA of motsA) {
    if (motsB.some((motB) => motsProches(motA, motB))) correspondants += 1;
  }

  const couvertureRecherche = correspondants / motsA.length;
  const couvertureCible = correspondants / motsB.length;
  const jaccard = correspondants / Math.max(1, motsA.length + motsB.length - correspondants);

  return couvertureRecherche * 0.55 + couvertureCible * 0.25 + jaccard * 0.20;
}

export function classerCorrespondances<T>(
  recherche: string,
  elements: T[],
  getTexte: (element: T) => string,
  seuil = 0.42
): Array<T & { scoreCorrespondance: number }> {
  return elements
    .map((element) => ({
      element,
      scoreCorrespondance: scoreCorrespondanceTexte(recherche, getTexte(element)),
    }))
    .filter(({ scoreCorrespondance }) => scoreCorrespondance >= seuil)
    .sort((a, b) => b.scoreCorrespondance - a.scoreCorrespondance)
    .map(({ element, scoreCorrespondance }) => ({ ...element, scoreCorrespondance }));
}
