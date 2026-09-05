-- ============================================================================
-- ONYX PHARM — Migration 0019 : Code PIN de sécurité, cohérence
-- paiement ↔ caisse (pour permettre la modification/suppression des
-- paiements et retours sans jamais désynchroniser la caisse)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) CODE PIN À 4 CHIFFRES — protège les suppressions de données
-- sensibles (paiements, retours...). Distinct du second mot de passe.
-- Stocké uniquement sous forme de hachage, comme le second mot de passe.
-- ----------------------------------------------------------------------------
drop policy if exists "Lecture utilisateurs connectés (hors secrets)" on public.parametres_generaux;
create policy "Lecture utilisateurs connectés (hors secrets)"
  on public.parametres_generaux for select to authenticated
  using (cle not in ('second_mot_de_passe_hash', 'pin_securite_hash'));

drop policy if exists "Écriture utilisateurs connectés (hors secrets)" on public.parametres_generaux;
create policy "Écriture utilisateurs connectés (hors secrets)"
  on public.parametres_generaux for insert to authenticated
  with check (cle not in ('second_mot_de_passe_hash', 'pin_securite_hash'));

drop policy if exists "Modification utilisateurs connectés (hors secrets)" on public.parametres_generaux;
create policy "Modification utilisateurs connectés (hors secrets)"
  on public.parametres_generaux for update to authenticated
  using (cle not in ('second_mot_de_passe_hash', 'pin_securite_hash'))
  with check (cle not in ('second_mot_de_passe_hash', 'pin_securite_hash'));

drop policy if exists "Suppression utilisateurs connectés (hors secrets)" on public.parametres_generaux;
create policy "Suppression utilisateurs connectés (hors secrets)"
  on public.parametres_generaux for delete to authenticated
  using (cle not in ('second_mot_de_passe_hash', 'pin_securite_hash'));

create function public.verifier_pin_securite(p_pin text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_hash text;
begin
  select valeur #>> '{}' into v_hash
  from public.parametres_generaux where cle = 'pin_securite_hash';

  if v_hash is null then
    return false;
  end if;

  return v_hash = crypt(p_pin, v_hash);
end;
$$;

create function public.pin_securite_est_defini()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.parametres_generaux where cle = 'pin_securite_hash');
$$;

create function public.definir_pin_securite(p_nouveau text, p_ancien text default null)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_hash text;
begin
  if p_nouveau !~ '^[0-9]{4}$' then
    raise exception 'Le code doit contenir exactement 4 chiffres.';
  end if;

  select valeur #>> '{}' into v_hash
  from public.parametres_generaux where cle = 'pin_securite_hash';

  if v_hash is not null then
    if p_ancien is null or crypt(p_ancien, v_hash) <> v_hash then
      raise exception 'Ancien code incorrect.';
    end if;
  end if;

  insert into public.parametres_generaux (cle, valeur)
  values ('pin_securite_hash', to_jsonb(crypt(p_nouveau, gen_salt('bf'))))
  on conflict (cle) do update set valeur = excluded.valeur, updated_at = now();

  return true;
end;
$$;

grant execute on function public.verifier_pin_securite(text) to authenticated;
grant execute on function public.pin_securite_est_defini() to authenticated;
grant execute on function public.definir_pin_securite(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) LIAISON DIRECTE PAIEMENT ↔ CAISSE
-- Jusqu'ici, un paiement créait un encaissement/décaissement automatique,
-- mais rien ne les reliait explicitement : supprimer un paiement laissait
-- l'écriture de caisse orpheline. Cette liaison directe (avec suppression
-- en cascade) garantit qu'une modification ou suppression de paiement se
-- répercute toujours correctement en caisse, pour tout le monde,
-- immédiatement.
-- ----------------------------------------------------------------------------
alter table public.encaissements add column if not exists paiement_vente_id uuid
  references public.paiements_ventes(id) on delete cascade;
alter table public.decaissements add column if not exists paiement_conteneur_id uuid
  references public.paiements_conteneurs(id) on delete cascade;

create or replace function public.synchroniser_encaissement_vente()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_vente record;
  v_reference text;
begin
  select * into v_vente from public.ventes where id = new.vente_id;
  v_reference := public.generer_numero_document('ENC');

  insert into public.encaissements (
    reference, date_operation, montant, mode_paiement,
    client_id, vente_id, paiement_vente_id, categorie, description, created_by
  ) values (
    v_reference, new.date_paiement, new.montant, new.mode_paiement,
    v_vente.client_id, new.vente_id, new.id, 'Vente',
    'Paiement vente ' || coalesce(v_vente.reference, ''), new.created_by
  );

  return new;
