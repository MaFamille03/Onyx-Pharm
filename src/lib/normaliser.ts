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
