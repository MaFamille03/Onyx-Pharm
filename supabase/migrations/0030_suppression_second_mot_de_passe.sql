-- ============================================================================
-- ONYX PHARM — Migration 0030 : Suppression du second mot de passe
--
-- Le second mot de passe de sécurité est retiré : le code PIN à 4
-- chiffres suffit désormais partout où une confirmation était demandée
-- (annulation de vente incluse). Les fonctions historiques
-- verifier_second_mot_de_passe/definir_second_mot_de_passe restent en
-- base (inoffensives, non appelées par l'application) plutôt que
-- supprimées, pour ne rien casser si une donnée y fait encore référence
-- ailleurs. Seule la valeur enregistrée est effacée par prudence.
-- ============================================================================

create or replace function public.annuler_vente(
  p_vente_id uuid,
  p_pin text,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_vente record;
  v_ligne record;
  v_repartition record;
begin
  select * into v_vente from public.ventes where id = p_vente_id for update;

  if v_vente is null then
    raise exception 'Vente introuvable.';
  end if;

  if v_vente.statut = 'Annulé' then
    raise exception 'Cette vente est déjà annulée.';
  end if;

  if v_vente.statut <> 'Brouillon' then
    if p_pin is null or not public.verifier_pin_securite(p_pin) then
      raise exception 'Code PIN incorrect.';
    end if;

    for v_ligne in
      select * from public.lignes_ventes where vente_id = p_vente_id
    loop
      for v_repartition in
        select * from public.lignes_ventes_conteneurs where ligne_vente_id = v_ligne.id
      loop
        insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
        values (v_ligne.article_id, v_ligne.emplacement_id, v_repartition.conteneur_id, v_repartition.quantite)
        on conflict (article_id, emplacement_id, conteneur_id)
        do update set quantite = public.stocks.quantite + v_repartition.quantite;

        insert into public.mouvements_stock (
          article_id, emplacement_id, type, quantite,
          document_type, document_id, reference_document, observation, created_by
        ) values (
          v_ligne.article_id, v_ligne.emplacement_id, 'autre_entree', v_repartition.quantite,
          'annulation_vente', p_vente_id, v_vente.reference,
          'Stock restitué suite annulation de la vente', p_utilisateur_id
        );
      end loop;
    end loop;

    insert into public.historique (
      utilisateur_id, action, table_cible, enregistrement_id, description
    ) values (
      p_utilisateur_id, 'annulation', 'ventes', p_vente_id,
      'Annulation de la vente ' || v_vente.reference || ' (stock restitué, code PIN)'
    );
  end if;

  update public.ventes set statut = 'Annulé' where id = p_vente_id;
end;
$$;

grant execute on function public.annuler_vente(uuid, text, uuid) to authenticated;

-- Efface la valeur enregistrée du second mot de passe — il n'est plus
-- utilisé nulle part dans l'application.
delete from public.parametres_generaux where cle = 'second_mot_de_passe_hash';
delete from public.parametres_generaux where cle = 'operations_protegees_second_mdp';
