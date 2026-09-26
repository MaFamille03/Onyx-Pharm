-- ONYX PHARM — 0043 : lignes de vente hors catalogue
-- Une ligne hors catalogue est une vente historique/exceptionnelle qui ne
-- correspond à aucun article du catalogue et ne doit créer ni stock ni article.

alter table public.lignes_ventes
  alter column article_id drop not null,
  alter column emplacement_id drop not null;

alter table public.lignes_ventes
  add column if not exists hors_catalogue boolean not null default false,
  add column if not exists designation_hors_catalogue text;

alter table public.lignes_ventes
  drop constraint if exists lignes_ventes_hors_catalogue_coherence;

alter table public.lignes_ventes
  add constraint lignes_ventes_hors_catalogue_coherence check (
    (hors_catalogue = false and article_id is not null and emplacement_id is not null)
    or
    (hors_catalogue = true and article_id is null and emplacement_id is null and nullif(trim(designation_hors_catalogue), '') is not null)
  );

create index if not exists idx_lignes_ventes_hors_catalogue
  on public.lignes_ventes (hors_catalogue);

-- Validation : les lignes hors catalogue ne consomment aucun stock.
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
    if v_ligne.hors_catalogue then
      continue;
    end if;

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

grant execute on function public.valider_vente(uuid, uuid) to authenticated;

-- Annulation : aucune restitution de stock pour une ligne hors catalogue.
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
      if v_ligne.hors_catalogue then
        continue;
      end if;

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

grant execute on function public.annuler_vente(uuid, text, uuid) to authenticated;

-- Réouverture : les lignes hors catalogue n'ont aucun stock à restituer.
create or replace function public.rouvrir_vente_en_brouillon(p_vente_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_vente record;
  v_nb_paiements int;
  v_ligne record;
  v_repartition record;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_vente from public.ventes where id = p_vente_id for update;
  if v_vente is null then
    raise exception 'Vente introuvable.';
  end if;

  if v_vente.statut = 'Brouillon' then
    raise exception 'Cette vente est déjà un brouillon.';
  end if;

  select count(*) into v_nb_paiements from public.paiements_ventes where vente_id = p_vente_id;
  if v_nb_paiements > 0 then
    raise exception 'Supprimez d''abord les % paiement(s) enregistré(s) sur cette vente (Ventes > Paiements) avant de pouvoir la modifier.', v_nb_paiements;
  end if;

  for v_ligne in
    select * from public.lignes_ventes where vente_id = p_vente_id
  loop
    if v_ligne.hors_catalogue then
      delete from public.lignes_ventes_conteneurs where ligne_vente_id = v_ligne.id;
      continue;
    end if;

    for v_repartition in
      select * from public.lignes_ventes_conteneurs where ligne_vente_id = v_ligne.id
    loop
      insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
      values (v_ligne.article_id, v_ligne.emplacement_id, v_repartition.conteneur_id, v_repartition.quantite)
      on conflict (article_id, emplacement_id, conteneur_id)
      do update set quantite = public.stocks.quantite + v_repartition.quantite;

      insert into public.mouvements_stock (
        article_id, emplacement_id, type, quantite,
        document_type, document_id, reference_document, observation
      ) values (
        v_ligne.article_id, v_ligne.emplacement_id, 'autre_entree', v_repartition.quantite,
        'reouverture_vente', p_vente_id, v_vente.reference,
        'Stock restitué pour permettre la modification de la vente'
      );
    end loop;

    delete from public.lignes_ventes_conteneurs where ligne_vente_id = v_ligne.id;
  end loop;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'modification', 'ventes', p_vente_id,
    'Vente ' || v_vente.reference || ' rouverte en brouillon pour modification (code PIN)'
  );

  update public.ventes set statut = 'Brouillon' where id = p_vente_id;
end;
$$;

grant execute on function public.rouvrir_vente_en_brouillon(uuid, text) to authenticated;
