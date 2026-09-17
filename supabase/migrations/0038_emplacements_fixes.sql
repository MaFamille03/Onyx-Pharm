-- ============================================================================
-- ONYX PHARM — Migration 0038 : Crée les 4 emplacements fixes de
-- l'entreprise, s'ils n'existent pas déjà (sans doublon).
-- ============================================================================

insert into public.emplacements (nom, actif)
values
  ('Entrepôt', true),
  ('Bureau - Magasin', true),
  ('Bureau - Chez Mme', true),
  ('Autres locales', true)
on conflict (nom) do nothing;