end;
$$;

create or replace function public.synchroniser_decaissement_conteneur()
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
    fournisseur_id, conteneur_id, paiement_conteneur_id, categorie, description, created_by
  ) values (
    v_reference, new.date_paiement, new.montant, new.mode_paiement,
    v_conteneur.fournisseur_id, new.conteneur_id, new.id, 'Achat',
    'Paiement conteneur ' || coalesce(v_conteneur.code, ''), new.created_by
  );

  return new;
end;
$$;

-- Si le montant ou la date d'un paiement est modifié, l'écriture de
-- caisse correspondante est mise à jour à l'identique.
create function public.synchroniser_modification_paiement_vente()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.encaissements
  set montant = new.montant, mode_paiement = new.mode_paiement, date_operation = new.date_paiement
  where paiement_vente_id = new.id;
  return new;
end;
$$;

create trigger trg_synchroniser_modification_paiement_vente
  after update on public.paiements_ventes
  for each row execute function public.synchroniser_modification_paiement_vente();

create function public.synchroniser_modification_paiement_conteneur()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.decaissements
  set montant = new.montant, mode_paiement = new.mode_paiement, date_operation = new.date_paiement
  where paiement_conteneur_id = new.id;
  return new;
end;
$$;

create trigger trg_synchroniser_modification_paiement_conteneur
  after update on public.paiements_conteneurs
  for each row execute function public.synchroniser_modification_paiement_conteneur();

-- ----------------------------------------------------------------------------
-- 3) SUPPRESSION D'UNE VENTE EN BROUILLON
-- Une vente encore en brouillon n'a jamais touché le stock ni la caisse :
-- elle peut être librement modifiée ou supprimée. Cette fonction sécurise
-- la suppression (ne s'applique jamais à une vente déjà validée).
-- ----------------------------------------------------------------------------
create function public.supprimer_vente_brouillon(p_vente_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_statut text;
begin
  select statut into v_statut from public.ventes where id = p_vente_id for update;

  if v_statut is null then
    raise exception 'Vente introuvable.';
  end if;

  if v_statut <> 'Brouillon' then
    raise exception 'Seule une vente en brouillon peut être supprimée directement.';
  end if;

  delete from public.ventes where id = p_vente_id;
end;
$$;

grant execute on function public.supprimer_vente_brouillon(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) SUPPRESSION D'UN RETOUR CLIENT (avec réversion du stock)
-- Protégée par le code PIN côté application. Refuse si le stock restitué
-- a déjà été consommé ailleurs depuis.
-- ----------------------------------------------------------------------------
create function public.supprimer_retour_client(p_retour_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_retour record;
  v_stock_actuel numeric;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_retour from public.retours_clients where id = p_retour_id for update;
  if v_retour is null then
    raise exception 'Retour introuvable.';
  end if;

  perform 1 from public.stocks
  where article_id = v_retour.article_id and emplacement_id = v_retour.emplacement_id
  for update;

  select coalesce(sum(quantite), 0) into v_stock_actuel
  from public.stocks
  where article_id = v_retour.article_id and emplacement_id = v_retour.emplacement_id;

  if v_stock_actuel < v_retour.quantite then
    raise exception 'Impossible de supprimer : le stock restitué a déjà été utilisé ailleurs.';
  end if;

  perform * from public.consommer_stock_fifo(
    v_retour.article_id, v_retour.emplacement_id, v_retour.quantite, null
  );

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, document_id, reference_document, observation
  ) values (
    v_retour.article_id, v_retour.emplacement_id, 'autre_sortie', -v_retour.quantite,
    'suppression_retour_client', p_retour_id, v_retour.reference,
    'Annulation du retour client (suppression)'
  );

  delete from public.retours_clients where id = p_retour_id;
end;
$$;

grant execute on function public.supprimer_retour_client(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) SUPPRESSION D'UN PAIEMENT (vente ou conteneur) — protégée par PIN
-- côté application ; la cascade FK (section 2) nettoie automatiquement
-- l'écriture de caisse correspondante.
-- ----------------------------------------------------------------------------
create function public.supprimer_paiement_vente(p_paiement_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;
  delete from public.paiements_ventes where id = p_paiement_id;
end;
$$;

create function public.supprimer_paiement_conteneur(p_paiement_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;
  delete from public.paiements_conteneurs where id = p_paiement_id;
end;
$$;

grant execute on function public.supprimer_paiement_vente(uuid, text) to authenticated;
grant execute on function public.supprimer_paiement_conteneur(uuid, text) to authenticated;
