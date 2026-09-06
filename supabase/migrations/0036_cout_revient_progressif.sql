-- ============================================================================
-- ONYX PHARM — Migration 0036 : Coût de revient PROGRESSIF
--
-- AVANT : la marge n'était calculée qu'une fois le conteneur
-- ENTIÈREMENT écoulé (stock_restant = 0), sinon "null" partout tant
-- qu'il restait la moindre unité.
--
-- APRÈS : le coût de revient évolue au fur et à mesure des ventes,
-- dès qu'au moins une unité a été vendue — pas besoin d'attendre que
-- le conteneur soit entièrement vide. On distingue :
--   - cout_unitaire : montant d'achat global ÷ quantité initiale totale
--     (connu dès la création du conteneur, si un montant a été saisi)
--   - cout_portion_vendue : cout_unitaire × quantité déjà vendue
--   - marge_realisee : revenu déjà encaissé - cout_portion_vendue
--     (évolue à chaque vente)
--   - marge_finale : identique à l'ancien comportement, uniquement
--     renseignée une fois le conteneur entièrement écoulé (gardée pour
--     compatibilité avec l'existant)
--
-- LIMITE HONNÊTE : pour les conteneurs créés AVANT la mise en place de
-- la quantité initiale traçable (migration 0035), la "quantité
-- initiale totale" a été reconstituée à partir du stock restant à ce
-- moment-là — elle peut donc être approximative pour l'historique
-- ancien. Pour tout conteneur créé depuis, elle est exacte.
-- ============================================================================

drop view if exists public.v_cout_revient_conteneurs;

create view public.v_cout_revient_conteneurs as
select
  c.id as conteneur_id,
  c.code,
  c.montant_achat_global,
  coalesce(qi.quantite_initiale_totale, 0) as quantite_initiale_totale,
  coalesce(sr.stock_restant, 0) as stock_restant,
  coalesce(rv.revenu_realise, 0) as revenu_realise,
  case
    when coalesce(qi.quantite_initiale_totale, 0) > 0 and c.montant_achat_global is not null
      then c.montant_achat_global / qi.quantite_initiale_totale
    else null
  end as cout_unitaire,
  case
    when coalesce(qi.quantite_initiale_totale, 0) > 0 and c.montant_achat_global is not null
      then (c.montant_achat_global / qi.quantite_initiale_totale)
        * (qi.quantite_initiale_totale - coalesce(sr.stock_restant, 0))
    else null
  end as cout_portion_vendue,
  case
    when coalesce(qi.quantite_initiale_totale, 0) > 0 and c.montant_achat_global is not null
      then coalesce(rv.revenu_realise, 0)
        - (c.montant_achat_global / qi.quantite_initiale_totale)
          * (qi.quantite_initiale_totale - coalesce(sr.stock_restant, 0))
    else null
  end as marge_realisee,
  case
    when coalesce(sr.stock_restant, 0) = 0 and c.montant_achat_global is not null
      then coalesce(rv.revenu_realise, 0) - c.montant_achat_global
    else null
  end as marge_finale
from public.conteneurs c
left join (
  select conteneur_id, sum(quantite) as stock_restant
  from public.stocks
  group by conteneur_id
) sr on sr.conteneur_id = c.id
left join (
  select conteneur_id, sum(coalesce(quantite_initiale, quantite)) as quantite_initiale_totale
  from public.stocks
  group by conteneur_id
) qi on qi.conteneur_id = c.id
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
