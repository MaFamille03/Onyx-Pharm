-- ============================================================================
-- ONYX PHARM — Migration 0016 : Création d'un conteneur (entrée de
-- marchandise)
--
-- Un conteneur se crée en une seule opération atomique : l'en-tête
-- (code, fournisseur, date, montant d'achat global) et toutes ses lignes
-- de stock (article + emplacement + quantité, sans aucun prix par ligne).
-- Si une ligne échoue, tout le conteneur est annulé (transaction unique).
-- ============================================================================

create function public.creer_conteneur(
  p_code text,
  p_fournisseur_id uuid,
  p_date_arrivee date,
  p_montant_achat_global numeric,
  p_observation text,
  p_lignes jsonb, -- [{"article_id": "...", "emplacement_id": "...", "quantite": 10}, ...]
  p_utilisateur_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_conteneur_id uuid;
  v_ligne jsonb;
  v_article_id uuid;
  v_emplacement_id uuid;
  v_quantite numeric;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Le code du conteneur est obligatoire.';
  end if;

  if p_montant_achat_global is null or p_montant_achat_global < 0 then
    raise exception 'Le montant d''achat global doit être renseigné et positif.';
  end if;

  if jsonb_array_length(coalesce(p_lignes, '[]'::jsonb)) = 0 then
    raise exception 'Ajoutez au moins un article au conteneur.';
  end if;

  insert into public.conteneurs (
    code, fournisseur_id, date_arrivee, montant_achat_global,
    statut, observation, created_by
  ) values (
    trim(p_code), p_fournisseur_id, coalesce(p_date_arrivee, current_date),
    p_montant_achat_global, 'Actif', p_observation, p_utilisateur_id
  )
  returning id into v_conteneur_id;

  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_article_id := (v_ligne ->> 'article_id')::uuid;
    v_emplacement_id := (v_ligne ->> 'emplacement_id')::uuid;
    v_quantite := (v_ligne ->> 'quantite')::numeric;

    if v_article_id is null or v_emplacement_id is null then
      raise exception 'Chaque ligne doit avoir un article et un emplacement.';
    end if;

    if v_quantite is null or v_quantite <= 0 then
      continue;
    end if;

    insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
    values (v_article_id, v_emplacement_id, v_conteneur_id, v_quantite)
    on conflict (article_id, emplacement_id, conteneur_id)
    do update set quantite = public.stocks.quantite + v_quantite;

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite,
      document_type, document_id, reference_document, observation, created_by
    ) values (
      v_article_id, v_emplacement_id, 'autre_entree', v_quantite,
      'creation_conteneur', v_conteneur_id, trim(p_code),
      'Entrée via conteneur ' || trim(p_code), p_utilisateur_id
    );
  end loop;

  return v_conteneur_id;
end;
$$;

grant execute on function public.creer_conteneur(text, uuid, date, numeric, text, jsonb, uuid) to authenticated;
