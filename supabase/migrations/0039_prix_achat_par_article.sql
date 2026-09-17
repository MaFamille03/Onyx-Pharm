-- ============================================================================
-- ONYX PHARM — Migration 0039 : Prix d'achat réel par article dans une
-- commande (au lieu d'une moyenne globale), avec taux de change et
-- coefficient de marge pour aider à calculer le prix de vente suggéré.
--
-- AVANT : une commande n'avait qu'un montant d'achat global unique pour
-- tout son contenu — le coût de revient était donc une MOYENNE sur tous
-- les articles, alors qu'en réalité chaque article a un coût très
-- différent (confirmé par une vraie facture fournisseur : de 0,7$ à
-- 632$ l'unité selon l'article, dans la même commande).
--
-- APRÈS : chaque ligne de stock (article + emplacement + commande) peut
-- porter son propre prix d'achat unitaire réel. montant_achat_global
-- reste disponible pour une saisie simple à l'ancienne (une seule
-- somme), mais quand les prix par article sont fournis, il est
-- recalculé automatiquement comme leur somme — jamais les deux en
-- même temps de façon incohérente.
-- ============================================================================

alter table public.stocks
  add column if not exists prix_achat_unitaire numeric(14, 2);

comment on column public.stocks.prix_achat_unitaire is
  'Coût d''achat réel d''une unité de cet article, pour CE lot précis (cette ligne de commande). Permet un coût de revient par article plutôt qu''une moyenne globale.';

alter table public.conteneurs
  add column if not exists taux_change numeric(14, 4),
  add column if not exists coefficient_marge numeric(14, 4);

comment on column public.conteneurs.taux_change is
  'Taux de change utilisé pour convertir un prix d''achat en devise étrangère vers le FCFA (ex : 700). Purement indicatif, pour aider la saisie — jamais utilisé automatiquement ailleurs.';
comment on column public.conteneurs.coefficient_marge is
  'Coefficient appliqué au prix d''achat unitaire pour suggérer un prix de vente (ex : 2,5). Purement indicatif — le prix de vente réel reste toujours modifiable à la main.';

-- ----------------------------------------------------------------------------
-- Vue : coût de revient réel, par article, au sein de chaque commande.
-- Complète (ne remplace pas) v_cout_revient_conteneurs, qui reste la
-- vue globale par commande.
-- ----------------------------------------------------------------------------
create or replace view public.v_cout_revient_articles as
select
  s.conteneur_id,
  c.code as conteneur_code,
  s.article_id,
  a.designation,
  s.prix_achat_unitaire,
  coalesce(qi.quantite_initiale_totale, 0) as quantite_initiale,
  s.quantite as quantite_restante,
  coalesce(rv.quantite_vendue, 0) as quantite_vendue,
  coalesce(rv.revenu_realise, 0) as revenu_realise,
  case
    when s.prix_achat_unitaire is not null
      then s.prix_achat_unitaire * coalesce(rv.quantite_vendue, 0)
    else null
  end as cout_portion_vendue,
  case
    when s.prix_achat_unitaire is not null
      then coalesce(rv.revenu_realise, 0) - s.prix_achat_unitaire * coalesce(rv.quantite_vendue, 0)
    else null
  end as marge_realisee
from public.stocks s
join public.conteneurs c on c.id = s.conteneur_id
join public.articles a on a.id = s.article_id
left join (
  select article_id, conteneur_id, sum(coalesce(quantite_initiale, quantite)) as quantite_initiale_totale
  from public.stocks
  group by article_id, conteneur_id
) qi on qi.article_id = s.article_id and qi.conteneur_id = s.conteneur_id
left join (
  select
    lvc.conteneur_id,
    lv.article_id,
    sum(lvc.quantite) as quantite_vendue,
    sum((lvc.quantite / lv.quantite) * lv.montant_ligne) as revenu_realise
  from public.lignes_ventes_conteneurs lvc
  join public.lignes_ventes lv on lv.id = lvc.ligne_vente_id
  join public.ventes v on v.id = lv.vente_id
  where v.statut <> 'Annulé'
  group by lvc.conteneur_id, lv.article_id
) rv on rv.conteneur_id = s.conteneur_id and rv.article_id = s.article_id;

grant select on public.v_cout_revient_articles to authenticated;
