-- ============================================================================
-- ONYX PHARM — Migration 0020 : Date d'inventaire, suppression sécurisée
-- des inventaires, et activation du temps réel (Supabase Realtime)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) DATE DE L'INVENTAIRE
-- ----------------------------------------------------------------------------
alter table public.inventaires
  add column if not exists date_inventaire date not null default current_date;

-- ----------------------------------------------------------------------------
-- 2) SUPPRESSION D'UN INVENTAIRE
-- Un inventaire en brouillon n'a jamais touché le stock : suppression
-- libre, sans code PIN. Un inventaire déjà validé a modifié le stock :
-- la suppression exige le code PIN et restitue exactement l'écart
-- inverse (au conteneur "Stock Initial", cible utilisée par
-- valider_inventaire) pour ne jamais désynchroniser le stock réel.
-- ----------------------------------------------------------------------------
create function public.supprimer_inventaire(p_inventaire_id uuid, p_pin text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_inventaire record;
  v_ligne record;
  v_stock_initial_id uuid := public.get_stock_initial_id();
begin
  select * into v_inventaire from public.inventaires where id = p_inventaire_id for update;

  if v_inventaire is null then
    raise exception 'Inventaire introuvable.';
  end if;

  if v_inventaire.statut = 'Validé' then
    if p_pin is null or not public.verifier_pin_securite(p_pin) then
      raise exception 'Code PIN incorrect.';
    end if;

    for v_ligne in
      select * from public.inventaire_lignes
      where inventaire_id = p_inventaire_id and ecart <> 0
    loop
      update public.stocks
      set quantite = quantite - v_ligne.ecart
      where article_id = v_ligne.article_id
        and emplacement_id = v_inventaire.emplacement_id
        and conteneur_id = v_stock_initial_id;

      insert into public.mouvements_stock (
        article_id, emplacement_id, type, quantite,
        document_type, reference_document, observation
      ) values (
        v_ligne.article_id, v_inventaire.emplacement_id, 'ajustement_inventaire',
        -v_ligne.ecart, 'suppression_inventaire', v_inventaire.reference,
        'Annulation suite suppression de l''inventaire'
      );
    end loop;
  end if;

  delete from public.inventaires where id = p_inventaire_id;
end;
$$;

grant execute on function public.supprimer_inventaire(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) TEMPS RÉEL — les changements faits par un utilisateur apparaissent
-- chez tous les autres sans qu'ils aient besoin de recharger la page.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'articles', 'stocks', 'conteneurs', 'ventes', 'lignes_ventes',
      'paiements_ventes', 'paiements_conteneurs', 'encaissements',
      'decaissements', 'mouvements_stock', 'inventaires', 'clients',
      'fournisseurs'
    ])
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
