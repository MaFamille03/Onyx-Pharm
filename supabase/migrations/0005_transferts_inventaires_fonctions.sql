-- ============================================================================
-- ONYX PHARM — Migration 0005 : Fonctions pour Transferts et Inventaires
--
-- Ces opérations sont réalisées via des fonctions PostgreSQL (et non depuis
-- le frontend) pour garantir l'intégrité du stock même en cas d'utilisateurs
-- simultanés (section 81 du cahier des charges) : verrouillage de ligne
-- (FOR UPDATE) le temps de la transaction, contrôle de disponibilité
-- effectué côté serveur, jamais côté client.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TRANSFERT ENTRE EMPLACEMENTS (sections 24-25)
-- Refuse le transfert si le stock source est insuffisant. Toute la
-- vérification + écriture se fait dans une seule transaction atomique.
-- ----------------------------------------------------------------------------
create function public.effectuer_transfert(
  p_article_id uuid,
  p_source_id uuid,
  p_destination_id uuid,
  p_quantite numeric,
  p_observation text,
  p_utilisateur_id uuid
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_stock_source numeric;
  v_reference text;
begin
  if p_quantite <= 0 then
    raise exception 'La quantité à transférer doit être supérieure à zéro.';
  end if;

  if p_source_id = p_destination_id then
    raise exception 'L''emplacement source et destination doivent être différents.';
  end if;

  -- Verrouille la ligne de stock source le temps de la transaction pour
  -- empêcher deux transferts simultanés de dépasser le stock disponible.
  select quantite into v_stock_source
  from public.stocks
  where article_id = p_article_id and emplacement_id = p_source_id
  for update;

  if v_stock_source is null or v_stock_source < p_quantite then
    raise exception 'Stock insuffisant à l''emplacement source (disponible : %).',
      coalesce(v_stock_source, 0);
  end if;

  v_reference := public.generer_numero_document('TRF');

  update public.stocks
  set quantite = quantite - p_quantite
  where article_id = p_article_id and emplacement_id = p_source_id;

  insert into public.stocks (article_id, emplacement_id, quantite)
  values (p_article_id, p_destination_id, p_quantite)
  on conflict (article_id, emplacement_id)
  do update set quantite = public.stocks.quantite + p_quantite;

  insert into public.transferts (
    reference, article_id, emplacement_source_id, emplacement_destination_id,
    quantite, statut, observation, created_by
  ) values (
    v_reference, p_article_id, p_source_id, p_destination_id,
    p_quantite, 'Validé', p_observation, p_utilisateur_id
  );

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, reference_document, observation, created_by
  ) values
    (p_article_id, p_source_id, 'transfert_sortant', -p_quantite,
     'transfert', v_reference, p_observation, p_utilisateur_id),
    (p_article_id, p_destination_id, 'transfert_entrant', p_quantite,
     'transfert', v_reference, p_observation, p_utilisateur_id);

  return v_reference;
end;
$$;

-- ----------------------------------------------------------------------------
-- VALIDATION D'INVENTAIRE (sections 27-28)
-- Applique tous les écarts d'un inventaire en une seule transaction :
-- ajuste le stock, journalise un mouvement par ligne en écart, marque
-- l'inventaire comme validé.
-- ----------------------------------------------------------------------------
create function public.valider_inventaire(
  p_inventaire_id uuid,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ligne record;
  v_emplacement_id uuid;
  v_reference text;
  v_statut text;
begin
  select emplacement_id, reference, statut
  into v_emplacement_id, v_reference, v_statut
  from public.inventaires
  where id = p_inventaire_id
  for update;

  if v_emplacement_id is null then
    raise exception 'Inventaire introuvable.';
  end if;

  if v_statut = 'Validé' then
    raise exception 'Cet inventaire a déjà été validé.';
  end if;

  for v_ligne in
    select * from public.inventaire_lignes
    where inventaire_id = p_inventaire_id and ecart <> 0
  loop
    insert into public.stocks (article_id, emplacement_id, quantite)
    values (v_ligne.article_id, v_emplacement_id, v_ligne.quantite_reelle)
    on conflict (article_id, emplacement_id)
    do update set quantite = v_ligne.quantite_reelle;

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite,
      document_type, document_id, reference_document, observation, created_by
    ) values (
      v_ligne.article_id, v_emplacement_id, 'ajustement_inventaire',
      v_ligne.ecart, 'inventaire', p_inventaire_id, v_reference,
      coalesce(v_ligne.observation, 'Ajustement suite inventaire'),
      p_utilisateur_id
    );
  end loop;

  update public.inventaires
  set statut = 'Validé', valide_at = now(), valide_by = p_utilisateur_id
  where id = p_inventaire_id;
end;
$$;

-- Autorise explicitement les utilisateurs connectés à appeler ces fonctions.
grant execute on function public.effectuer_transfert(uuid, uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.valider_inventaire(uuid, uuid) to authenticated;
