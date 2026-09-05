-- ============================================================================
-- ONYX PHARM — Migration 0006 : Achats — réception, retours, synchronisation
-- automatique des paiements et du statut
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RÉCEPTION D'UNE LIGNE D'ACHAT (section 30)
-- Entre la quantité reçue dans le stock de l'emplacement choisi à la
-- création de l'achat. Ne peut réceptionner deux fois la même ligne.
-- ----------------------------------------------------------------------------
create function public.receptionner_ligne_achat(
  p_ligne_id uuid,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ligne record;
  v_achat record;
begin
  select * into v_ligne
  from public.lignes_achats
  where id = p_ligne_id
  for update;

  if v_ligne is null then
    raise exception 'Ligne d''achat introuvable.';
  end if;

  if v_ligne.recu then
    raise exception 'Cette ligne a déjà été réceptionnée.';
  end if;

  if v_ligne.emplacement_destination_id is null then
    raise exception 'Aucun emplacement de destination défini pour cette ligne.';
  end if;

  select * into v_achat from public.achats where id = v_ligne.achat_id;

  if v_achat.statut in ('Brouillon', 'Annulé') then
    raise exception 'Impossible de réceptionner un achat en brouillon ou annulé.';
  end if;

  insert into public.stocks (article_id, emplacement_id, quantite)
  values (v_ligne.article_id, v_ligne.emplacement_destination_id, v_ligne.quantite)
  on conflict (article_id, emplacement_id)
  do update set quantite = public.stocks.quantite + v_ligne.quantite;

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, document_id, reference_document, created_by
  ) values (
    v_ligne.article_id, v_ligne.emplacement_destination_id, 'achat', v_ligne.quantite,
    'achat', v_ligne.achat_id, v_achat.reference, p_utilisateur_id
  );

  update public.lignes_achats set recu = true where id = p_ligne_id;
end;
$$;

grant execute on function public.receptionner_ligne_achat(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RETOUR FOURNISSEUR — sort la quantité retournée du stock, avec contrôle
-- de disponibilité (même logique de verrouillage que les transferts).
-- ----------------------------------------------------------------------------
create function public.effectuer_retour_fournisseur(
  p_achat_id uuid,
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
  v_stock_actuel numeric;
  v_reference text;
begin
  if p_quantite <= 0 then
    raise exception 'La quantité à retourner doit être supérieure à zéro.';
  end if;

  select quantite into v_stock_actuel
  from public.stocks
  where article_id = p_article_id and emplacement_id = p_emplacement_id
  for update;

  if v_stock_actuel is null or v_stock_actuel < p_quantite then
    raise exception 'Stock insuffisant à cet emplacement (disponible : %).',
      coalesce(v_stock_actuel, 0);
  end if;

  v_reference := public.generer_numero_document('RTF');

  update public.stocks
  set quantite = quantite - p_quantite
  where article_id = p_article_id and emplacement_id = p_emplacement_id;

  insert into public.retours_fournisseurs (
    reference, achat_id, article_id, emplacement_id, quantite,
    motif, montant_impact, created_by
  ) values (
    v_reference, p_achat_id, p_article_id, p_emplacement_id, p_quantite,
    p_motif, p_montant_impact, p_utilisateur_id
  );

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, document_id, reference_document, observation, created_by
  ) values (
    p_article_id, p_emplacement_id, 'retour_fournisseur', -p_quantite,
    'retour_fournisseur', p_achat_id, v_reference, p_motif, p_utilisateur_id
  );

  return v_reference;
end;
$$;

grant execute on function public.effectuer_retour_fournisseur(uuid, uuid, uuid, numeric, text, numeric, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- SYNCHRONISATION AUTOMATIQUE — montant_paye et statut d'un achat
-- (sections 32-33). Se déclenche à chaque paiement ajouté ou retiré.
-- ----------------------------------------------------------------------------
create function public.maj_montant_paye_achat()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_achat_id uuid := coalesce(new.achat_id, old.achat_id);
  v_total numeric;
  v_paye numeric;
begin
  select montant_total into v_total from public.achats where id = v_achat_id;
  select coalesce(sum(montant), 0) into v_paye
  from public.paiements_achats where achat_id = v_achat_id;

  update public.achats
  set montant_paye = v_paye,
      statut = case
        when statut = 'Annulé' then statut
        when v_total > 0 and v_paye >= v_total then 'Payé'
        when v_paye > 0 then 'Partiellement payé'
        else statut
      end
  where id = v_achat_id;

  return null;
end;
$$;

create trigger trg_maj_montant_paye_achat
  after insert or update or delete on public.paiements_achats
  for each row execute function public.maj_montant_paye_achat();

-- Autoriser explicitement la lecture/écriture de la nouvelle table via RLS
-- (déjà couverte par la boucle générique de la migration 0004, sauf si
-- cette migration est exécutée sur un projet déjà initialisé : ce bloc est
-- donc rejoué ici par sécurité, sans effet si déjà en place).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'retours_fournisseurs'
      and policyname = 'Lecture utilisateurs connectés'
  ) then
    alter table public.retours_fournisseurs enable row level security;
    create policy "Lecture utilisateurs connectés" on public.retours_fournisseurs for select to authenticated using (true);
    create policy "Écriture utilisateurs connectés" on public.retours_fournisseurs for insert to authenticated with check (true);
    create policy "Modification utilisateurs connectés" on public.retours_fournisseurs for update to authenticated using (true) with check (true);
    create policy "Suppression utilisateurs connectés" on public.retours_fournisseurs for delete to authenticated using (true);
  end if;
end $$;
