-- ============================================================================
-- ONYX PHARM — Migration 0032 : Annuler une action depuis l'Historique
--
-- PORTÉE HONNÊTE DE CETTE FONCTIONNALITÉ
-- La quasi-totalité des entrées de l'Historique ne stockent qu'un texte
-- descriptif ("Quantité corrigée de 78 à 50"), pas de valeurs structurées
-- exploitables par une machine. Bâtir un "annuler" générique et fiable
-- pour absolument toutes les actions du système exigerait de revoir
-- l'écriture de l'historique dans des dizaines de fonctions — un chantier
-- à part entière, distinct de celui-ci.
--
-- Cette migration ajoute donc un "annuler" réel, mais volontairement
-- limité aux actions pour lesquelles la valeur exacte à restaurer est
-- désormais enregistrée de façon structurée (colonne donnees_annulation) :
--
--   1. Correction d'une quantité dans un conteneur (modifier_ligne_conteneur)
--   2. Correction d'une ligne d'inventaire déjà validé
--   3. Modification du prix de vente conseillé d'un article
--
-- Pour toute autre entrée de l'Historique, le bouton "Annuler" reste
-- affiché (pour rester cohérent visuellement) mais la fonction refuse
-- clairement avec un message explicite plutôt que de risquer une
-- correction incohérente.
-- ============================================================================

alter table public.historique
  add column if not exists donnees_annulation jsonb,
  add column if not exists annule boolean not null default false;

