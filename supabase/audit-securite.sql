-- ════════════════════════════════════════════════════════════════
-- Corrections de sécurité issues de l'audit (novembre 2026)
-- ════════════════════════════════════════════════════════════════
-- 1. un magasin ne lit plus que sa propre fiche : les adresses mail des
--    autres magasins ne sont plus lisibles par un compte magasin
drop policy if exists stores_read on public.stores;
create policy stores_read on public.stores for select
  using (public.app_role() in ('admin', 'director') or id = public.app_store());

-- 2. fonctions de droits : chemin de recherche figé
alter function public.app_role() set search_path = public;
alter function public.app_store() set search_path = public;

-- 3. pg_net rangé dans le schéma des extensions (ses fonctions restent dans
--    le schéma « net », les tâches planifiées de 6 h ne sont pas touchées)
drop extension if exists pg_net;
create extension pg_net with schema extensions;
