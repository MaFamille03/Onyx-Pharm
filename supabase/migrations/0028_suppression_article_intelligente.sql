-- ============================================================================
-- ONYX PHARM — Migration 0028 : Suppression d'article intelligente
--
-- PROBLÈME CORRIGÉ
-- Jusqu'ici, la suppression d'un article était bloquée dès qu'une seule
-- ligne de stock ou de mouvement le référençait — y compris un article
-- simplement reçu dans un conteneur mais jamais vendu. Ce n'est pas une
-- "opération réelle" au sens métier : ça ne devrait pas empêcher la
-- suppression d'un article ajouté par erreur.
--
-- NOUVELLE RÈGLE
-- - Si l'article a une VRAIE opération historique (vente, retour client,
--   ligne d'inventaire) : suppression refusée avec un message explicite
--   (pas une erreur technique brute), qui invite à l'archiver à la place.
-- - Sinon (l'article n'a jamais été vendu, jamais compté en inventaire,
--   jamais retourné — au pire simplement reçu dans un conteneur et
--   toujours en stock) : suppression autorisée, et le stock encore
--   présent est retiré proprement au passage (les valeurs diminuent
--   comme il faut, rien ne reste orphelin).
-- ============================================================================

create function public.supprimer_article(p_article_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_article record;
  v_nb_ventes int;
  v_nb_retours int;
  v_nb_inventaires int;
  v_stock_total numeric;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_article from public.articles where id = p_article_id for update;
  if v_article is null then
    raise exception 'Article introuvable.';
  end if;

  select count(*) into v_nb_ventes from public.lignes_ventes where article_id = p_article_id;
  select count(*) into v_nb_retours from public.retours_clients where article_id = p_article_id;
  select count(*) into v_nb_inventaires from public.inventaire_lignes where article_id = p_article_id;

  if v_nb_ventes > 0 or v_nb_retours > 0 or v_nb_inventaires > 0 then
    raise exception
      'Impossible de supprimer "%" : il a un historique réel (% vente(s), % retour(s), % ligne(s) d''inventaire). Utilisez plutôt le statut "Archivé" pour le retirer de la circulation sans perdre cet historique.',
      v_article.designation, v_nb_ventes, v_nb_retours, v_nb_inventaires;
  end if;

  -- Aucune vraie opération : seulement présent en stock (reçu dans un
  -- conteneur, jamais vendu). On retire proprement ce qui reste avant de
  -- supprimer l'article, pour ne rien laisser orphelin.
  select coalesce(sum(quantite), 0) into v_stock_total
  from public.stocks where article_id = p_article_id;

  delete from public.stocks where article_id = p_article_id;
  delete from public.mouvements_stock where article_id = p_article_id;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'suppression', 'articles', p_article_id,
    'Suppression de l''article "' || v_article.designation || '"' ||
    case when v_stock_total > 0
      then ' (' || v_stock_total || ' unité(s) en stock retirée(s) au passage)'
      else ''
    end
  );

  delete from public.articles where id = p_article_id;
end;
$$;

grant execute on function public.supprimer_article(uuid, text) to authenticated;

-- L'ancien trigger générique de suppression n'est plus nécessaire : la
-- nouvelle fonction journalise elle-même, avec un message plus précis.
drop trigger if exists trg_log_historique_suppression_article on public.articles;
