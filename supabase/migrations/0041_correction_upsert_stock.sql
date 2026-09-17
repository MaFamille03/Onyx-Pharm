-- ============================================================================
-- ONYX PHARM — Migration 0041 : corrige un vrai bug de perte de
-- données sur le stock.
--
-- LE BUG : plusieurs endroits du site (correction de quantité depuis
-- la fiche article, import Excel d'articles, ajustement de stock)
-- faisaient un "upsert" qui, lorsqu'une ligne de stock existait déjà
-- pour Stock Initial (article + emplacement), REMPLAÇAIT sa quantité
-- au lieu de l'ADDITIONNER. Résultat concret, reproduit et vérifié :
-- si Stock Initial contenait déjà 4 unités et qu'on ajoutait 6, la
-- ligne finissait à 6 (les 4 déjà là étaient perdus) au lieu de 10.
--
-- LA CORRECTION : cette fonction ajoute vraiment la quantité demandée
-- à ce qui existe déjà, de façon atomique (jamais de risque de double
-- écriture concurrente), et est utilisée partout où on ajoute du stock
-- vers un conteneur, à la place d'un upsert fait à la main côté site.
-- ============================================================================

create or replace function public.ajouter_quantite_stock(
  p_article_id uuid,
  p_emplacement_id uuid,
  p_conteneur_id uuid,
  p_quantite numeric
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
begin
  if p_quantite is null or p_quantite = 0 then
    return;
  end if;

  insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite, quantite_initiale)
  values (p_article_id, p_emplacement_id, p_conteneur_id, p_quantite, p_quantite)
  on conflict (article_id, emplacement_id, conteneur_id)
  do update set quantite = public.stocks.quantite + p_quantite;
end;
$$;

grant execute on function public.ajouter_quantite_stock(uuid, uuid, uuid, numeric) to authenticated;
