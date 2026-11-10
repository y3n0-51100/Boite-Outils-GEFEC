-- ============================================================
--  REMISE À ZÉRO DES COMPTES MAGASINS
--  ------------------------------------------------------------
--  Supprime tous les comptes sauf les administrateurs (admin + robot),
--  tous les magasins et tout ce qui en dépend : valorisations,
--  historiques d'envoi, affiches déjà envoyées.
--  Les documents partagés (plans promo, masques, base NOSICA), les
--  opérations commerciales et les réglages sont conservés.
--
--  IRRÉVERSIBLE. SQL Editor -> coller -> Run.
--  Les fichiers des buckets « valorisations » et « affiches » se vident
--  depuis Storage (bouton « Empty bucket ») si la suppression SQL est
--  refusée par Supabase.
-- ============================================================

begin;

-- comptes non administrateurs (profils puis utilisateurs Auth)
delete from public.profiles where role <> 'admin';
delete from auth.users u
 where not exists (select 1 from public.profiles p where p.user_id = u.id and p.role = 'admin');

-- magasins : valorisations, affiches_mails, campagne_mails, auto_sent suivent
-- par « on delete cascade »
delete from public.valorisations;
delete from public.campagne_mails;
delete from public.auto_sent;
delete from public.stores;

commit;

-- fichiers (peut être refusé selon la version de Supabase : voir en-tête)
delete from storage.objects where bucket_id in ('valorisations', 'affiches');
