-- ============================================================================
-- ONYX PHARM — Migration 0011 : Intégration du catalogue réel
--
-- Construit à partir du catalogue officiel ONYX PHARM SARL (2026) fourni.
-- Toutes les catégories et désignations reprennent exactement les
-- intitulés du catalogue — rien n'est inventé. Les prix d'achat et de
-- vente ne figurant pas dans le catalogue, ils sont initialisés à 0 :
-- à compléter dans Stock > Articles selon les tarifs réels ONYX PHARM.
-- Idempotente : peut être rejouée sans créer de doublons.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CATÉGORIES (Parties I, II et III du catalogue)
-- ----------------------------------------------------------------------------
insert into public.categories (nom) values
  ('Bloc Opératoire'),
  ('Orthopédie'),
  ('Maternité'),
  ('Stérilisation'),
  ('Urgence'),
  ('Ophtalmologie'),
  ('O.R.L. Gastroentérologie'),
  ('Diagnostique'),
  ('Mobilier'),
  ('Divers & Accessoires'),
  ('Chirurgie Générale'),
  ('Gynécologie-Obstétrique'),
  ('Pédiatrie'),
  ('ORL'),
  ('Soins Courants'),
  ('Prélèvement & Diagnostic'),
  ('Perfusion & Injection'),
  ('Pansement & Suture'),
  ('Sondage & Drainage'),
  ('Gynécologie'),
  ('Protection & Hygiène')
on conflict (nom) do nothing;

