-- ============================================================================
-- ONYX PHARM — Migration 0022 : Modifier et supprimer un conteneur
--
-- "Modifier" : corrige les informations d'en-tête (code, fournisseur,
-- date, montant, observation) — jamais le stock ni les paiements déjà
-- enregistrés, qui suivent leurs propres écrans.
--
-- "Supprimer" : protégé par le code PIN. Refusé si le conteneur contient
-- encore du stock (pour ne jamais perdre la trace d'un article physique),
-- et refusé automatiquement par la base si des ventes ont déjà puisé
-- dedans (contrainte de clé étrangère). Le conteneur technique
-- "Stock Initial" ne peut jamais être supprimé.
-- ============================================================================

create function public.modifier_conteneur(
  p_conteneur_id uuid,
  p_code text,
  p_fournisseur_id uuid,
  p_date_arrivee date,
  p_montant_achat_global numeric,
  p_observation text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Le code du conteneur est obligatoire.';
  end if;

  update public.conteneurs
  set code = trim(p_code),
      fournisseur_id = p_fournisseur_id,
      date_arrivee = coalesce(p_date_arrivee, date_arrivee),
      montant_achat_global = p_montant_achat_global,
      observation = p_observation
  where id = p_conteneur_id;

  if not found then
    raise exception 'Conteneur introuvable.';
  end if;
end;
$$;

grant execute on function public.modifier_conteneur(uuid, text, uuid, date, numeric, text) to authenticated;

create function public.supprimer_conteneur(p_conteneur_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_conteneur record;
  v_stock_restant numeric;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_conteneur from public.conteneurs where id = p_conteneur_id for update;
  if v_conteneur is null then
    raise exception 'Conteneur introuvable.';
  end if;

  if v_conteneur.code = 'STOCK-INITIAL' then
    raise exception 'Le conteneur "Stock Initial" ne peut pas être supprimé.';
  end if;

  select coalesce(sum(quantite), 0) into v_stock_restant
  from public.stocks where conteneur_id = p_conteneur_id;

  if v_stock_restant > 0 then
    raise exception 'Impossible de supprimer : ce conteneur contient encore %  unité(s) en stock.', v_stock_restant;
  end if;

  -- Nettoie les lignes de stock à zéro (sans quoi la contrainte de clé
  -- étrangère bloquerait aussi une suppression légitime).
  delete from public.stocks where conteneur_id = p_conteneur_id;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'suppression', 'conteneurs', p_conteneur_id,
    'Suppression du conteneur ' || v_conteneur.code || ' (code PIN)'
  );

  -- Si des ventes ont déjà puisé dans ce conteneur, la contrainte de clé
  -- étrangère sur lignes_ventes_conteneurs refuse la suppression ici,
  -- avec un message clair — c'est le comportement voulu (protège
  -- l'historique des ventes).
  delete from public.conteneurs where id = p_conteneur_id;
end;
$$;

grant execute on function public.supprimer_conteneur(uuid, text) to authenticated;
