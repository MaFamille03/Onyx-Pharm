-- ============================================================================
-- ONYX PHARM — Migration 0012 : Statut de compte, présentation initiale,
-- informations entreprise et entrepôt
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STATUT DE COMPTE & PRÉSENTATION INITIALE (sections 5 et 17-19 de la
-- consigne d'audit)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists compte_statut text not null default 'Actif'
    check (compte_statut in ('Actif', 'Désactivé', 'Supprimé')),
  add column if not exists presentation_vue boolean not null default false;

comment on column public.profiles.compte_statut is
  'Actif | Désactivé (a quitté l''entreprise, historique conservé) | Supprimé (anonymisé à la demande de l''utilisateur)';

-- Historise automatiquement tout changement de statut de compte, pour que
-- "Jean Kouassi — Compte désactivé" reste traçable dans l'historique global
-- même après désactivation (section 19 de la consigne).
create function public.log_historique_statut_compte()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.compte_statut is distinct from old.compte_statut then
    insert into public.historique (
      utilisateur_id, action, table_cible, enregistrement_id, description
    ) values (
      new.id, 'modification', 'profiles', new.id,
      'Statut du compte changé : ' || old.compte_statut || ' → ' || new.compte_statut
    );
  end if;
  return new;
end;
$$;

create trigger trg_log_historique_statut_compte
  after update on public.profiles
  for each row execute function public.log_historique_statut_compte();

-- ----------------------------------------------------------------------------
-- INFORMATIONS ENTREPRISE — reprises telles que fournies dans le catalogue
-- officiel ONYX PHARM (rien d'inventé : nom, contacts et activités
-- proviennent du document fourni).
-- ----------------------------------------------------------------------------
insert into public.parametres_generaux (cle, valeur)
values (
  'entreprise_info',
  '{
    "nom": "ONYX PHARM SARL",
    "activite": "Matériel Biomédical - Consommables, Instruments Chirurgicaux Dentaires et Orthopédiques, Mobilier - Fourniture de Bureau, Matériel Informatique",
    "telephone": "(225) 27 22 49 36 30 / 07 47 78 08 39",
    "email": "onyx.pharm@yahoo.fr",
    "logo_url": "/onyx-pharm-logo.png"
  }'::jsonb
)
on conflict (cle) do nothing;

-- ----------------------------------------------------------------------------
-- INFORMATIONS ENTREPÔT — structure prête, volontairement vide : les
-- informations réelles seront fournies ultérieurement (section 15/11 de la
-- consigne). Ne jamais y substituer des données inventées.
-- ----------------------------------------------------------------------------
insert into public.parametres_generaux (cle, valeur)
values (
  'entrepot_info',
  '{
    "nom": "",
    "adresse": "",
    "telephone": "",
    "responsable": "",
    "horaires": "",
    "capacite": "",
    "observations": ""
  }'::jsonb
)
on conflict (cle) do nothing;
