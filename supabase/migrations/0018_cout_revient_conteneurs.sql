-- ============================================================================
-- ONYX PHARM — Migration 0018 : Coût de revient par conteneur, date de
-- conception du site
-- ============================================================================

-- ----------------------------------------------------------------------------
-- COÛT DE REVIENT PAR CONTENEUR
-- Toujours recalculé à la volée (jamais stocké) : revenu réellement
-- encaissé sur ce conteneur moins son prix d'achat global. Le résultat
-- n'est renseigné (non nul) QUE si le conteneur est entièrement écoulé
-- (plus aucun stock, tous emplacements confondus) ET qu'un montant
-- d'achat a été renseigné — conformément au principe demandé.
-- ----------------------------------------------------------------------------
create view public.v_cout_revient_conteneurs as
select
  c.id as conteneur_id,
  c.code,
  c.montant_achat_global,
  coalesce(sr.stock_restant, 0) as stock_restant,
  coalesce(rv.revenu_realise, 0) as revenu_realise,
  case
    when coalesce(sr.stock_restant, 0) = 0 and c.montant_achat_global is not null
      then coalesce(rv.revenu_realise, 0) - c.montant_achat_global
    else null
  end as marge
from public.conteneurs c
left join (
  select conteneur_id, sum(quantite) as stock_restant
  from public.stocks
  group by conteneur_id
) sr on sr.conteneur_id = c.id
left join (
  -- Le revenu d'une ligne de vente partagée entre plusieurs conteneurs
  -- (FIFO) est réparti au prorata de la quantité prélevée dans chacun.
  select
    lvc.conteneur_id,
    sum((lvc.quantite / lv.quantite) * lv.montant_ligne) as revenu_realise
  from public.lignes_ventes_conteneurs lvc
  join public.lignes_ventes lv on lv.id = lvc.ligne_vente_id
  join public.ventes v on v.id = lv.vente_id
  where v.statut <> 'Annulé'
  group by lvc.conteneur_id
) rv on rv.conteneur_id = c.id;

-- ----------------------------------------------------------------------------
-- DATE DE CONCEPTION DU SITE — affichée dans l'application, jamais
-- inventée : laissée vide jusqu'à ce qu'elle soit renseignée.
-- ----------------------------------------------------------------------------
insert into public.parametres_generaux (cle, valeur)
values ('date_conception_site', '""'::jsonb)
on conflict (cle) do nothing;
