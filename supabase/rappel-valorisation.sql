-- ============================================================
--  RAPPEL « VALORISATION À METTRE À JOUR »
--  ------------------------------------------------------------
--  La tournée quotidienne (6 h) envoie un mail de rappel aux adresses
--  du magasin dès que sa valorisation a plus de 30 jours, puis toutes
--  les 72 h tant qu'elle n'est pas remplacée. valo_reminded_at mémorise
--  le dernier rappel envoyé.
--  À exécuter UNE FOIS dans Supabase : SQL Editor -> coller -> Run. Idempotent.
-- ============================================================
alter table public.stores add column if not exists valo_reminded_at timestamptz;
