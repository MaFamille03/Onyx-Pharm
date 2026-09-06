-- ============================================================================
-- ONYX PHARM — Migration 0033 : Précise l'emplacement dans le message
-- "stock insuffisant"
-- ============================================================================

create or replace function public.consommer_stock_fifo(
  p_article_id uuid,
  p_emplacement_id uuid,
  p_quantite numeric,
  p_conteneur_id uuid default null
)
returns table(conteneur_id uuid, quantite numeric)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_total numeric;
  v_restant numeric := p_quantite;
  v_ligne record;
  v_pris numeric;
  v_nom_emplacement text;
begin
  if p_quantite <= 0 then
    raise exception 'La quantité doit être supérieure à zéro.';
  end if;

  select nom into v_nom_emplacement from public.emplacements where id = p_emplacement_id;

  if p_conteneur_id is not null then
    perform 1 from public.stocks
    where public.stocks.article_id = p_article_id
      and public.stocks.emplacement_id = p_emplacement_id
      and public.stocks.conteneur_id = p_conteneur_id
    for update;

    select coalesce(public.stocks.quantite, 0) into v_total from public.stocks
    where public.stocks.article_id = p_article_id
      and public.stocks.emplacement_id = p_emplacement_id
      and public.stocks.conteneur_id = p_conteneur_id;

    if v_total < p_quantite then
      raise exception 'Stock insuffisant dans ce conteneur, emplacement "%" (disponible : %, demandé : %).',
        coalesce(v_nom_emplacement, '?'), v_total, p_quantite;
    end if;

    update public.stocks set quantite = public.stocks.quantite - p_quantite
    where public.stocks.article_id = p_article_id
      and public.stocks.emplacement_id = p_emplacement_id
      and public.stocks.conteneur_id = p_conteneur_id;

    conteneur_id := p_conteneur_id;
    quantite := p_quantite;
    return next;
    return;
  end if;

  perform 1 from public.stocks
  where public.stocks.article_id = p_article_id
    and public.stocks.emplacement_id = p_emplacement_id
  for update;

  select coalesce(sum(public.stocks.quantite), 0) into v_total from public.stocks
  where public.stocks.article_id = p_article_id
    and public.stocks.emplacement_id = p_emplacement_id;

  if v_total < p_quantite then
    raise exception 'Quantité insuffisante dans l''emplacement "%" (disponible : %, demandé : %).',
      coalesce(v_nom_emplacement, '?'), v_total, p_quantite;
  end if;

  for v_ligne in
    select s.conteneur_id as cid, s.quantite as qte
    from public.stocks s
    join public.conteneurs c on c.id = s.conteneur_id
    where s.article_id = p_article_id and s.emplacement_id = p_emplacement_id
      and s.quantite > 0
    order by c.date_arrivee asc, c.created_at asc
  loop
    exit when v_restant <= 0;
    v_pris := least(v_ligne.qte, v_restant);

    update public.stocks set quantite = public.stocks.quantite - v_pris
    where public.stocks.article_id = p_article_id
      and public.stocks.emplacement_id = p_emplacement_id
      and public.stocks.conteneur_id = v_ligne.cid;

    conteneur_id := v_ligne.cid;
    quantite := v_pris;
    return next;

    v_restant := v_restant - v_pris;
  end loop;
end;
$$;

grant execute on function public.consommer_stock_fifo(uuid, uuid, numeric, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Date du paiement de vente — jusqu'ici toujours "aujourd'hui", jamais
-- modifiable. La colonne existe déjà (date_paiement date not null
-- default current_date sur paiements_ventes) ; rien à changer côté base,
-- uniquement côté application.
-- ----------------------------------------------------------------------------
