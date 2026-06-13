-- ============================================================
--  Plan promo national PARTAGÉ (publié par l'administrateur,
--  disponible en lecture pour tous les comptes connectés).
--  À exécuter UNE FOIS dans Supabase : SQL Editor -> coller -> Run.
--  (Nécessite que schema.sql ait déjà été exécuté : utilise app_role().)
-- ============================================================

-- Bucket privé pour les documents communs
insert into storage.buckets (id, name, public)
values ('shared', 'shared', false)
on conflict (id) do nothing;

-- Lecture : tout utilisateur connecté ; écriture : administrateur uniquement
drop policy if exists "shared_read" on storage.objects;
create policy "shared_read" on storage.objects
  for select using (bucket_id = 'shared' and auth.role() = 'authenticated');

drop policy if exists "shared_admin_insert" on storage.objects;
create policy "shared_admin_insert" on storage.objects
  for insert with check (bucket_id = 'shared' and public.app_role() = 'admin');

drop policy if exists "shared_admin_update" on storage.objects;
create policy "shared_admin_update" on storage.objects
  for update using (bucket_id = 'shared' and public.app_role() = 'admin');

drop policy if exists "shared_admin_delete" on storage.objects;
create policy "shared_admin_delete" on storage.objects
  for delete using (bucket_id = 'shared' and public.app_role() = 'admin');

-- Métadonnées des documents partagés (le fichier est dans le Storage)
create table if not exists public.shared_docs (
  id          text primary key,        -- ex : 'plan-promo'
  file_path   text not null,
  file_name   text,
  updated_at  timestamptz default now(),
  updated_by  uuid references auth.users(id)
);
alter table public.shared_docs enable row level security;

drop policy if exists "shared_docs_read" on public.shared_docs;
create policy "shared_docs_read" on public.shared_docs
  for select using (auth.role() = 'authenticated');

drop policy if exists "shared_docs_insert" on public.shared_docs;
create policy "shared_docs_insert" on public.shared_docs
  for insert with check (public.app_role() = 'admin');

drop policy if exists "shared_docs_update" on public.shared_docs;
create policy "shared_docs_update" on public.shared_docs
  for update using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
