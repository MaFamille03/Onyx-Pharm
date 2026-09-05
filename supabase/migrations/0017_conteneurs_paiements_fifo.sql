-- ============================================================================
-- ONYX PHARM — Migration 0017 : Conteneurs — remplacement complet des
-- Achats, prix d'achat optionnel, paiements/statut liés au conteneur,
-- sorties de stock en FIFO multi-conteneurs (avec ciblage manuel possible)
--
-- Les Achats ne sont plus utilisés par l'application (menu retiré), mais
-- leurs tables et données existantes sont conservées telles quelles —
-- rien n'est supprimé.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) PRIX D'ACHAT GLOBAL DU CONTENEUR — DEVIENT OPTIONNEL
-- ----------------------------------------------------------------------------
alter table public.conteneurs alter column montant_achat_global drop not null;
alter table public.conteneurs alter column montant_achat_global drop default;
alter table public.conteneurs add column if not exists montant_paye numeric(14, 2) not null default 0;

-- Le statut du conteneur suit désormais son paiement (comme les achats et
-- ventes) : Validé → Partiellement payé → Payé. Un conteneur sans montant
-- renseigné reste simplement "Validé".
update public.conteneurs set statut = 'Validé' where statut = 'Actif';
alter table public.conteneurs alter column statut set default 'Validé';

-- ----------------------------------------------------------------------------
-- 2) PAIEMENTS DE CONTENEUR — remplace les paiements d'achats pour toute
-- nouvelle opération. Aucun rapport avec les ventes.
-- ----------------------------------------------------------------------------
create table public.paiements_conteneurs (
  id uuid primary key default gen_random_uuid(),
  conteneur_id uuid not null references public.conteneurs(id) on delete cascade,
  montant numeric(14, 2) not null check (montant > 0),
  mode_paiement text not null,
  date_paiement date not null default current_date,
  observation text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.paiements_conteneurs enable row level security;
create policy "Lecture utilisateurs connectés" on public.paiements_conteneurs for select to authenticated using (true);
create policy "Écriture utilisateurs connectés" on public.paiements_conteneurs for insert to authenticated with check (true);
create policy "Modification utilisateurs connectés" on public.paiements_conteneurs for update to authenticated using (true) with check (true);
create policy "Suppression utilisateurs connectés" on public.paiements_conteneurs for delete to authenticated using (true);

create function public.maj_montant_paye_conteneur()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_conteneur_id uuid := coalesce(new.conteneur_id, old.conteneur_id);
  v_total numeric;
  v_paye numeric;
begin
  select montant_achat_global into v_total from public.conteneurs where id = v_conteneur_id;
  select coalesce(sum(montant), 0) into v_paye
  from public.paiements_conteneurs where conteneur_id = v_conteneur_id;

  update public.conteneurs
  set montant_paye = v_paye,
      statut = case
        when statut = 'Annulé' then statut
        when v_total is null or v_total <= 0 then 'Validé'
        when v_paye >= v_total then 'Payé'
        when v_paye > 0 then 'Partiellement payé'
        else 'Validé'
      end
  where id = v_conteneur_id;

  return null;
end;
$$;

create trigger trg_maj_montant_paye_conteneur
  after insert or update or delete on public.paiements_conteneurs
  for each row execute function public.maj_montant_paye_conteneur();

-- ----------------------------------------------------------------------------
-- 3) DÉCAISSEMENT AUTOMATIQUE À CHAQUE PAIEMENT DE CONTENEUR
-- Remplace, pour toute nouvelle opération, le lien achat → décaissement.
-- ----------------------------------------------------------------------------
alter table public.decaissements add column if not exists conteneur_id uuid references public.conteneurs(id);

create function public.synchroniser_decaissement_conteneur()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_conteneur record;
  v_reference text;
begin
  select * into v_conteneur from public.conteneurs where id = new.conteneur_id;

  v_reference := public.generer_numero_document('DEC');

  insert into public.decaissements (
    reference, date_operation, montant, mode_paiement,
    fournisseur_id, conteneur_id, categorie, description, created_by
  ) values (
    v_reference, new.date_paiement, new.montant, new.mode_paiement,
    v_conteneur.fournisseur_id, new.conteneur_id, 'Achat',
    'Paiement conteneur ' || coalesce(v_conteneur.code, ''), new.created_by
  );

  return new;
end;
$$;

create trigger trg_synchroniser_decaissement_conteneur
  after insert on public.paiements_conteneurs
  for each row execute function public.synchroniser_decaissement_conteneur();

-- ----------------------------------------------------------------------------
-- 4) VUE DES DETTES PAR CONTENEUR (remplace v_dettes_fournisseurs pour les
-- nouvelles opérations — l'ancienne vue reste disponible pour l'historique).
-- ----------------------------------------------------------------------------
create view public.v_dettes_conteneurs as
select
  co.id as conteneur_id,
  co.code as reference,
  co.fournisseur_id,
  co.montant_achat_global as montant_total,
  co.montant_paye,
  co.montant_achat_global - co.montant_paye as dette
