-- ============================================================
--  Suivi de la dernière connexion (tableau de bord admin/directeurs).
--  À exécuter UNE FOIS dans Supabase : SQL Editor -> coller -> Run.
--  (Nécessite que schema.sql ait déjà été exécuté.)
-- ============================================================

-- Colonne « dernière connexion » sur les profils
alter table public.profiles add column if not exists last_seen timestamptz;

-- Fonction appelée à chaque connexion : chaque utilisateur ne met à jour
-- QUE sa propre ligne (SECURITY DEFINER pour éviter d'ouvrir l'UPDATE en RLS).
create or replace function public.mark_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_seen = now() where user_id = auth.uid();
$$;

grant execute on function public.mark_seen() to authenticated;
