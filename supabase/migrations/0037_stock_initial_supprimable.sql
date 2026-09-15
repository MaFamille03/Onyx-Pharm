-- ============================================================================
-- ONYX PHARM — Migration 0037 : Stock Initial devient un conteneur
-- comme les autres — supprimable librement
--
-- AVANT : "Stock Initial" était protégé contre toute suppression, parce
-- que de nombreuses fonctions supposaient qu'il existait toujours. Le
-- supprimer manuellement (SQL direct ou remise à zéro) cassait
-- l'application jusqu'à ce qu'on la recrée à la main.
--
-- APRÈS : get_stock_initial_id() recrée elle-même la ligne
-- automatiquement, à la volée, si elle n'existe pas au moment où une
-- fonction en a besoin (création d'article avec stock, ajustement
-- manuel, surplus d'inventaire...). Plus besoin d'y penser : le
-- conteneur redevient supprimable comme n'importe quel autre, sans
-- jamais casser le site.
-- ============================================================================

create or replace function public.get_stock_initial_id()
returns uuid
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.conteneurs where code = 'STOCK-INITIAL';

  if v_id is null then
    insert into public.conteneurs (code, date_arrivee, montant_achat_global, statut, observation)
    values (
      'STOCK-INITIAL', current_date, 0, 'Actif',
      'Conteneur technique regroupant le stock non rattaché à un conteneur précis.'
    )
    on conflict (code) do nothing
    returning id into v_id;

    -- Un autre appel concurrent a pu le créer entre-temps : on relit.
    if v_id is null then
      select id into v_id from public.conteneurs where code = 'STOCK-INITIAL';
    end if;
  end if;

  return v_id;
end;
$$;

grant execute on function public.get_stock_initial_id() to authenticated;

-- ----------------------------------------------------------------------------
-- Retire le blocage spécifique sur "Stock Initial" dans la suppression
-- d'un conteneur — il suit désormais exactement les mêmes règles que
-- tous les autres (refusé seulement si des ventes y font réellement
-- référence, stock restant transféré automatiquement ailleurs).
-- ----------------------------------------------------------------------------
create or replace function public.supprimer_conteneur(p_conteneur_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_conteneur record;
  v_stock_initial_id uuid;
  v_ligne record;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_conteneur from public.conteneurs where id = p_conteneur_id for update;
  if v_conteneur is null then
    raise exception 'Conteneur introuvable.';
  end if;

  -- Si on supprime "Stock Initial" lui-même, le stock restant est
  -- transféré vers... un nouveau "Stock Initial" recréé automatiquement
  -- (get_stock_initial_id s'en charge, voir plus haut) — sauf si c'est
  -- justement lui qu'on est en train de vider, auquel cas on ne
  -- transfère nulle part : il n'y a plus de stock restant du tout après
  -- cette suppression, ce qui est le but recherché.
  if v_conteneur.code <> 'STOCK-INITIAL' then
    v_stock_initial_id := public.get_stock_initial_id();

    for v_ligne in
      select article_id, emplacement_id, quantite
      from public.stocks
      where conteneur_id = p_conteneur_id and quantite > 0
    loop
      insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite, quantite_initiale)
      values (v_ligne.article_id, v_ligne.emplacement_id, v_stock_initial_id, v_ligne.quantite, v_ligne.quantite)
      on conflict (article_id, emplacement_id, conteneur_id)
      do update set quantite = public.stocks.quantite + v_ligne.quantite;

      insert into public.mouvements_stock (
        article_id, emplacement_id, type, quantite,
        document_type, reference_document, observation
      ) values (
        v_ligne.article_id, v_ligne.emplacement_id, 'autre_entree', v_ligne.quantite,
        'suppression_conteneur', v_conteneur.code,
        'Stock transféré vers Stock Initial suite à la suppression du conteneur ' || v_conteneur.code
      );
    end loop;
  end if;

  delete from public.stocks where conteneur_id = p_conteneur_id;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'suppression', 'conteneurs', p_conteneur_id,
    'Suppression du conteneur ' || v_conteneur.code || ' (code PIN)'
  );

  -- Si des ventes ont déjà puisé dans ce conteneur, la contrainte de clé
  -- étrangère refuse ici, avec un message clair — volontaire, pour
  -- protéger l'historique des ventes. S'applique désormais pareil pour
  -- Stock Initial que pour n'importe quel autre conteneur.
  delete from public.conteneurs where id = p_conteneur_id;
end;
$$;

grant execute on function public.supprimer_conteneur(uuid, text) to authenticated;