from public.conteneurs co
where co.statut <> 'Annulé'
  and co.montant_achat_global is not null
  and co.montant_achat_global - co.montant_paye > 0;

-- ----------------------------------------------------------------------------
-- 5) TRAÇABILITÉ DE LA CONSOMMATION FIFO D'UNE VENTE
-- Enregistre, pour chaque ligne de vente, la répartition exacte entre
-- conteneurs consommés — indispensable pour restituer correctement le
-- stock en cas d'annulation.
-- ----------------------------------------------------------------------------
create table public.lignes_ventes_conteneurs (
  id uuid primary key default gen_random_uuid(),
  ligne_vente_id uuid not null references public.lignes_ventes(id) on delete cascade,
  conteneur_id uuid not null references public.conteneurs(id),
  quantite numeric(14, 2) not null check (quantite > 0),
  created_at timestamptz not null default now()
);

alter table public.lignes_ventes_conteneurs enable row level security;
create policy "Lecture utilisateurs connectés" on public.lignes_ventes_conteneurs for select to authenticated using (true);
create policy "Écriture utilisateurs connectés" on public.lignes_ventes_conteneurs for insert to authenticated with check (true);
create policy "Modification utilisateurs connectés" on public.lignes_ventes_conteneurs for update to authenticated using (true) with check (true);
create policy "Suppression utilisateurs connectés" on public.lignes_ventes_conteneurs for delete to authenticated using (true);

-- Permet, à la vente, de cibler manuellement un conteneur précis (ex : le
-- client demande la nouvelle version alors que l'ancienne est toujours en
-- stock). Laissé vide, la consommation se fait automatiquement en FIFO.
alter table public.lignes_ventes add column if not exists conteneur_id uuid references public.conteneurs(id);

