-- ============================================================================
-- ONYX PHARM — 0045 : Multi-entreprises dans une base Supabase partagée
-- Chaque entreprise utilise les mêmes tables et fonctionnalités, mais ses
-- données sont isolées par entreprise_id et par les politiques RLS.
-- ============================================================================

create table if not exists public.entreprises (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  code_invitation text not null unique,
  is_default boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint entreprises_nom_non_vide check (length(trim(nom)) > 0),
  constraint entreprises_code_format check (code_invitation ~ '^[A-Z0-9-]{6,20}$')
);

create unique index if not exists idx_entreprises_single_default
  on public.entreprises (is_default) where is_default = true;

-- L'entreprise historique est conservée comme espace par défaut.
do $$
begin
  if not exists (select 1 from public.entreprises where is_default = true) then
    insert into public.entreprises (nom, code_invitation, is_default)
    values (
      'ONYX PHARM SARL',
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
      true
    );
  end if;
end;
$$;

alter table public.profiles
  add column if not exists entreprise_id uuid references public.entreprises(id);

update public.profiles
set entreprise_id = (select id from public.entreprises where is_default = true limit 1)
where entreprise_id is null;

alter table public.profiles alter column entreprise_id set not null;
create index if not exists idx_profiles_entreprise_id on public.profiles(entreprise_id);

-- Retourne uniquement l'entreprise de la session authentifiée. Le paramètre
-- local est utilisé uniquement par le trigger de création d'utilisateur,
-- lorsque Supabase Auth n'a pas encore établi de JWT utilisateur.
create or replace function public.current_entreprise_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_entreprise_id uuid;
  v_uid uuid := auth.uid();
  v_context text;
begin
  if v_uid is not null then
    select p.entreprise_id into v_entreprise_id
    from public.profiles p
    where p.id = v_uid;
    return v_entreprise_id;
  end if;

  v_context := nullif(current_setting('app.entreprise_id', true), '');
  if v_context is not null then
    return v_context::uuid;
  end if;
  return null;
end;
$$;
revoke all on function public.current_entreprise_id() from public, anon;
grant execute on function public.current_entreprise_id() to authenticated;

-- Ajoute le rattachement à toutes les tables métier. Les données actuelles
-- sont conservées et rattachées à l'entreprise historique.
do $$
declare
  t text;
  tables text[] := array[
    'emplacements','categories','sous_categories','fournisseurs','clients',
    'parametres_options','parametres_generaux','articles','stocks',
    'mouvements_stock','transferts','inventaires','inventaire_lignes',
    'achats','lignes_achats','paiements_achats','ventes','lignes_ventes',
    'paiements_ventes','devis','lignes_devis','retours_clients',
    'retours_fournisseurs','encaissements','decaissements','historique',
    'numero_sequences','conteneurs','paiements_conteneurs',
    'lignes_ventes_conteneurs'
  ];
  v_default_id uuid;
begin
  select id into v_default_id from public.entreprises where is_default = true limit 1;
  foreach t in array tables loop
    execute format('alter table public.%I add column if not exists entreprise_id uuid references public.entreprises(id)', t);
    execute format('update public.%I set entreprise_id = $1 where entreprise_id is null', t) using v_default_id;
    execute format('alter table public.%I alter column entreprise_id set default public.current_entreprise_id()', t);
    execute format('alter table public.%I alter column entreprise_id set not null', t);
    execute format('create index if not exists %I on public.%I (entreprise_id)', 'idx_' || t || '_entreprise_id', t);
  end loop;
end;
$$;

-- Les clés qui étaient globales deviennent propres à une entreprise.
-- Les clés primaires techniques (UUID) restent inchangées.
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as table_name, c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and c.contype = 'u'
      and t.relname = any(array[
        'emplacements','categories','sous_categories','parametres_options',
        'achats','ventes','devis','transferts','inventaires','retours_clients',
        'retours_fournisseurs','encaissements','decaissements','conteneurs'
      ])
  loop
    execute format('alter table %s drop constraint %I', r.table_name, r.conname);
  end loop;
end;
$$;

alter table public.parametres_generaux drop constraint if exists parametres_generaux_pkey;
alter table public.parametres_generaux
  add constraint parametres_generaux_pkey primary key (entreprise_id, cle);

alter table public.numero_sequences drop constraint if exists numero_sequences_pkey;
alter table public.numero_sequences
  add constraint numero_sequences_pkey primary key (entreprise_id, prefixe, annee);