-- ----------------------------------------------------------------------------
-- 1) modifier_ligne_conteneur — enregistre désormais les données
-- nécessaires pour annuler précisément cette correction.
-- ----------------------------------------------------------------------------
create or replace function public.modifier_ligne_conteneur(
  p_conteneur_id uuid,
  p_article_id uuid,
  p_emplacement_id uuid,
  p_nouvelle_quantite numeric,
  p_pin text
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_quantite_actuelle numeric;
  v_conteneur record;
  v_designation text;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  if p_nouvelle_quantite < 0 then
    raise exception 'La quantité ne peut pas être négative.';
  end if;

  select * into v_conteneur from public.conteneurs where id = p_conteneur_id;
  if v_conteneur is null then
    raise exception 'Conteneur introuvable.';
  end if;

  select designation into v_designation from public.articles where id = p_article_id;

  select coalesce(quantite, 0) into v_quantite_actuelle
  from public.stocks
  where conteneur_id = p_conteneur_id and article_id = p_article_id
    and emplacement_id = p_emplacement_id;

  insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
  values (p_article_id, p_emplacement_id, p_conteneur_id, p_nouvelle_quantite)
  on conflict (article_id, emplacement_id, conteneur_id)
  do update set quantite = p_nouvelle_quantite;

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, reference_document, observation
  ) values (
    p_article_id, p_emplacement_id,
    case when p_nouvelle_quantite >= v_quantite_actuelle then 'autre_entree' else 'autre_sortie' end,
    abs(p_nouvelle_quantite - v_quantite_actuelle),
    'correction_conteneur', v_conteneur.code,
    'Correction de quantité dans le conteneur ' || v_conteneur.code
  );

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description,
    donnees_annulation
  ) values (
    auth.uid(), 'modification', 'conteneurs', p_conteneur_id,
    'Quantité de "' || coalesce(v_designation, '?') || '" corrigée dans le conteneur ' ||
    v_conteneur.code || ' (' || v_quantite_actuelle || ' → ' || p_nouvelle_quantite || ')',
    jsonb_build_object(
      'type', 'stock_conteneur_quantite',
      'article_designation', v_designation,
      'conteneur_id', p_conteneur_id,
      'article_id', p_article_id,
      'emplacement_id', p_emplacement_id,
      'quantite_avant', v_quantite_actuelle,
      'quantite_apres', p_nouvelle_quantite
    )
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) corriger_ligne_inventaire_validee — pareil, avec les données
-- nécessaires pour annuler.
-- ----------------------------------------------------------------------------
create or replace function public.corriger_ligne_inventaire_validee(
  p_ligne_id uuid,
  p_nouvelle_quantite_reelle numeric,
  p_pin text
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_ligne record;
  v_inventaire record;
  v_designation text;
  v_ancien_ecart numeric;
  v_nouvel_ecart numeric;
  v_delta numeric;
  v_stock_initial_id uuid := public.get_stock_initial_id();
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  if p_nouvelle_quantite_reelle < 0 then
    raise exception 'La quantité comptée ne peut pas être négative.';
  end if;

  select * into v_ligne from public.inventaire_lignes where id = p_ligne_id for update;
  if v_ligne is null then
    raise exception 'Ligne d''inventaire introuvable.';
  end if;

  select * into v_inventaire from public.inventaires where id = v_ligne.inventaire_id;
  if v_inventaire.statut <> 'Validé' then
    raise exception 'Cet inventaire n''est pas encore validé : modifiez la ligne normalement.';
  end if;

  select designation into v_designation from public.articles where id = v_ligne.article_id;

  v_ancien_ecart := v_ligne.ecart;
  v_nouvel_ecart := p_nouvelle_quantite_reelle - v_ligne.quantite_theorique;
  v_delta := v_nouvel_ecart - v_ancien_ecart;

  if v_delta <> 0 then
    update public.stocks
    set quantite = quantite + v_delta
    where article_id = v_ligne.article_id
      and emplacement_id = v_inventaire.emplacement_id
      and conteneur_id = v_stock_initial_id;

    if not found and v_delta > 0 then
      insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
      values (v_ligne.article_id, v_inventaire.emplacement_id, v_stock_initial_id, v_delta);
    end if;

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite,
      document_type, reference_document, observation
    ) values (
      v_ligne.article_id, v_inventaire.emplacement_id, 'ajustement_inventaire', v_delta,
      'correction_inventaire_valide', v_inventaire.reference,
      'Correction d''une ligne d''inventaire déjà validé (code PIN)'
    );
  end if;

  update public.inventaire_lignes
  set quantite_reelle = p_nouvelle_quantite_reelle
  where id = p_ligne_id;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description,
    donnees_annulation
  ) values (
    auth.uid(), 'modification', 'inventaire_lignes', p_ligne_id,
    'Ligne d''inventaire ' || v_inventaire.reference || ' — "' || coalesce(v_designation, '?') ||
    '" corrigée après validation (quantité comptée : ' ||
    v_ligne.quantite_reelle || ' → ' || p_nouvelle_quantite_reelle || ', code PIN)',
    jsonb_build_object(
      'type', 'inventaire_ligne_quantite',
      'article_designation', v_designation,
      'ligne_id', p_ligne_id,
      'article_id', v_ligne.article_id,
      'emplacement_id', v_inventaire.emplacement_id,
      'quantite_reelle_avant', v_ligne.quantite_reelle,
      'quantite_reelle_apres', p_nouvelle_quantite_reelle
    )
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) log_historique_article — ajoute donnees_annulation pour le prix de
-- vente conseillé (le seul prix encore utilisé par l'application).
-- ----------------------------------------------------------------------------
create or replace function public.log_historique_article()
returns trigger
language plpgsql
security definer set search_path = public, extensions
as $$
begin
  if new.prix_vente_conseille is distinct from old.prix_vente_conseille then
    insert into public.historique (
      utilisateur_id, action, table_cible, enregistrement_id,
      ancienne_valeur, nouvelle_valeur, description, donnees_annulation
    ) values (
      auth.uid(), 'modification', 'articles', new.id,
      to_jsonb(old.prix_vente_conseille), to_jsonb(new.prix_vente_conseille),
      'Prix de vente conseillé modifié pour "' || new.designation || '"',
      jsonb_build_object(
        'type', 'article_prix_vente',
        'article_designation', new.designation,
        'article_id', new.id,
        'prix_avant', old.prix_vente_conseille,
        'prix_apres', new.prix_vente_conseille
      )
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

-- ----------------------------------------------------------------------------
-- 4) ANNULER UNE ACTION — fonction principale, appelée depuis l'Historique
-- ----------------------------------------------------------------------------
create function public.annuler_action_historique(p_historique_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_h record;
  v_type text;
  v_stock_initial_id uuid;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_h from public.historique where id = p_historique_id for update;
  if v_h is null then
    raise exception 'Action introuvable dans l''historique.';
  end if;

  if v_h.annule then
    raise exception 'Cette action a déjà été annulée.';
  end if;

  if v_h.donnees_annulation is null then
    raise exception 'Cette action ne peut pas être annulée automatiquement (donnée non structurée pour un retour en arrière sûr).';
  end if;

  v_type := v_h.donnees_annulation->>'type';

  if v_type = 'stock_conteneur_quantite' then
    update public.stocks
    set quantite = (v_h.donnees_annulation->>'quantite_avant')::numeric
    where article_id = (v_h.donnees_annulation->>'article_id')::uuid
      and emplacement_id = (v_h.donnees_annulation->>'emplacement_id')::uuid
      and conteneur_id = (v_h.donnees_annulation->>'conteneur_id')::uuid;

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite, document_type, observation
    ) values (
      (v_h.donnees_annulation->>'article_id')::uuid,
      (v_h.donnees_annulation->>'emplacement_id')::uuid,
      case when (v_h.donnees_annulation->>'quantite_avant')::numeric >= (v_h.donnees_annulation->>'quantite_apres')::numeric
        then 'autre_entree' else 'autre_sortie' end,
      abs((v_h.donnees_annulation->>'quantite_avant')::numeric - (v_h.donnees_annulation->>'quantite_apres')::numeric),
      'annulation_historique',
      'Annulation : retour à la quantité précédente pour "' ||
      coalesce(v_h.donnees_annulation->>'article_designation', '?') || '"'
    );

  elsif v_type = 'inventaire_ligne_quantite' then
    v_stock_initial_id := public.get_stock_initial_id();

    update public.stocks
    set quantite = quantite -
      ((v_h.donnees_annulation->>'quantite_reelle_apres')::numeric -
       (v_h.donnees_annulation->>'quantite_reelle_avant')::numeric)
    where article_id = (v_h.donnees_annulation->>'article_id')::uuid
      and emplacement_id = (v_h.donnees_annulation->>'emplacement_id')::uuid
      and conteneur_id = v_stock_initial_id;

    update public.inventaire_lignes
    set quantite_reelle = (v_h.donnees_annulation->>'quantite_reelle_avant')::numeric
    where id = (v_h.donnees_annulation->>'ligne_id')::uuid;

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite, document_type, observation
    ) values (
      (v_h.donnees_annulation->>'article_id')::uuid,
      (v_h.donnees_annulation->>'emplacement_id')::uuid,
      'ajustement_inventaire',
      (v_h.donnees_annulation->>'quantite_reelle_apres')::numeric -
        (v_h.donnees_annulation->>'quantite_reelle_avant')::numeric,
      'annulation_historique',
      'Annulation : retour à la quantité comptée précédente pour "' ||
      coalesce(v_h.donnees_annulation->>'article_designation', '?') || '"'
    );

  elsif v_type = 'article_prix_vente' then
    update public.articles
    set prix_vente_conseille = (v_h.donnees_annulation->>'prix_avant')::numeric
    where id = (v_h.donnees_annulation->>'article_id')::uuid;

  else
    raise exception 'Cette action ne peut pas être annulée automatiquement.';
  end if;

  update public.historique set annule = true where id = p_historique_id;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'annulation', v_h.table_cible, v_h.enregistrement_id,
    'Annulation (code PIN) de l''action : ' || v_h.description
  );
end;
$$;

grant execute on function public.annuler_action_historique(uuid, text) to authenticated;
