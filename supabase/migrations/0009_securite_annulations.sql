-- ============================================================================
-- ONYX PHARM — Migration 0009 : Traçabilité, sécurité, annulations
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECOND MOT DE PASSE DE SÉCURITÉ (section 8)
-- Stocké uniquement sous forme de hachage (bcrypt via pgcrypto). La ligne
-- est protégée : aucun utilisateur ne peut la lire ni l'écrire directement
-- via l'API — seules les fonctions ci-dessous (exécutées avec les
-- privilèges du propriétaire) peuvent la définir ou la vérifier.
-- ----------------------------------------------------------------------------

drop policy if exists "Lecture utilisateurs connectés" on public.parametres_generaux;
create policy "Lecture utilisateurs connectés (hors secrets)"
  on public.parametres_generaux for select to authenticated
  using (cle <> 'second_mot_de_passe_hash');

drop policy if exists "Écriture utilisateurs connectés" on public.parametres_generaux;
create policy "Écriture utilisateurs connectés (hors secrets)"
  on public.parametres_generaux for insert to authenticated
  with check (cle <> 'second_mot_de_passe_hash');

drop policy if exists "Modification utilisateurs connectés" on public.parametres_generaux;
create policy "Modification utilisateurs connectés (hors secrets)"
  on public.parametres_generaux for update to authenticated
  using (cle <> 'second_mot_de_passe_hash')
  with check (cle <> 'second_mot_de_passe_hash');

drop policy if exists "Suppression utilisateurs connectés" on public.parametres_generaux;
create policy "Suppression utilisateurs connectés (hors secrets)"
  on public.parametres_generaux for delete to authenticated
  using (cle <> 'second_mot_de_passe_hash');

create function public.verifier_second_mot_de_passe(p_mdp text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_hash text;
begin
  select valeur #>> '{}' into v_hash
  from public.parametres_generaux where cle = 'second_mot_de_passe_hash';

  if v_hash is null then
    return false;
  end if;

  return v_hash = crypt(p_mdp, v_hash);
end;
$$;

create function public.second_mot_de_passe_est_defini()
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.parametres_generaux where cle = 'second_mot_de_passe_hash'
  );
$$;

create function public.definir_second_mot_de_passe(p_nouveau text, p_ancien text default null)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_hash text;
begin
  select valeur #>> '{}' into v_hash
  from public.parametres_generaux where cle = 'second_mot_de_passe_hash';

  if v_hash is not null then
    if p_ancien is null or crypt(p_ancien, v_hash) <> v_hash then
      raise exception 'Ancien mot de passe incorrect.';
    end if;
  end if;

  if length(p_nouveau) < 4 then
    raise exception 'Le nouveau mot de passe doit contenir au moins 4 caractères.';
  end if;

  insert into public.parametres_generaux (cle, valeur)
  values ('second_mot_de_passe_hash', to_jsonb(crypt(p_nouveau, gen_salt('bf'))))
  on conflict (cle) do update
    set valeur = excluded.valeur, updated_at = now();

  return true;
end;
$$;

