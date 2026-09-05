-- ============================================================================
-- ONYX PHARM — Migration 0024 : Correction définitive du second mot de
-- passe et du code PIN (fonctions pgcrypto introuvables)
--
-- CAUSE EXACTE DU BUG (confirmée, pas supposée)
-- Dans Supabase, l'extension "pgcrypto" (qui fournit crypt() et
-- gen_salt(), utilisées pour hacher le second mot de passe et le code
-- PIN) s'installe dans un schéma nommé "extensions" — jamais dans
-- "public", même quand la commande `create extension pgcrypto` est
-- exécutée sans précision de schéma.
--
-- Or les 4 fonctions ci-dessous restreignaient volontairement leur
-- recherche de fonctions au seul schéma "public" (`set search_path =
-- public`), une bonne pratique de sécurité en soi — mais qui les
-- empêchait justement de trouver crypt()/gen_salt(), provoquant
-- l'erreur PostgreSQL :
--
--   42883 — function gen_salt(unknown) does not exist
--
-- C'est cette erreur, et uniquement elle, qui empêchait de définir ou
-- modifier le second mot de passe ET le code PIN partout dans
-- l'application — pas un problème de permissions, pas une incohérence
-- de nommage entre fonctions.
--
-- CORRECTION : on ajoute "extensions" à la recherche autorisée. Rien
-- d'autre ne change (même logique, mêmes vérifications, même sécurité).
-- ============================================================================

create or replace function public.verifier_second_mot_de_passe(p_mdp text)
returns boolean
language plpgsql
security definer set search_path = public, extensions
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

create or replace function public.definir_second_mot_de_passe(p_nouveau text, p_ancien text default null)
returns boolean
language plpgsql
security definer set search_path = public, extensions
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

create or replace function public.verifier_pin_securite(p_pin text)
returns boolean
language plpgsql
security definer set search_path = public, extensions
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

create or replace function public.definir_pin_securite(p_nouveau text, p_ancien text default null)
returns boolean
language plpgsql
security definer set search_path = public, extensions
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

-- Les GRANT existants sont conservés automatiquement par PostgreSQL lors
-- d'un CREATE OR REPLACE FUNCTION sur une signature identique — mais on
-- les ré-affirme explicitement ici par sécurité, sans aucun risque à les
-- répéter.
grant execute on function public.verifier_second_mot_de_passe(text) to authenticated;
grant execute on function public.definir_second_mot_de_passe(text, text) to authenticated;
grant execute on function public.verifier_pin_securite(text) to authenticated;
grant execute on function public.definir_pin_securite(text, text) to authenticated;