-- ----------------------------------------------------------------------------
-- ARTICLES — Partie I : Équipements, Partie II : Instruments,
-- Partie III : Réactifs & Consommables
-- ----------------------------------------------------------------------------
insert into public.articles (designation, categorie_id, marque, statut)
select v.designation, c.id, v.marque, 'Actif'
from (values
  -- Bloc Opératoire
  ('Bloc Opératoire', 'Aspirateur de mucosité chirurgical 2 bocaux', null),
  ('Bloc Opératoire', 'Casaque chirurgicale renforcée XL', null),
  ('Bloc Opératoire', 'Lampe scialytique à LED avec batterie', null),
  ('Bloc Opératoire', 'Table de pansement en acier inoxydable', null),
  ('Bloc Opératoire', 'Table d''opération hydraulique', null),
  ('Bloc Opératoire', 'Table d''opération mécanique', null),
  -- Orthopédie
  ('Orthopédie', 'Scie électrique pour plâtre', null),
  -- Maternité
  ('Maternité', 'Berceau coque', null),
  ('Maternité', 'Couveuse pour nouveau-nés BIN3000A', null),
  ('Maternité', 'Couveuse pour nouveau-nés BIN3000B(B)', null),
  ('Maternité', 'Doppler fœtal', null),
  ('Maternité', 'Kit d''aspiration manuelle intra-utérine', null),
  ('Maternité', 'Lit d''accouchement 1900 x 900 x 850mm', null),
  ('Maternité', 'Lit d''accouchement 1800 x 610 x 800mm', null),
  ('Maternité', 'Lit d''examen gynécologique 1800 x 610 x 800mm', null),
  ('Maternité', 'Lit parc', null),
  ('Maternité', 'Pèse bébé avec toise', null),
  ('Maternité', 'Pèse bébé mécanique à aiguille', null),
  ('Maternité', 'Pingouin', null),
  ('Maternité', 'Stéthoscope de Pinard', null),
  ('Maternité', 'Table chauffante bébé', null),
  ('Maternité', 'Toise bébé', null),
  -- Stérilisation
  ('Stérilisation', 'Autoclave vertical 100L', null),
  ('Stérilisation', 'Autoclave cocotte mixte 21 litres', null),
  ('Stérilisation', 'Stérilisateur à vapeur TM-XB20J (20L)', null),
  ('Stérilisation', 'Stérilisateur à vapeur TM-XB24J (24L)', null),
  ('Stérilisation', 'Stérilisateur TM-XD24D (24L)', null),
  -- Urgence
  ('Urgence', 'Aspirateur de mucosité à pédale', null),
  ('Urgence', 'Aspirateur de mucosité électrique', null),
  ('Urgence', 'Aspirateur de mucosité manuel', 'Yuwell'),
  ('Urgence', 'Brancard chariot inox', null),
  ('Urgence', 'Brancard pliable', null),
  ('Urgence', 'Chariot brancard d''ambulance', null),
  ('Urgence', 'Fauteuil roulant', null),
  ('Urgence', 'Insufflateur silicone pour adulte', null),
  ('Urgence', 'Insufflateur silicone pour enfant', null),
  ('Urgence', 'Nébuliseur', 'Niscomed'),
  ('Urgence', 'Nébuliseur électropneumatique', 'Miko'),
  -- Ophtalmologie
  ('Ophtalmologie', 'Ophtalmoscope', null),
  -- O.R.L. Gastroentérologie
  ('O.R.L. Gastroentérologie', 'Kit d''otoscope', null),
  -- Diagnostique
  ('Diagnostique', 'Lampe LED', null),
  ('Diagnostique', 'Lampe halogène', null),
  ('Diagnostique', 'Lit d''examen en acier inoxydable avec porte-rouleau', null),
  ('Diagnostique', 'Lit d''examen', null),
  ('Diagnostique', 'Pèse personne à cadran mécanique avec toise', null),
  ('Diagnostique', 'Pèse personne avec toise', null),
  ('Diagnostique', 'Pèse personne', null),
  ('Diagnostique', 'Tensiomètre manuel adulte', null),
  ('Diagnostique', 'Thermomètre infra rouge', null),
  ('Diagnostique', 'Toise adulte avec socle', null),
  -- Mobilier
  ('Mobilier', 'Bassin de lit', null),
  ('Mobilier', 'Barrières de lit', null),
  ('Mobilier', 'Chariot à instruments à trois niveaux', null),
  ('Mobilier', 'Chariot de soins à trois niveaux', null),
  ('Mobilier', 'Chariot de pansement à deux niveaux', null),
  ('Mobilier', 'Chariot de soins à deux niveaux', null),
  ('Mobilier', 'Escabeau moyen 2 marches', null),
  ('Mobilier', 'Escabeau grand 2 marches', null),
  ('Mobilier', 'Lit mécanique une manivelle - roues et barrières', null),
  ('Mobilier', 'Lit mécanique deux manivelles - roues et barrières', null),
  ('Mobilier', 'Lit d''hospitalisation mécanique 3 manivelles', null),
  ('Mobilier', 'Matelas anti-escarre', null),
  ('Mobilier', 'Paravent 3 panneaux', null),
  ('Mobilier', 'Potence', null),
  ('Mobilier', 'Potence inox', null),
  ('Mobilier', 'Roues de lit', null),
  ('Mobilier', 'Table à manger', null),
  ('Mobilier', 'Table de chevet à roues', null),
  ('Mobilier', 'Tabouret à hauteur réglable avec dossier (modèle 1)', null),
  ('Mobilier', 'Tabouret à hauteur réglable avec dossier (modèle 2)', null),
  ('Mobilier', 'Tabouret à hauteur réglable sans dossier (modèle 1)', null),
  ('Mobilier', 'Tabouret à hauteur réglable sans dossier (modèle 2)', null),
  -- Divers & Accessoires
  ('Divers & Accessoires', 'Boîte de sécurité 5 litres', null),
  ('Divers & Accessoires', 'Porte vaccin', null),
  ('Divers & Accessoires', 'Pissette d''alcool 250ml', null),
  ('Divers & Accessoires', 'Pissette d''alcool 500ml', null),
  ('Divers & Accessoires', 'Thermo-hygromètre numérique', null),
  ('Divers & Accessoires', 'Thermomètre LCD mini sonde 1m (réfrigérateurs/congélateurs)', null),
  ('Divers & Accessoires', 'Thermomètre de pièce', null),
  ('Divers & Accessoires', 'Urinal homme 1L', null),
  ('Divers & Accessoires', 'Urinal femme 1L', null),
  -- Chirurgie Générale
  ('Chirurgie Générale', 'Boîte de suture 11 pièces', null),
  ('Chirurgie Générale', 'Boîte petite chirurgie 11 pièces', null),
  ('Chirurgie Générale', 'Boîte de traumatologie 46 pièces', null),
  ('Chirurgie Générale', 'Boîte chirurgie générale 49 pièces', null),
  ('Chirurgie Générale', 'Boîte de laparatomie 48 pièces', null),
  ('Chirurgie Générale', 'Boîte d''appendicite-hernie 53 pièces', null),
  ('Chirurgie Générale', 'Boîte chirurgie abdominale 75 pièces', null),
  ('Chirurgie Générale', 'Boîte pour chirurgie biliaire et digestive 77 pièces', null),
  -- Gynécologie-Obstétrique
  ('Gynécologie-Obstétrique', 'Boîte accouchement 12 pièces', null),
  ('Gynécologie-Obstétrique', 'Boîte d''épisiotomie 15 pièces', null),
  ('Gynécologie-Obstétrique', 'Boîte urgence gynécologie 16 pièces', null),
  ('Gynécologie-Obstétrique', 'Boîte d''accouchement complète 21 pièces', null),
  ('Gynécologie-Obstétrique', 'Boîte de curetage 23 pièces', null),
  ('Gynécologie-Obstétrique', 'Boîte de césarienne 38 pièces', null),
  ('Gynécologie-Obstétrique', 'Boîte d''hystérectomie 48 pièces', null),
  -- Pédiatrie
  ('Pédiatrie', 'Boîte courante pédiatrique 32 pièces', null),
  -- ORL
  ('ORL', 'Boîte complète pour ORL 43 pièces', null),
  -- Soins Courants
  ('Soins Courants', 'Boîte à coton 110 x 140mm', null),
  ('Soins Courants', 'Boîte pansement 08 pièces', null),
  ('Soins Courants', 'Boîte infirmière 14 pièces', null),
  -- Prélèvement & Diagnostic
  ('Prélèvement & Diagnostic', 'Aiguille de prélèvement', null),
  ('Prélèvement & Diagnostic', 'Bandelette glycémie', null),
  ('Prélèvement & Diagnostic', 'Thermomètre clinique', 'ChannelMED'),
  ('Prélèvement & Diagnostic', 'Thermomètre digital', 'Gima'),
  ('Prélèvement & Diagnostic', 'Tube de prélèvement violet 4ml', null),
  ('Prélèvement & Diagnostic', 'Tube de prélèvement rouge + activator 4ml', null),
  ('Prélèvement & Diagnostic', 'Tube de prélèvement gris 4ml', null),
  -- Perfusion & Injection
  ('Perfusion & Injection', 'Épicranienne (scalp vein set) G21 à G23', null),
  ('Perfusion & Injection', 'Intra nule (IV cannula) G20/G22/G24', null),
  ('Perfusion & Injection', 'Perfuseur', null),
  ('Perfusion & Injection', 'Seringue à insuline 1ml', null),
  ('Perfusion & Injection', 'Seringue 2,5ml', null),
  ('Perfusion & Injection', 'Seringue 5ml', null),
  ('Perfusion & Injection', 'Seringue 10ml', null),
  ('Perfusion & Injection', 'Seringue 20ml', null),
  -- Pansement & Suture
  ('Pansement & Suture', 'Bande 10 cm', null),
  ('Pansement & Suture', 'Bande 7,5 cm', null),
  ('Pansement & Suture', 'Bande 5 cm', null),
  ('Pansement & Suture', 'Compresses non stérile 16 plis', null),
  ('Pansement & Suture', 'Compresses stériles', null),
  ('Pansement & Suture', 'Rouleau de coton', null),
  ('Pansement & Suture', 'Fil de suture nylon', 'Agary'),
  ('Pansement & Suture', 'Fil de suture Vicryl (acide polyglycolique)', null),
  ('Pansement & Suture', 'Lame de bistouri', null),
  ('Pansement & Suture', 'Sparadrap 18cm x 5m', 'ChannelMED'),
  -- Sondage & Drainage
  ('Sondage & Drainage', 'Poche à urine (urine bag)', null),
  ('Sondage & Drainage', 'Sonde gastrique (stomach tube)', null),
  ('Sondage & Drainage', 'Sonde urinaire / sonde de Foley (N°16, 18, 20)', null),
  -- Gynécologie
  ('Gynécologie', 'Gant de révision utérine', null),
  ('Gynécologie', 'Spéculum vaginal', null),
  -- Protection & Hygiène
  ('Protection & Hygiène', 'Bavettes (face mask) cache-nez', null),
  ('Protection & Hygiène', 'Charlotte (bouffant cap)', null),
  ('Protection & Hygiène', 'Gants propres', 'Maxpro'),
  ('Protection & Hygiène', 'Gants stériles', 'Maxter')
) as v(categorie, designation, marque)
join public.categories c on c.nom = v.categorie
where not exists (
  select 1 from public.articles a where a.designation = v.designation
);
