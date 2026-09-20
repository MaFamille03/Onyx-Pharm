-- ============================================================================
-- ONYX PHARM — Migration 0042 : complète les informations de
-- l'entreprise (adresse postale, adresse physique, fax) — utilisées
-- notamment sur la facture proforma. Fusionne avec ce qui existe déjà
-- (logo_url, etc.) sans rien écraser d'autre.
-- ============================================================================

update public.parametres_generaux
set valeur = valeur || '{
  "adresse_postale": "25 BP 1897 Abidjan 25",
  "adresse_physique": "Cocody Riviera Palmeraie Sicogi, Cité Du Bonheur, rue lumière villa 223, Porte 41",
  "telephone": "225 27 22 49 36 30 / 225 05 05 76 88 23 / 07 47 78 08 39",
  "fax": "225 27 22 49 36 30",
  "email": "onyx.pharm@yahoo.fr"
}'::jsonb
where cle = 'entreprise_info';

-- Si la ligne n'existait pas encore (nouvelle installation), la crée
-- entièrement.
insert into public.parametres_generaux (cle, valeur)
select
  'entreprise_info',
  '{
    "nom": "ONYX PHARM SARL",
    "activite": "Matériel Biomédical - Consommables, Instruments Chirurgicaux Dentaires et Orthopédiques, Mobilier - Fourniture de Bureau, Matériel Informatique",
    "telephone": "225 27 22 49 36 30 / 225 05 05 76 88 23 / 07 47 78 08 39",
    "email": "onyx.pharm@yahoo.fr",
    "logo_url": "/onyx-pharm-logo.png",
    "adresse_postale": "25 BP 1897 Abidjan 25",
    "adresse_physique": "Cocody Riviera Palmeraie Sicogi, Cité Du Bonheur, rue lumière villa 223, Porte 41",
    "fax": "225 27 22 49 36 30"
  }'::jsonb
where not exists (select 1 from public.parametres_generaux where cle = 'entreprise_info');
