-- ============================================================================
-- ONYX PHARM — Migration 0008 : Caisse — liaison automatique
-- vente → encaissement et achat → décaissement (sections 50-51)
-- ============================================================================

-- Solde de caisse initial, modifiable dans Paramètres > Caisse.
insert into public.parametres_generaux (cle, valeur)
values ('solde_caisse_initial', '0')
on conflict (cle) do nothing;

-- ----------------------------------------------------------------------------
-- VENTE → PAIEMENT → ENCAISSEMENT
-- Chaque paiement de vente enregistré crée automatiquement l'encaissement
-- correspondant : l'utilisateur ne ressaisit jamais la même opération deux
-- fois (section 50).
-- ----------------------------------------------------------------------------
create function public.synchroniser_encaissement_vente()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_vente record;
  v_reference text;
begin
  select * into v_vente from public.ventes where id = new.vente_id;

  v_reference := public.generer_numero_document('ENC');

  insert into public.encaissements (
    reference, date_operation, montant, mode_paiement,
    client_id, vente_id, categorie, description, created_by
  ) values (
    v_reference, new.date_paiement, new.montant, new.mode_paiement,
    v_vente.client_id, new.vente_id, 'Vente',
    'Paiement vente ' || coalesce(v_vente.reference, ''), new.created_by
  );

  return new;
end;
$$;

create trigger trg_synchroniser_encaissement_vente
  after insert on public.paiements_ventes
  for each row execute function public.synchroniser_encaissement_vente();

-- ----------------------------------------------------------------------------
-- ACHAT → PAIEMENT → DÉCAISSEMENT (section 51)
-- ----------------------------------------------------------------------------
create function public.synchroniser_decaissement_achat()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_achat record;
  v_reference text;
begin
  select * into v_achat from public.achats where id = new.achat_id;

  v_reference := public.generer_numero_document('DEC');

  insert into public.decaissements (
    reference, date_operation, montant, mode_paiement,
    fournisseur_id, achat_id, categorie, description, created_by
  ) values (
    v_reference, new.date_paiement, new.montant, new.mode_paiement,
    v_achat.fournisseur_id, new.achat_id, 'Achat',
    'Paiement achat ' || coalesce(v_achat.reference, ''), new.created_by
  );

  return new;
end;
$$;

create trigger trg_synchroniser_decaissement_achat
  after insert on public.paiements_achats
  for each row execute function public.synchroniser_decaissement_achat();
