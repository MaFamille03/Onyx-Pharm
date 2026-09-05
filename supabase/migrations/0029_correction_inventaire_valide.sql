-- ============================================================================
-- ONYX PHARM — Migration 0029 : Corriger une ligne d'inventaire déjà
-- validé (recompte, erreur de saisie), protégé par le code PIN
--
-- Avant validation, une ligne se corrige librement. Après validation,
-- le stock a déjà été ajusté selon l'écart initial — corriger la ligne
-- doit donc recalculer précisément la différence entre l'ancien écart
-- déjà appliqué et le nouveau, et n'appliquer que cette différence au
-- stock (jamais la valeur brute), pour ne jamais désynchroniser.
-- ============================================================================

create function public.corriger_ligne_inventaire_validee(
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
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'modification', 'inventaire_lignes', p_ligne_id,
    'Ligne d''inventaire ' || v_inventaire.reference || ' corrigée après validation (quantité comptée : ' ||
    v_ligne.quantite_reelle || ' → ' || p_nouvelle_quantite_reelle || ', code PIN)'
  );
end;
$$;

grant execute on function public.corriger_ligne_inventaire_validee(uuid, numeric, text) to authenticated;
