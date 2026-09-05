-- ============================================================================
-- ONYX PHARM — Migration 0014 : Réparation des comptes sans profil
--
-- CONTEXTE
-- Le profil (table "profiles") est créé automatiquement par un trigger
-- déclenché à la création d'un compte (migration 0001). Mais tout compte
-- créé AVANT que cette migration n'existe (par exemple lors des tout
-- premiers tests de l'étape 1, avant que la base de données ne soit en
-- place) n'a jamais reçu de profil.
--
-- Conséquence concrète : toute tentative d'enregistrement liée à ce
-- compte (créer un article, un client, etc.) échoue, car ces tables
-- essaient de rattacher l'opération à un profil qui n'existe pas
-- (violation de contrainte de clé étrangère sur "created_by").
--
-- Cette migration répare tous les comptes existants qui seraient dans ce
-- cas, en leur créant le profil manquant. Idempotente : ne fait rien si
-- tous les comptes ont déjà leur profil.
-- ============================================================================

insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
