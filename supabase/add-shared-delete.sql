-- ============================================================
--  Autorise l'administrateur à RETIRER un document partagé
--  (plan promo, affiches CETELEM, médias Soldes).
--  À exécuter UNE FOIS dans Supabase : SQL Editor -> coller -> Run.
--  (Nécessite que schema.sql + update-plan-promo.sql aient été exécutés.)
--
--  Le fichier dans le Storage est déjà supprimable par l'admin
--  (policy "shared_admin_delete"). Il manquait seulement la
--  suppression de la ligne de métadonnées dans shared_docs.
-- ============================================================

drop policy if exists "shared_docs_delete" on public.shared_docs;
create policy "shared_docs_delete" on public.shared_docs
  for delete using (public.app_role() = 'admin');
