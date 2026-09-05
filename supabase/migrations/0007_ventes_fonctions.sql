-- ============================================================================
-- ONYX PHARM — Migration 0007 : Ventes — validation, retours clients,
-- synchronisation automatique des paiements
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VALIDATION D'UNE VENTE (sections 39-40)
-- Décrémente le stock de chaque ligne, avec verrouillage et contrôle de
-- disponibilité par article : AUCUNE vente ne peut créer un stock négatif,
-- même en cas d'utilisateurs simultanés. Si une seule ligne manque de
-- stock, toute la validation est annulée (transaction atomique).
-- ----------------------------------------------------------------------------
create function public.valider_vente(
  p_vente_id uuid,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ligne record;
  v_vente record;
  v_stock_actuel numeric;
  v_designation text;
begin
  select * into v_vente from public.ventes where id = p_vente_id for update;

  if v_vente is null then
    raise exception 'Vente introuvable.';
  end if;

  if v_vente.statut <> 'Brouillon' then
    raise exception 'Cette vente a déjà été validée.';
  end if;

  for v_ligne in
    select * from public.lignes_ventes where vente_id = p_vente_id
  loop
    select quantite into v_stock_actuel
    from public.stocks
    where article_id = v_ligne.article_id and emplacement_id = v_ligne.emplacement_id
    for update;

    if v_stock_actuel is null or v_stock_actuel < v_ligne.quantite then
      select designation into v_designation from public.articles where id = v_ligne.article_id;
      raise exception 'Stock insuffisant pour "%" (disponible : %, demandé : %).',
        v_designation, coalesce(v_stock_actuel, 0), v_ligne.quantite;
    end if;

    update public.stocks
    set quantite = quantite - v_ligne.quantite
    where article_id = v_ligne.article_id and emplacement_id = v_ligne.emplacement_id;

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite,
      document_type, document_id, reference_document, created_by
    ) values (
      v_ligne.article_id, v_ligne.emplacement_id, 'vente', -v_ligne.quantite,
      'vente', p_vente_id, v_vente.reference, p_utilisateur_id
    );
  end loop;

  update public.ventes set statut = 'Validé' where id = p_vente_id;
end;
$$;

grant execute on function public.valider_vente(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RETOUR CLIENT (section 44) — remet la quantité en stock.
-- ----------------------------------------------------------------------------
create function public.effectuer_retour_client(
  p_vente_id uuid,
  p_article_id uuid,
  p_emplacement_id uuid,
  p_quantite numeric,
  p_motif text,
  p_montant_impact numeric,
  p_utilisateur_id uuid
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_reference text;
begin
  if p_quantite <= 0 then
    raise exception 'La quantité retournée doit être supérieure à zéro.';
  end if;

  v_reference := public.generer_numero_document('RTC');

  insert into public.stocks (article_id, emplacement_id, quantite)
  values (p_article_id, p_emplacement_id, p_quantite)
  on conflict (article_id, emplacement_id)
  do update set quantite = public.stocks.quantite + p_quantite;

  insert into public.retours_clients (
    reference, vente_id, article_id, emplacement_id, quantite,
    motif, montant_impact, created_by
  ) values (
    v_reference, p_vente_id, p_article_id, p_emplacement_id, p_quantite,
    p_motif, p_montant_impact, p_utilisateur_id
  );

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, document_id, reference_document, observation, created_by
  ) values (
    p_article_id, p_emplacement_id, 'retour_client', p_quantite,
    'retour_client', p_vente_id, v_reference, p_motif, p_utilisateur_id
  );

  return v_reference;
end;
$$;

grant execute on function public.effectuer_retour_client(uuid, uuid, uuid, numeric, text, numeric, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- SYNCHRONISATION AUTOMATIQUE — montant_paye et statut d'une vente
-- (sections 41-42), même principe que pour les achats.
-- ----------------------------------------------------------------------------
create function public.maj_montant_paye_vente()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_vente_id uuid := coalesce(new.vente_id, old.vente_id);
  v_total numeric;
  v_paye numeric;
begin
  select montant_total into v_total from public.ventes where id = v_vente_id;
  select coalesce(sum(montant), 0) into v_paye
  from public.paiements_ventes where vente_id = v_vente_id;

  update public.ventes
  set montant_paye = v_paye,
      statut = case
        when statut = 'Annulé' then statut
        when statut = 'Brouillon' then statut
        when v_total > 0 and v_paye >= v_total then 'Payé'
        when v_paye > 0 then 'Partiellement payé'
        else 'Validé'
      end
  where id = v_vente_id;

  return null;
end;
$$;

create trigger trg_maj_montant_paye_vente
  after insert or update or delete on public.paiements_ventes
  for each row execute function public.maj_montant_paye_vente();