grant execute on function public.verifier_second_mot_de_passe(text) to authenticated;
grant execute on function public.second_mot_de_passe_est_defini() to authenticated;
grant execute on function public.definir_second_mot_de_passe(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- HISTORIQUE AUTOMATIQUE — modification des prix d'un article
-- (scénario de test n°5 du cahier des charges, section 100)
-- ----------------------------------------------------------------------------
create function public.log_historique_article()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.prix_vente_conseille is distinct from old.prix_vente_conseille then
    insert into public.historique (
      utilisateur_id, action, table_cible, enregistrement_id,
      ancienne_valeur, nouvelle_valeur, description
    ) values (
      auth.uid(), 'modification', 'articles', new.id,
      to_jsonb(old.prix_vente_conseille), to_jsonb(new.prix_vente_conseille),
      'Prix de vente conseillé modifié pour "' || new.designation || '"'
    );
  end if;

  if new.prix_achat is distinct from old.prix_achat then
    insert into public.historique (
      utilisateur_id, action, table_cible, enregistrement_id,
      ancienne_valeur, nouvelle_valeur, description
    ) values (
      auth.uid(), 'modification', 'articles', new.id,
      to_jsonb(old.prix_achat), to_jsonb(new.prix_achat),
      'Prix d''achat modifié pour "' || new.designation || '"'
    );
  end if;

  return new;
end;
$$;

create trigger trg_log_historique_article
  after update on public.articles
  for each row execute function public.log_historique_article();

-- ----------------------------------------------------------------------------
-- ANNULATION D'UNE VENTE (sections 75-77)
-- Une vente en brouillon s'annule sans impact. Une vente déjà validée
-- restitue le stock vendu et journalise l'action. Protégée par le second
-- mot de passe pour toute vente déjà validée (opération sensible).
-- ----------------------------------------------------------------------------
create function public.annuler_vente(
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
      insert into public.stocks (article_id, emplacement_id, quantite)
      values (v_ligne.article_id, v_ligne.emplacement_id, v_ligne.quantite)
      on conflict (article_id, emplacement_id)
      do update set quantite = public.stocks.quantite + v_ligne.quantite;

      insert into public.mouvements_stock (
        article_id, emplacement_id, type, quantite,
        document_type, document_id, reference_document, observation, created_by
      ) values (
        v_ligne.article_id, v_ligne.emplacement_id, 'autre_entree', v_ligne.quantite,
        'annulation_vente', p_vente_id, v_vente.reference,
        'Stock restitué suite annulation de la vente', p_utilisateur_id
      );
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

-- ----------------------------------------------------------------------------
-- ANNULATION D'UN ACHAT (sections 75-77)
-- Un achat en brouillon s'annule sans impact. Un achat déjà reçu retire du
-- stock les quantités reçues — refusé si le stock a depuis été consommé
-- ailleurs (contrôle atomique, comme pour les transferts et ventes).
-- ----------------------------------------------------------------------------
create function public.annuler_achat(
  p_achat_id uuid,
  p_second_mdp text,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_achat record;
  v_ligne record;
  v_stock_actuel numeric;
  v_designation text;
begin
  select * into v_achat from public.achats where id = p_achat_id for update;

  if v_achat is null then
    raise exception 'Achat introuvable.';
  end if;

  if v_achat.statut = 'Annulé' then
    raise exception 'Cet achat est déjà annulé.';
  end if;

  if v_achat.statut <> 'Brouillon' then
    if p_second_mdp is null or not public.verifier_second_mot_de_passe(p_second_mdp) then
      raise exception 'Mot de passe de sécurité incorrect.';
    end if;

    for v_ligne in
      select * from public.lignes_achats where achat_id = p_achat_id and recu = true
    loop
      select quantite into v_stock_actuel
      from public.stocks
      where article_id = v_ligne.article_id and emplacement_id = v_ligne.emplacement_destination_id
      for update;

      if v_stock_actuel is null or v_stock_actuel < v_ligne.quantite then
        select designation into v_designation from public.articles where id = v_ligne.article_id;
        raise exception 'Impossible d''annuler : le stock de "%" a déjà été utilisé ailleurs.', v_designation;
      end if;

      update public.stocks
      set quantite = quantite - v_ligne.quantite
      where article_id = v_ligne.article_id and emplacement_id = v_ligne.emplacement_destination_id;

      insert into public.mouvements_stock (
        article_id, emplacement_id, type, quantite,
        document_type, document_id, reference_document, observation, created_by
      ) values (
        v_ligne.article_id, v_ligne.emplacement_destination_id, 'autre_sortie', -v_ligne.quantite,
        'annulation_achat', p_achat_id, v_achat.reference,
        'Stock retiré suite annulation de l''achat', p_utilisateur_id
      );
    end loop;

    insert into public.historique (
      utilisateur_id, action, table_cible, enregistrement_id, description
    ) values (
      p_utilisateur_id, 'annulation', 'achats', p_achat_id,
      'Annulation de l''achat ' || v_achat.reference
    );
  end if;

  update public.achats set statut = 'Annulé' where id = p_achat_id;
end;
$$;

grant execute on function public.annuler_achat(uuid, text, uuid) to authenticated;
