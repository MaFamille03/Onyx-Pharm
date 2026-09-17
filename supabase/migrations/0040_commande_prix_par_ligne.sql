-- ============================================================================
-- ONYX PHARM — Migration 0040 : creer_conteneur accepte désormais un
-- prix d'achat unitaire par ligne (article), un taux de change et un
-- coefficient de marge au niveau de la commande.
--
-- Si un prix d'achat unitaire est donné pour au moins une ligne, le
-- montant d'achat global de la commande est calculé automatiquement
-- comme la somme (quantité × prix unitaire) de toutes les lignes qui en
-- ont un — p_montant_achat_global devient alors un simple filet de
-- sécurité, remplacé par ce total si les deux sont fournis en même
-- temps. Si aucune ligne n'a de prix (saisie à l'ancienne, un seul
-- montant global), rien ne change par rapport à avant.
--
-- Quand un prix de vente est donné pour un article déjà existant, son
-- prix de vente conseillé est mis à jour — pour que le catalogue reste
-- à jour avec le dernier prix connu, sans avoir à le corriger à la main
-- ensuite.
-- ============================================================================

-- Supprime l'ancienne signature (7 paramètres) pour éviter toute
-- ambiguïté avec la nouvelle (9 paramètres, les 2 derniers optionnels).
drop function if exists public.creer_conteneur(text, uuid, date, numeric, text, jsonb, uuid);

create or replace function public.creer_conteneur(
  p_code text,
  p_fournisseur_id uuid,
  p_date_arrivee date,
  p_montant_achat_global numeric,
  p_observation text,
  p_lignes jsonb,
  p_utilisateur_id uuid,
  p_taux_change numeric default null,
  p_coefficient_marge numeric default null
)
returns uuid
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_conteneur_id uuid;
  v_ligne jsonb;
  v_article_id uuid;
  v_emplacement_id uuid;
  v_quantite numeric;
  v_prix_achat_unitaire numeric;
  v_prix_vente numeric;
  v_montant_calcule numeric := 0;
  v_a_des_prix_lignes boolean := false;
  v_montant_final numeric;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Le code du conteneur est obligatoire.';
  end if;

  if jsonb_array_length(coalesce(p_lignes, '[]'::jsonb)) = 0 then
    raise exception 'Ajoutez au moins un article au conteneur.';
  end if;

  -- Calcule le montant total à partir des lignes, si au moins une a un
  -- prix d'achat unitaire renseigné.
  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_quantite := (v_ligne ->> 'quantite')::numeric;
    v_prix_achat_unitaire := nullif(v_ligne ->> 'prix_achat_unitaire', '')::numeric;
    if v_prix_achat_unitaire is not null and v_quantite is not null then
      v_a_des_prix_lignes := true;
      v_montant_calcule := v_montant_calcule + v_quantite * v_prix_achat_unitaire;
    end if;
  end loop;

  v_montant_final := case
    when v_a_des_prix_lignes then v_montant_calcule
    else p_montant_achat_global
  end;

  if v_montant_final is null or v_montant_final < 0 then
    raise exception 'Le montant d''achat (global ou calculé depuis les lignes) doit être renseigné et positif.';
  end if;

  insert into public.conteneurs (
    code, fournisseur_id, date_arrivee, montant_achat_global,
    taux_change, coefficient_marge, statut, observation, created_by
  ) values (
    trim(p_code), p_fournisseur_id, coalesce(p_date_arrivee, current_date),
    v_montant_final, p_taux_change, p_coefficient_marge, 'Actif', p_observation, p_utilisateur_id
  )
  returning id into v_conteneur_id;

  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_article_id := (v_ligne ->> 'article_id')::uuid;
    v_emplacement_id := (v_ligne ->> 'emplacement_id')::uuid;
    v_quantite := (v_ligne ->> 'quantite')::numeric;
    v_prix_achat_unitaire := nullif(v_ligne ->> 'prix_achat_unitaire', '')::numeric;
    v_prix_vente := nullif(v_ligne ->> 'prix_vente_conseille', '')::numeric;

    if v_article_id is null or v_emplacement_id is null then
      raise exception 'Chaque ligne doit avoir un article et un emplacement.';
    end if;

    if v_quantite is null or v_quantite <= 0 then
      continue;
    end if;

    insert into public.stocks (
      article_id, emplacement_id, conteneur_id, quantite, quantite_initiale, prix_achat_unitaire
    )
    values (v_article_id, v_emplacement_id, v_conteneur_id, v_quantite, v_quantite, v_prix_achat_unitaire)
    on conflict (article_id, emplacement_id, conteneur_id)
    do update set
      quantite = public.stocks.quantite + v_quantite,
      prix_achat_unitaire = coalesce(excluded.prix_achat_unitaire, public.stocks.prix_achat_unitaire);

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite,
      document_type, document_id, reference_document, observation, created_by
    ) values (
      v_article_id, v_emplacement_id, 'autre_entree', v_quantite,
      'creation_conteneur', v_conteneur_id, trim(p_code),
      'Entrée via conteneur ' || trim(p_code), p_utilisateur_id
    );

    if v_prix_vente is not null and v_prix_vente > 0 then
      update public.articles
      set prix_vente_conseille = v_prix_vente
      where id = v_article_id;
    end if;
  end loop;

  return v_conteneur_id;
end;
$$;

grant execute on function public.creer_conteneur(
  text, uuid, date, numeric, text, jsonb, uuid, numeric, numeric
) to authenticated;