alter table public.emplacements add constraint emplacements_entreprise_nom_key unique (entreprise_id, nom);
alter table public.categories add constraint categories_entreprise_nom_key unique (entreprise_id, nom);
alter table public.sous_categories add constraint sous_categories_entreprise_categorie_nom_key unique (entreprise_id, categorie_id, nom);
alter table public.parametres_options add constraint parametres_options_entreprise_groupe_valeur_key unique (entreprise_id, groupe, valeur);
alter table public.achats add constraint achats_entreprise_reference_key unique (entreprise_id, reference);
alter table public.ventes add constraint ventes_entreprise_reference_key unique (entreprise_id, reference);
alter table public.devis add constraint devis_entreprise_reference_key unique (entreprise_id, reference);
alter table public.transferts add constraint transferts_entreprise_reference_key unique (entreprise_id, reference);
alter table public.inventaires add constraint inventaires_entreprise_reference_key unique (entreprise_id, reference);
alter table public.retours_clients add constraint retours_clients_entreprise_reference_key unique (entreprise_id, reference);
alter table public.retours_fournisseurs add constraint retours_fournisseurs_entreprise_reference_key unique (entreprise_id, reference);
alter table public.encaissements add constraint encaissements_entreprise_reference_key unique (entreprise_id, reference);
alter table public.decaissements add constraint decaissements_entreprise_reference_key unique (entreprise_id, reference);
alter table public.conteneurs add constraint conteneurs_entreprise_code_key unique (entreprise_id, code);

