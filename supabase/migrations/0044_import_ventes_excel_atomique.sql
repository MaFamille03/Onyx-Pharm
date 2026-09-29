-- ONYX PHARM — 0044 : import Excel des ventes atomique
-- Un appel traite tout le fichier dans une seule transaction PostgreSQL.
-- Client -> facture/BL -> lignes -> paiements. Toute erreur annule l'ensemble.

create or replace function public.importer_ventes_excel(
  p_groupes jsonb,
  p_utilisateur_id uuid,
  p_mode_historique boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_groupe jsonb;
  v_ligne jsonb;
  v_paiement jsonb;
  v_client_id uuid;
  v_client_count integer;
  v_vente_id uuid;
  v_reference text;
  v_numero text;
  v_nom_client text;
  v_date date;
  v_total numeric := 0;
  v_avance numeric := 0;
  v_reste numeric := 0;
  v_ligne_total numeric := 0;
  v_qte numeric;
  v_prix numeric;
  v_remise numeric;
  v_article_id uuid;
  v_emplacement_id uuid;
  v_hors_catalogue boolean;
  v_designation text;
  v_mode text;
  v_montant numeric;
  v_paiements jsonb;
  v_lignes jsonb;
  v_observation text;
  v_existing uuid;
  v_created integer := 0;
  v_group_count integer;
begin
  if p_groupes is null or jsonb_typeof(p_groupes) <> 'array' then
    raise exception 'Le fichier d''import est vide ou invalide.';
  end if;

  v_group_count := jsonb_array_length(p_groupes);
  if v_group_count = 0 then
    raise exception 'Aucune vente à importer.';
  end if;

  for v_groupe in select value from jsonb_array_elements(p_groupes)
  loop
    v_numero := nullif(trim(v_groupe->>'numero'), '');
    v_nom_client := nullif(trim(v_groupe->>'nom_client'), '');
    v_date := nullif(trim(v_groupe->>'date_vente'), '')::date;
    v_lignes := coalesce(v_groupe->'lignes', '[]'::jsonb);
    v_paiements := coalesce(v_groupe->'paiements', '[]'::jsonb);
    v_total := 0;
    v_avance := 0;

    if v_numero is null then raise exception 'N° BL manquant.'; end if;
    if v_nom_client is null then raise exception 'Client manquant pour le BL %.', v_numero; end if;
    if v_date is null then raise exception 'Date de vente manquante pour le BL %.', v_numero; end if;
    if jsonb_array_length(v_lignes) = 0 then raise exception 'Aucun article pour le BL %.', v_numero; end if;

    -- Le client doit être unique dans la base pour un nom normalisé donné.
    select count(*) into v_client_count
    from public.clients
    where lower(trim(nom)) = lower(trim(v_nom_client))
      and statut <> 'Supprimé';

    if v_client_count > 1 then
      raise exception 'Plusieurs fiches clients portent le nom "%". Sélectionnez/normalisez le client avant import.', v_nom_client;
    elsif v_client_count = 1 then
      select id into v_client_id from public.clients
      where lower(trim(nom)) = lower(trim(v_nom_client))
        and statut <> 'Supprimé'
      limit 1;
    else
      insert into public.clients (nom, created_by)
      values (v_nom_client, p_utilisateur_id)
      returning id into v_client_id;
    end if;

    -- Contrôle du doublon exact de BL déjà importé.
    select id into v_existing
    from public.ventes
    where observation = 'Import Excel — N° BL: ' || v_numero
      and statut <> 'Annulé'
    limit 1;
    if v_existing is not null then
      raise exception 'Le N° BL % a déjà été importé (vente %).', v_numero, v_existing;
    end if;

    for v_ligne in select value from jsonb_array_elements(v_lignes)
    loop
      v_qte := (v_ligne->>'quantite')::numeric;
      v_prix := (v_ligne->>'prix')::numeric;
      v_remise := coalesce(nullif(v_ligne->>'remise', '')::numeric, 0);
      v_hors_catalogue := coalesce((v_ligne->>'hors_catalogue')::boolean, false);
      v_article_id := nullif(v_ligne->>'article_id', '')::uuid;
      v_emplacement_id := nullif(v_ligne->>'emplacement_id', '')::uuid;
      v_designation := nullif(trim(v_ligne->>'designation'), '');

      if v_qte is null or v_qte <= 0 then raise exception 'Quantité invalide pour le BL %.', v_numero; end if;
      if v_prix is null or v_prix <= 0 then raise exception 'Prix de vente invalide pour le BL %.', v_numero; end if;
      if v_remise < 0 or v_remise > v_qte * v_prix then raise exception 'Remise invalide pour le BL %.', v_numero; end if;
      if not v_hors_catalogue and (v_article_id is null or v_emplacement_id is null) then
        raise exception 'Article/emplacement manquant pour le BL %.', v_numero;
      end if;
      if v_hors_catalogue and v_designation is null then
        raise exception 'Désignation hors catalogue manquante pour le BL %.', v_numero;
      end if;

      v_ligne_total := v_qte * v_prix - v_remise;
      v_total := v_total + v_ligne_total;

      if not v_hors_catalogue then
        if not exists (select 1 from public.articles where id = v_article_id) then
          raise exception 'Article introuvable pour le BL %.', v_numero;
        end if;
        if not exists (select 1 from public.emplacements where id = v_emplacement_id and actif = true) then
          raise exception 'Emplacement introuvable/inactif pour le BL %.', v_numero;
        end if;
      end if;
    end loop;

    for v_paiement in select value from jsonb_array_elements(v_paiements)
    loop
      v_montant := (v_paiement->>'montant')::numeric;
      v_mode := nullif(trim(v_paiement->>'mode_paiement'), '');
      if v_montant is null or v_montant <= 0 then raise exception 'Montant de paiement invalide pour le BL %.', v_numero; end if;
      if v_mode is null then raise exception 'Mode de paiement manquant pour le BL %.', v_numero; end if;
      v_avance := v_avance + v_montant;
    end loop;

    v_reste := v_total - v_avance;
    if v_avance > v_total + 0.01 then
      raise exception 'Le paiement du BL % dépasse son total.', v_numero;
    end if;

    if v_groupe ? 'reste_excel' and (v_groupe->>'reste_excel') is not null then
      if abs((v_groupe->>'reste_excel')::numeric - v_reste) > 0.01 then
        raise exception 'Le reste du BL % ne correspond pas au total calculé moins les paiements.', v_numero;
      end if;
    end if;

    v_reference := public.generer_numero_document('FAC');
    v_observation := 'Import Excel — N° BL: ' || v_numero;
    if nullif(trim(v_groupe->>'observation'), '') is not null then
      v_observation := v_observation || ' — ' || trim(v_groupe->>'observation');
    end if;

    insert into public.ventes (
      reference, client_id, date_vente, montant_total, statut, observation, created_by
    ) values (
      v_reference, v_client_id, v_date, v_total,
      'Brouillon', v_observation, p_utilisateur_id
    ) returning id into v_vente_id;

    for v_ligne in select value from jsonb_array_elements(v_lignes)
    loop
      v_qte := (v_ligne->>'quantite')::numeric;
      v_prix := (v_ligne->>'prix')::numeric;
      v_remise := coalesce(nullif(v_ligne->>'remise', '')::numeric, 0);
      v_hors_catalogue := coalesce((v_ligne->>'hors_catalogue')::boolean, false);
      v_article_id := nullif(v_ligne->>'article_id', '')::uuid;
      v_emplacement_id := nullif(v_ligne->>'emplacement_id', '')::uuid;
      v_designation := nullif(trim(v_ligne->>'designation'), '');

      insert into public.lignes_ventes (
        vente_id, article_id, emplacement_id, quantite,
        prix_achat_reference, prix_vente_conseille_reference,
        prix_vente_reel, remise, designation_hors_catalogue, hors_catalogue
      ) values (
        v_vente_id, v_article_id, v_emplacement_id, v_qte,
        0, v_prix, v_prix, v_remise,
        case when v_hors_catalogue then v_designation else null end,
        v_hors_catalogue
      );
    end loop;

    if p_mode_historique then
      update public.ventes set statut = 'Validé' where id = v_vente_id;
    else
      perform public.valider_vente(v_vente_id, p_utilisateur_id);
    end if;

    for v_paiement in select value from jsonb_array_elements(v_paiements)
    loop
      v_montant := (v_paiement->>'montant')::numeric;
      v_mode := nullif(trim(v_paiement->>'mode_paiement'), '');
      insert into public.paiements_ventes (
        vente_id, montant, mode_paiement, date_paiement, observation, created_by
      ) values (
        v_vente_id, v_montant, v_mode, coalesce(nullif(v_paiement->>'date_paiement','')::date, v_date),
        nullif(trim(v_paiement->>'observation'), ''), p_utilisateur_id
      );
    end loop;

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('success', true, 'created', v_created);
end;
$$;

grant execute on function public.importer_ventes_excel(jsonb, uuid, boolean) to authenticated;