-- ----------------------------------------------------------------------------
-- 6) CONSOMMATION DE STOCK — FIFO multi-conteneurs, avec ciblage manuel
-- optionnel. Vérifie toujours la disponibilité totale avant d'écrire quoi
-- que ce soit (aucune écriture partielle en cas d'échec).
-- ----------------------------------------------------------------------------
create function public.consommer_stock_fifo(
  p_article_id uuid,
  p_emplacement_id uuid,
  p_quantite numeric,
  p_conteneur_id uuid default null
)
returns table(conteneur_id uuid, quantite numeric)
language plpgsql
security definer set search_path = public
as $$
declare
  v_total numeric;
  v_restant numeric := p_quantite;
  v_ligne record;
  v_pris numeric;
begin
  if p_quantite <= 0 then
    raise exception 'La quantité doit être supérieure à zéro.';
  end if;

  if p_conteneur_id is not null then
    perform 1 from public.stocks
    where article_id = p_article_id and emplacement_id = p_emplacement_id
      and conteneur_id = p_conteneur_id
    for update;

    select coalesce(quantite, 0) into v_total from public.stocks
    where article_id = p_article_id and emplacement_id = p_emplacement_id
      and conteneur_id = p_conteneur_id;

    if v_total < p_quantite then
      raise exception 'Stock insuffisant dans ce conteneur (disponible : %, demandé : %).',
        v_total, p_quantite;
    end if;

    update public.stocks set quantite = quantite - p_quantite
    where article_id = p_article_id and emplacement_id = p_emplacement_id
      and conteneur_id = p_conteneur_id;

    conteneur_id := p_conteneur_id;
    quantite := p_quantite;
    return next;
    return;
  end if;

  perform 1 from public.stocks
  where article_id = p_article_id and emplacement_id = p_emplacement_id
  for update;

  select coalesce(sum(quantite), 0) into v_total from public.stocks
  where article_id = p_article_id and emplacement_id = p_emplacement_id;

  if v_total < p_quantite then
    raise exception 'Stock insuffisant (disponible : %, demandé : %).', v_total, p_quantite;
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

    update public.stocks set quantite = quantite - v_pris
    where article_id = p_article_id and emplacement_id = p_emplacement_id
      and conteneur_id = v_ligne.cid;

    conteneur_id := v_ligne.cid;
    quantite := v_pris;
    return next;

    v_restant := v_restant - v_pris;
  end loop;
end;
$$;

grant execute on function public.consommer_stock_fifo(uuid, uuid, numeric, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) VALIDATION DE VENTE — utilise désormais le FIFO multi-conteneurs et
-- journalise la répartition exacte par conteneur.
-- ----------------------------------------------------------------------------
create or replace function public.valider_vente(
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
  v_repartition record;
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
    begin
      for v_repartition in
        select * from public.consommer_stock_fifo(
          v_ligne.article_id, v_ligne.emplacement_id, v_ligne.quantite, v_ligne.conteneur_id
        )
      loop
        insert into public.lignes_ventes_conteneurs (ligne_vente_id, conteneur_id, quantite)
        values (v_ligne.id, v_repartition.conteneur_id, v_repartition.quantite);

        insert into public.mouvements_stock (
          article_id, emplacement_id, type, quantite,
          document_type, document_id, reference_document, observation, created_by
        ) values (
          v_ligne.article_id, v_ligne.emplacement_id, 'vente', -v_repartition.quantite,
          'vente', p_vente_id, v_vente.reference,
          'Conteneur consommé : ' || v_repartition.conteneur_id, p_utilisateur_id
        );
      end loop;
    exception when others then
      select designation into v_designation from public.articles where id = v_ligne.article_id;
      raise exception 'Stock insuffisant pour "%" : %', v_designation, sqlerrm;
    end;
  end loop;

  update public.ventes set statut = 'Validé' where id = p_vente_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8) ANNULATION DE VENTE — restitue le stock exactement aux conteneurs
-- d'origine (grâce à la répartition enregistrée à la validation).
-- ----------------------------------------------------------------------------
create or replace function public.annuler_vente(
  p_vente_id uuid,
  p_second_mdp text,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_vente record;
  v_ligne record;
  v_repartition record;
begin
  select * into v_vente from public.ventes where id = p_vente_id for update;

  if v_vente is null then
    raise exception 'Vente introuvable.';
  end if;

  if v_vente.statut = 'Annulé' then
    raise exception 'Cette vente est déjà annulée.';
  end if;

  if v_vente.statut <> 'Brouillon' then
    if p_second_mdp is null or not public.verifier_second_mot_de_passe(p_second_mdp) then
      raise exception 'Mot de passe de sécurité incorrect.';
    end if;

    for v_ligne in
      select * from public.lignes_ventes where vente_id = p_vente_id
    loop
      for v_repartition in
        select * from public.lignes_ventes_conteneurs where ligne_vente_id = v_ligne.id
      loop
        insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
        values (v_ligne.article_id, v_ligne.emplacement_id, v_repartition.conteneur_id, v_repartition.quantite)
        on conflict (article_id, emplacement_id, conteneur_id)
        do update set quantite = public.stocks.quantite + v_repartition.quantite;

        insert into public.mouvements_stock (
          article_id, emplacement_id, type, quantite,
          document_type, document_id, reference_document, observation, created_by
        ) values (
          v_ligne.article_id, v_ligne.emplacement_id, 'autre_entree', v_repartition.quantite,
          'annulation_vente', p_vente_id, v_vente.reference,
          'Stock restitué suite annulation de la vente', p_utilisateur_id
        );
      end loop;
    end loop;

    insert into public.historique (
      utilisateur_id, action, table_cible, enregistrement_id, description
    ) values (
      p_utilisateur_id, 'annulation', 'ventes', p_vente_id,
      'Annulation de la vente ' || v_vente.reference || ' (stock restitué)'
    );
  end if;

  update public.ventes set statut = 'Annulé' where id = p_vente_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9) TRANSFERTS — FIFO multi-conteneurs également, en conservant
-- l'identité du conteneur d'origine à la destination (un transfert ne
-- change pas le lot auquel appartient la marchandise).
-- ----------------------------------------------------------------------------
create or replace function public.effectuer_transfert(
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
  v_reference text;
  v_repartition record;
begin
  if p_quantite <= 0 then
    raise exception 'La quantité à transférer doit être supérieure à zéro.';
  end if;

  if p_source_id = p_destination_id then
    raise exception 'L''emplacement source et destination doivent être différents.';
  end if;

  v_reference := public.generer_numero_document('TRF');

  insert into public.transferts (
    reference, article_id, emplacement_source_id, emplacement_destination_id,
    quantite, statut, observation, created_by
  ) values (
    v_reference, p_article_id, p_source_id, p_destination_id,
    p_quantite, 'Validé', p_observation, p_utilisateur_id
  );

  for v_repartition in
    select * from public.consommer_stock_fifo(p_article_id, p_source_id, p_quantite, null)
  loop
    insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
    values (p_article_id, p_destination_id, v_repartition.conteneur_id, v_repartition.quantite)
    on conflict (article_id, emplacement_id, conteneur_id)
    do update set quantite = public.stocks.quantite + v_repartition.quantite;

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite,
      document_type, reference_document, observation, created_by
    ) values
      (p_article_id, p_source_id, 'transfert_sortant', -v_repartition.quantite,
       'transfert', v_reference, p_observation, p_utilisateur_id),
      (p_article_id, p_destination_id, 'transfert_entrant', v_repartition.quantite,
       'transfert', v_reference, p_observation, p_utilisateur_id);
  end loop;

  return v_reference;
end;
$$;