-- Les numéros de documents recommencent indépendamment pour chaque entreprise.
create or replace function public.generer_numero_document(p_prefixe text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entreprise_id uuid := public.current_entreprise_id();
  v_annee integer := extract(year from now());
  v_numero integer;
begin
  if v_entreprise_id is null then
    raise exception 'Aucune entreprise n''est associée à cette session.';
  end if;

  insert into public.numero_sequences (entreprise_id, prefixe, annee, dernier_numero)
  values (v_entreprise_id, p_prefixe, v_annee, 1)
  on conflict (entreprise_id, prefixe, annee)
  do update set dernier_numero = public.numero_sequences.dernier_numero + 1
  returning dernier_numero into v_numero;

  return p_prefixe || '-' || v_annee || '-' || lpad(v_numero::text, 5, '0');
end;
$$;

-- Toute insertion reçoit l'entreprise de la session. Un client ne peut pas
-- forcer l'entreprise_id d'une autre entreprise ni déplacer une ligne existante.
create or replace function public.guard_entreprise_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entreprise_id uuid := public.current_entreprise_id();
  v_field text;
  v_user_id uuid;
  v_user_entreprise_id uuid;
  v_ref record;
  v_ref_id uuid;
  v_ref_entreprise_id uuid;
begin
  if v_entreprise_id is null then
    raise exception 'Session non rattachée à une entreprise.';
  end if;

  if tg_op = 'INSERT' then
    if new.entreprise_id is not null and new.entreprise_id <> v_entreprise_id then
      raise exception 'Impossible d''écrire dans une autre entreprise.';
    end if;
    new.entreprise_id := v_entreprise_id;
  else
    if old.entreprise_id <> v_entreprise_id then
      raise exception 'Accès interdit aux données d''une autre entreprise.';
    end if;
    if new.entreprise_id <> old.entreprise_id or new.entreprise_id <> v_entreprise_id then
      raise exception 'Le rattachement d''une donnée à une entreprise ne peut pas être modifié.';
    end if;
  end if;

  -- Les identifiants de créateur / utilisateur doivent aussi appartenir au
  -- même espace : l'UUID d'un compte extérieur ne peut pas être injecté.
  foreach v_field in array array['created_by', 'utilisateur_id', 'valide_by'] loop
    v_user_id := nullif(to_jsonb(new)->>v_field, '')::uuid;
    if v_user_id is not null then
      select p.entreprise_id into v_user_entreprise_id
      from public.profiles p where p.id = v_user_id;
      if v_user_entreprise_id is distinct from v_entreprise_id then
        raise exception 'Le compte indiqué dans % n''appartient pas à cette entreprise.', v_field;
      end if;
    end if;
  end loop;

  -- Vérifie les principales relations métier afin qu'une ligne d'une
  -- entreprise ne référence jamais un client, article, stock ou document
  -- appartenant à une autre entreprise.
  for v_ref in
    select refs.source_column, refs.target_table
    from (values
      ('articles','categorie_id','categories'),
      ('articles','sous_categorie_id','sous_categories'),
      ('articles','fournisseur_id','fournisseurs'),
      ('sous_categories','categorie_id','categories'),
      ('stocks','article_id','articles'),
      ('stocks','emplacement_id','emplacements'),
      ('stocks','conteneur_id','conteneurs'),
      ('mouvements_stock','article_id','articles'),
      ('mouvements_stock','emplacement_id','emplacements'),
      ('transferts','article_id','articles'),
      ('transferts','emplacement_source_id','emplacements'),
      ('transferts','emplacement_destination_id','emplacements'),
      ('inventaires','emplacement_id','emplacements'),
      ('inventaire_lignes','inventaire_id','inventaires'),
      ('inventaire_lignes','article_id','articles'),
      ('achats','fournisseur_id','fournisseurs'),
      ('lignes_achats','achat_id','achats'),
      ('lignes_achats','article_id','articles'),
      ('lignes_achats','emplacement_destination_id','emplacements'),
      ('paiements_achats','achat_id','achats'),
      ('ventes','client_id','clients'),
      ('lignes_ventes','vente_id','ventes'),
      ('lignes_ventes','article_id','articles'),
      ('lignes_ventes','emplacement_id','emplacements'),
      ('lignes_ventes','conteneur_id','conteneurs'),
      ('paiements_ventes','vente_id','ventes'),
      ('devis','client_id','clients'),
      ('lignes_devis','devis_id','devis'),
      ('lignes_devis','article_id','articles'),
      ('retours_clients','vente_id','ventes'),
      ('retours_clients','article_id','articles'),
      ('retours_clients','emplacement_id','emplacements'),
      ('retours_fournisseurs','achat_id','achats'),
      ('retours_fournisseurs','article_id','articles'),
      ('retours_fournisseurs','emplacement_id','emplacements'),
      ('encaissements','client_id','clients'),
      ('encaissements','vente_id','ventes'),
      ('decaissements','fournisseur_id','fournisseurs'),
      ('decaissements','achat_id','achats'),
      ('decaissements','conteneur_id','conteneurs'),
      ('conteneurs','fournisseur_id','fournisseurs'),
      ('paiements_conteneurs','conteneur_id','conteneurs'),
      ('lignes_ventes_conteneurs','ligne_vente_id','lignes_ventes'),
      ('lignes_ventes_conteneurs','conteneur_id','conteneurs')
    ) as refs(source_table, source_column, target_table)
    where refs.source_table = tg_table_name
  loop
    v_ref_id := nullif(to_jsonb(new)->>v_ref.source_column, '')::uuid;
    if v_ref_id is not null then
      execute format('select entreprise_id from public.%I where id = $1', v_ref.target_table)
        into v_ref_entreprise_id using v_ref_id;
      if v_ref_entreprise_id is distinct from v_entreprise_id then
        raise exception 'La référence % doit appartenir à la même entreprise.', v_ref.source_column;
      end if;
    end if;
  end loop;

  return new;
end;
$$;

-- Pose les triggers après la migration des anciennes lignes.
do $$
declare
  t text;
  tables text[] := array[
    'emplacements','categories','sous_categories','fournisseurs','clients',
    'parametres_options','parametres_generaux','articles','stocks',
    'mouvements_stock','transferts','inventaires','inventaire_lignes',
    'achats','lignes_achats','paiements_achats','ventes','lignes_ventes',
    'paiements_ventes','devis','lignes_devis','retours_clients',
    'retours_fournisseurs','encaissements','decaissements','historique',
    'numero_sequences','conteneurs','paiements_conteneurs',
    'lignes_ventes_conteneurs'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_guard_entreprise_row on public.%I', t);
    execute format('create trigger trg_guard_entreprise_row before insert or update on public.%I for each row execute function public.guard_entreprise_row()', t);
  end loop;
end;
$$;

-- Isolation RLS sur toutes les tables métier. Les anciennes politiques
-- permissives (using true) sont supprimées avant de créer les nouvelles.
do $$
declare
  t text;
  p record;
  tables text[] := array[
    'emplacements','categories','sous_categories','fournisseurs','clients',
    'parametres_options','parametres_generaux','articles','stocks',
    'mouvements_stock','transferts','inventaires','inventaire_lignes',
    'achats','lignes_achats','paiements_achats','ventes','lignes_ventes',
    'paiements_ventes','devis','lignes_devis','retours_clients',
    'retours_fournisseurs','encaissements','decaissements','historique',
    'numero_sequences','conteneurs','paiements_conteneurs',
    'lignes_ventes_conteneurs'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy tenant_select on public.%I for select to authenticated using (entreprise_id = public.current_entreprise_id())', t);
    execute format('create policy tenant_insert on public.%I for insert to authenticated with check (entreprise_id = public.current_entreprise_id())', t);
    execute format('create policy tenant_update on public.%I for update to authenticated using (entreprise_id = public.current_entreprise_id()) with check (entreprise_id = public.current_entreprise_id())', t);
    execute format('create policy tenant_delete on public.%I for delete to authenticated using (entreprise_id = public.current_entreprise_id())', t);
  end loop;
end;
$$;

-- Les profils sont visibles uniquement au sein de la même entreprise. Un
-- utilisateur ne peut modifier que son propre profil, sans changer son tenant.
alter table public.profiles enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='profiles' loop
    execute format('drop policy %I on public.profiles', p.policyname);
  end loop;
end;
$$;
create policy profiles_select_company on public.profiles
  for select to authenticated using (entreprise_id = public.current_entreprise_id());
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid() and entreprise_id = public.current_entreprise_id())
  with check (id = auth.uid() and entreprise_id = public.current_entreprise_id());

-- Les membres peuvent lire uniquement les informations de leur propre entreprise
-- (dont le code permettant d'inviter un collègue). La création passe par Auth.
alter table public.entreprises enable row level security;
drop policy if exists entreprises_select_membre on public.entreprises;
create policy entreprises_select_membre on public.entreprises
  for select to authenticated using (id = public.current_entreprise_id());
revoke insert, update, delete, truncate, references, trigger on public.entreprises from anon, authenticated;
grant select on public.entreprises to authenticated;

-- Les utilisateurs doivent disposer des droits nécessaires aux opérations sous
-- RLS, pas d'un SECURITY DEFINER qui contournerait l'isolation. Les fonctions
-- trigger restent SECURITY DEFINER pour l'audit et la synchronisation interne.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type rt on rt.oid = p.prorettype
    where n.nspname = 'public'
      and p.prosecdef = true
      and rt.typname <> 'trigger'
      and p.proname <> 'current_entreprise_id'
  loop
    execute format('alter function %s security invoker', r.signature);
  end loop;
end;
$$;

-- Les vues SQL ne doivent pas contourner les politiques RLS des tables qu'elles
-- consultent. security_invoker est disponible dans PostgreSQL 15+ (Supabase).
do $$
declare v text;
  views text[] := array[
    'v_stock_total','v_creances_clients','v_dettes_fournisseurs',
    'v_dettes_conteneurs','v_cout_revient_conteneurs','v_cout_revient_articles'
  ];
begin
  if current_setting('server_version_num')::integer >= 150000 then
    foreach v in array views loop
      if to_regclass('public.' || v) is not null then
        execute format('alter view public.%I set (security_invoker = true)', v);
      end if;
    end loop;
  end if;
end;
$$;

-- À chaque inscription : soit une nouvelle entreprise, soit une entreprise
-- existante via un code d'invitation. L'utilisateur ne choisit jamais le tenant
-- en envoyant directement un UUID.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_mode text := coalesce(new.raw_user_meta_data->>'entreprise_mode', 'creer');
  v_nom text := nullif(trim(new.raw_user_meta_data->>'entreprise_nom'), '');
  v_code text := upper(regexp_replace(coalesce(new.raw_user_meta_data->>'code_invitation', ''), '\s+', '', 'g'));
  v_entreprise_id uuid;
  v_default_id uuid;
  v_code_genere text;
begin
  if v_mode = 'rejoindre' then
    if v_code = '' then
      raise exception 'Saisissez le code d''invitation de votre entreprise.';
    end if;
    select id into v_entreprise_id from public.entreprises where code_invitation = v_code;
    if v_entreprise_id is null then
      raise exception 'Code d''invitation invalide.';
    end if;
  else
    if v_nom is null or length(v_nom) < 2 then
      raise exception 'Le nom de l''entreprise doit contenir au moins 2 caractères.';
    end if;
    v_code_genere := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    insert into public.entreprises (nom, code_invitation, created_by)
    values (v_nom, v_code_genere, new.id)
    returning id into v_entreprise_id;
  end if;

  insert into public.profiles (id, email, entreprise_id)
  values (new.id, new.email, v_entreprise_id);

  -- Initialise les paramètres de l'entreprise nouvellement créée à partir des
  -- réglages par défaut, en remplaçant le nom ONYX par celui de l'entreprise.
  if v_mode <> 'rejoindre' then
    select id into v_default_id from public.entreprises where is_default = true limit 1;
    perform set_config('app.entreprise_id', v_entreprise_id::text, true);

    insert into public.parametres_options (entreprise_id, groupe, valeur, ordre, actif)
    select v_entreprise_id, groupe, valeur, ordre, actif
    from public.parametres_options where entreprise_id = v_default_id
    on conflict (entreprise_id, groupe, valeur) do nothing;

    -- Copier seulement les réglages génériques. Les coordonnées, paramètres
    -- d'entrepôt, date du site, PIN et solde initial ne doivent jamais être
    -- repris de l'entreprise ONYX dans un nouvel espace.
    insert into public.parametres_generaux (entreprise_id, cle, valeur, updated_at)
    select v_entreprise_id, cle, valeur, now()
    from public.parametres_generaux
    where entreprise_id = v_default_id
      and cle not in (
        'entreprise_info', 'entrepot_info', 'date_conception_site',
        'pin_securite_hash', 'second_mot_de_passe_hash', 'solde_caisse_initial'
      )
    on conflict (entreprise_id, cle) do nothing;

    insert into public.parametres_generaux (entreprise_id, cle, valeur, updated_at)
    values
      (v_entreprise_id, 'entreprise_info', jsonb_build_object(
        'nom', v_nom, 'activite', '', 'telephone', '', 'email', '',
        'logo_url', '', 'adresse_postale', '', 'adresse_physique', '', 'fax', ''
      ), now()),
      (v_entreprise_id, 'entrepot_info', jsonb_build_object(
        'nom', '', 'adresse', '', 'telephone', '', 'responsable', '',
        'horaires', '', 'capacite', '', 'observations', ''
      ), now()),
      (v_entreprise_id, 'date_conception_site', to_jsonb(''::text), now()),
      (v_entreprise_id, 'solde_caisse_initial', to_jsonb('0'::text), now())
    on conflict (entreprise_id, cle) do nothing;

    insert into public.emplacements (entreprise_id, nom, actif)
    select v_entreprise_id, nom, actif
    from public.emplacements where entreprise_id = v_default_id
    on conflict (entreprise_id, nom) do nothing;

    with categories_nouvelles as (
      insert into public.categories (entreprise_id, nom, actif)
      select v_entreprise_id, nom, actif from public.categories where entreprise_id = v_default_id
      on conflict (entreprise_id, nom) do update set actif = excluded.actif
      returning id, nom
    )
    insert into public.sous_categories (entreprise_id, categorie_id, nom, actif)
    select v_entreprise_id, cn.id, sc.nom, sc.actif
    from public.sous_categories sc
    join public.categories ca on ca.id = sc.categorie_id and ca.entreprise_id = v_default_id
    join categories_nouvelles cn on cn.nom = ca.nom
    on conflict (entreprise_id, categorie_id, nom) do nothing;
  end if;

  return new;
end;
$$;

comment on table public.entreprises is
  'Répertoire multi-entreprises. Les données métier sont isolées par entreprise_id et RLS.';
comment on column public.profiles.entreprise_id is
  'Entreprise du compte. Modifiable uniquement par le flux sécurisé d’inscription / rattachement.';


-- Les paramètres confidentiels restent invisibles aux requêtes REST directes.
-- Le PIN de sécurité est géré uniquement par les fonctions ci-dessous, qui
-- sont SECURITY DEFINER mais toujours limitées à l'entreprise de la session.
drop policy if exists tenant_select on public.parametres_generaux;
drop policy if exists tenant_insert on public.parametres_generaux;
drop policy if exists tenant_update on public.parametres_generaux;
drop policy if exists tenant_delete on public.parametres_generaux;
create policy tenant_select on public.parametres_generaux
  for select to authenticated
  using (entreprise_id = public.current_entreprise_id()
    and cle not in ('second_mot_de_passe_hash', 'pin_securite_hash'));
create policy tenant_insert on public.parametres_generaux
  for insert to authenticated
  with check (entreprise_id = public.current_entreprise_id()
    and cle not in ('second_mot_de_passe_hash', 'pin_securite_hash'));
create policy tenant_update on public.parametres_generaux
  for update to authenticated
  using (entreprise_id = public.current_entreprise_id()
    and cle not in ('second_mot_de_passe_hash', 'pin_securite_hash'))
  with check (entreprise_id = public.current_entreprise_id()
    and cle not in ('second_mot_de_passe_hash', 'pin_securite_hash'));
create policy tenant_delete on public.parametres_generaux
  for delete to authenticated
  using (entreprise_id = public.current_entreprise_id()
    and cle not in ('second_mot_de_passe_hash', 'pin_securite_hash'));

create or replace function public.verifier_pin_securite(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_hash text;
begin
  select pg.valeur #>> '{}' into v_hash
  from public.parametres_generaux pg
  where pg.cle = 'pin_securite_hash'
    and pg.entreprise_id = public.current_entreprise_id();
  if v_hash is null then return false; end if;
  return v_hash = crypt(p_pin, v_hash);
end;
$$;

create or replace function public.pin_securite_est_defini()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.parametres_generaux pg
    where pg.cle = 'pin_securite_hash'
      and pg.entreprise_id = public.current_entreprise_id()
  );
$$;

create or replace function public.definir_pin_securite(p_nouveau text, p_ancien text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_hash text; v_entreprise_id uuid := public.current_entreprise_id();
begin
  if v_entreprise_id is null then raise exception 'Aucune entreprise n''est associée à cette session.'; end if;
  if p_nouveau !~ '^[0-9]{4}$' then raise exception 'Le code doit contenir exactement 4 chiffres.'; end if;
  select pg.valeur #>> '{}' into v_hash
  from public.parametres_generaux pg
  where pg.cle = 'pin_securite_hash' and pg.entreprise_id = v_entreprise_id;
  if v_hash is not null then
    if p_ancien is null or crypt(p_ancien, v_hash) <> v_hash then
      raise exception 'Ancien code incorrect.';
    end if;
  end if;
  insert into public.parametres_generaux (entreprise_id, cle, valeur)
  values (v_entreprise_id, 'pin_securite_hash', to_jsonb(crypt(p_nouveau, gen_salt('bf'))))
  on conflict (entreprise_id, cle) do update set valeur = excluded.valeur, updated_at = now();
  return true;
end;
$$;

grant execute on function public.verifier_pin_securite(text) to authenticated;
grant execute on function public.pin_securite_est_defini() to authenticated;
grant execute on function public.definir_pin_securite(text, text) to authenticated;

-- Stock Initial doit également exister séparément dans chaque entreprise.
-- L'ancienne version utilisait ON CONFLICT(code), devenu non valide après
-- passage à une unicité (entreprise_id, code).
create or replace function public.get_stock_initial_id()
returns uuid
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_entreprise_id uuid := public.current_entreprise_id();
  v_id uuid;
begin
  if v_entreprise_id is null then
    raise exception 'Aucune entreprise n''est associée à cette session.';
  end if;

  select c.id into v_id
  from public.conteneurs c
  where c.entreprise_id = v_entreprise_id and c.code = 'STOCK-INITIAL';

  if v_id is null then
    insert into public.conteneurs (
      entreprise_id, code, date_arrivee, montant_achat_global, statut, observation
    ) values (
      v_entreprise_id, 'STOCK-INITIAL', current_date, 0, 'Actif',
      'Conteneur technique regroupant le stock non rattaché à un conteneur précis.'
    )
    on conflict (entreprise_id, code) do nothing
    returning id into v_id;

    if v_id is null then
      select c.id into v_id
      from public.conteneurs c
      where c.entreprise_id = v_entreprise_id and c.code = 'STOCK-INITIAL';
    end if;
  end if;

  return v_id;
end;
$$;
grant execute on function public.get_stock_initial_id() to authenticated;

-- Si le nom commercial est modifié dans Paramètres > Général, maintient aussi
-- le nom du répertoire d'entreprises aligné pour l'affichage des membres.
create or replace function public.synchroniser_nom_entreprise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nom text;
begin
  if new.cle = 'entreprise_info' then
    v_nom := nullif(trim(new.valeur->>'nom'), '');
    if v_nom is not null then
      update public.entreprises
      set nom = v_nom
      where id = new.entreprise_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_synchroniser_nom_entreprise on public.parametres_generaux;
create trigger trg_synchroniser_nom_entreprise
after insert or update of valeur on public.parametres_generaux
for each row execute function public.synchroniser_nom_entreprise();
