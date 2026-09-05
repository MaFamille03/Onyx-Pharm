// Types correspondant au schéma SQL défini dans /supabase/migrations.
// Tenus à jour manuellement au fil des étapes du projet.

export type Statut = string; // valeurs dans parametres_options (groupe: statut_article / statut_operation)
export type ModePaiement = string; // valeurs dans parametres_options (groupe: mode_paiement)

export interface Profile {
  id: string;
  email: string | null;
  nom_complet: string | null;
  created_at: string;
}

export interface Emplacement {
  id: string;
  nom: string;
  actif: boolean;
  created_at: string;
}

export interface Categorie {
  id: string;
  nom: string;
  actif: boolean;
  created_at: string;
}

export interface SousCategorie {
  id: string;
  categorie_id: string;
  nom: string;
  actif: boolean;
  created_at: string;
}

export interface Fournisseur {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  observations: string | null;
  statut: Statut;
  created_at: string;
  created_by: string | null;
}

export interface Client {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  observations: string | null;
  statut: Statut;
  created_at: string;
  created_by: string | null;
}

export interface ParametreOption {
  id: string;
  groupe:
    | "statut_article"
    | "mode_paiement"
    | "statut_operation"
    | "categorie_caisse"
    | "type_mouvement_stock";
  valeur: string;
  ordre: number;
  actif: boolean;
}

export interface Article {
  id: string;
  designation: string;
  categorie_id: string | null;
  sous_categorie_id: string | null;
  marque: string | null;
  fournisseur_id: string | null;
  stock_minimum: number;
  prix_achat: number;
  prix_vente_conseille: number;
  numero_lot: string | null;
  date_expiration: string | null;
  statut: Statut;
  observations: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface Stock {
  id: string;
  article_id: string;
  emplacement_id: string;
  quantite: number;
}

export type TypeMouvementStock =
  | "achat"
  | "vente"
  | "transfert_entrant"
  | "transfert_sortant"
  | "retour_client"
  | "retour_fournisseur"
  | "ajustement_inventaire"
  | "perte"
  | "dommage"
  | "autre_entree"
  | "autre_sortie";

export interface MouvementStock {
  id: string;
  article_id: string;
  emplacement_id: string;
  type: TypeMouvementStock;
  quantite: number;
  document_type: string | null;
  document_id: string | null;
  reference_document: string | null;
  observation: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Transfert {
  id: string;
  reference: string;
  article_id: string;
  emplacement_source_id: string;
  emplacement_destination_id: string;
  quantite: number;
  statut: Statut;
  observation: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Inventaire {
  id: string;
  reference: string;
  emplacement_id: string;
  statut: Statut;
  created_at: string;
  valide_at: string | null;
  created_by: string | null;
  valide_by: string | null;
}

export interface InventaireLigne {
  id: string;
  inventaire_id: string;
  article_id: string;
  quantite_theorique: number;
  quantite_reelle: number;
  ecart: number;
  observation: string | null;
}

export interface Achat {
  id: string;
  reference: string;
  fournisseur_id: string;
  date_achat: string;
  montant_total: number;
  montant_paye: number;
  statut: Statut;
  observation: string | null;
  created_at: string;
  created_by: string | null;
}

export interface LigneAchat {
  id: string;
  achat_id: string;
  article_id: string;
  emplacement_destination_id: string | null;
  quantite: number;
  prix_achat_unitaire: number;
  montant_ligne: number;
  recu: boolean;
}

export interface PaiementAchat {
  id: string;
  achat_id: string;
  montant: number;
  mode_paiement: ModePaiement;
  date_paiement: string;
  observation: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Vente {
  id: string;
  reference: string;
  client_id: string | null;
  date_vente: string;
  montant_total: number;
  montant_paye: number;
  statut: Statut;
  observation: string | null;
  created_at: string;
  created_by: string | null;
}

export interface LigneVente {
  id: string;
  vente_id: string;
  article_id: string;
  emplacement_id: string;
  quantite: number;
  prix_achat_reference: number;
  prix_vente_conseille_reference: number;
  prix_vente_reel: number;
  remise: number;
  montant_ligne: number;
  marge_ligne: number;
}

export interface PaiementVente {
  id: string;
  vente_id: string;
  montant: number;
  mode_paiement: ModePaiement;
  date_paiement: string;
  observation: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Devis {
  id: string;
  reference: string;
  client_id: string | null;
  date_devis: string;
  montant_total: number;
  statut: Statut;
  observation: string | null;
  created_at: string;
  created_by: string | null;
}

export interface LigneDevis {
  id: string;
  devis_id: string;
  article_id: string;
  quantite: number;
  prix_unitaire: number;
  montant_ligne: number;
}

export interface RetourClient {
  id: string;
  reference: string;
  vente_id: string | null;
  article_id: string;
  emplacement_id: string;
  quantite: number;
  motif: string | null;
  montant_impact: number;
  created_at: string;
  created_by: string | null;
}

export interface RetourFournisseur {
  id: string;
  reference: string;
  achat_id: string | null;
  article_id: string;
  emplacement_id: string;
  quantite: number;
  motif: string | null;
  montant_impact: number;
  created_at: string;
  created_by: string | null;
}

export interface Encaissement {
  id: string;
  reference: string;
  date_operation: string;
  montant: number;
  mode_paiement: ModePaiement;
  client_id: string | null;
  vente_id: string | null;
  categorie: string | null;
  description: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Decaissement {
  id: string;
  reference: string;
  date_operation: string;
  montant: number;
  mode_paiement: ModePaiement;
  fournisseur_id: string | null;
  achat_id: string | null;
  categorie: string | null;
  description: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Historique {
  id: string;
  utilisateur_id: string | null;
  action: "creation" | "modification" | "validation" | "annulation";
  table_cible: string;
  enregistrement_id: string | null;
  ancienne_valeur: unknown;
  nouvelle_valeur: unknown;
  description: string | null;
  created_at: string;
}

// Vues calculées
export interface CreanceClient {
  vente_id: string;
  reference: string;
  client_id: string | null;
  montant_total: number;
  montant_paye: number;
  creance: number;
}

export interface DetteFournisseur {
  achat_id: string;
  reference: string;
  fournisseur_id: string;
  montant_total: number;
  montant_paye: number;
  dette: number;
}
