-- ============================================================
--  Boîte à Outils GEFEC — Schéma Supabase (auth multi-magasins)
--  À exécuter UNE FOIS dans Supabase : SQL Editor → coller → Run.
--  Rôles : 'admin' (Rémi), 'director' (2 DR), 'store' (16 magasins).
-- ============================================================

-- ---------- Tables ----------
create table if not exists public.stores (
  id          text primary key,          -- code magasin (ex : '51100')
  name        text not null,
  region      text,
  created_at  timestamptz default now()
);

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,
  role         text not null check (role in ('admin','director','store')),
  store_id     text references public.stores(id) on delete set null,
  display_name text,
  created_at   timestamptz default now()
);

-- Métadonnées de la valorisation (le PDF lui-même est dans le Storage)
create table if not exists public.valorisations (
  store_id    text primary key references public.stores(id) on delete cascade,
  file_path   text not null,             -- ex : '51100/valorisation.pdf'
  file_name   text,
  ean_count   int,
  updated_at  timestamptz default now(),
  updated_by  uuid references auth.users(id)
);

-- ---------- Fonctions d'aide (security definer = lisent les profils
--            sans déclencher la RLS, donc pas de récursion) ----------
create or replace function public.app_role() returns text
  language sql security definer stable as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.app_store() returns text
  language sql security definer stable as $$
  select store_id from public.profiles where user_id = auth.uid()
$$;

-- ---------- RLS ----------
alter table public.stores         enable row level security;
alter table public.profiles       enable row level security;
alter table public.valorisations  enable row level security;

-- stores : lecture pour tout utilisateur connecté (écriture via service_role only)
drop policy if exists "stores_read" on public.stores;
create policy "stores_read" on public.stores
  for select using (auth.role() = 'authenticated');

-- profiles : on lit son propre profil ; admin/directeur lisent tout
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select using (
    user_id = auth.uid() or public.app_role() in ('admin','director')
  );
-- (création / modification des profils : uniquement via la fonction Edge en service_role)

-- valorisations (métadonnées) : magasin voit la sienne ; admin/dir voient tout
drop policy if exists "valos_read" on public.valorisations;
create policy "valos_read" on public.valorisations
  for select using (
    public.app_role() in ('admin','director') or store_id = public.app_store()
  );
drop policy if exists "valos_insert" on public.valorisations;
create policy "valos_insert" on public.valorisations
  for insert with check (store_id = public.app_store());
drop policy if exists "valos_update" on public.valorisations;
create policy "valos_update" on public.valorisations
  for update using (store_id = public.app_store())
            with check (store_id = public.app_store());

-- ---------- Storage : bucket privé 'valorisations' ----------
insert into storage.buckets (id, name, public)
values ('valorisations', 'valorisations', false)
on conflict (id) do nothing;

-- chemin = '<store_id>/...'  → on contrôle l'accès sur le 1er segment
drop policy if exists "valofiles_read" on storage.objects;
create policy "valofiles_read" on storage.objects
  for select using (
    bucket_id = 'valorisations' and (
      public.app_role() in ('admin','director')
      or (storage.foldername(name))[1] = public.app_store()
    )
  );
drop policy if exists "valofiles_insert" on storage.objects;
create policy "valofiles_insert" on storage.objects
  for insert with check (
    bucket_id = 'valorisations' and (storage.foldername(name))[1] = public.app_store()
  );
drop policy if exists "valofiles_update" on storage.objects;
create policy "valofiles_update" on storage.objects
  for update using (
    bucket_id = 'valorisations' and (storage.foldername(name))[1] = public.app_store()
  );
drop policy if exists "valofiles_delete" on storage.objects;
create policy "valofiles_delete" on storage.objects
  for delete using (
    bucket_id = 'valorisations' and (storage.foldername(name))[1] = public.app_store()
  );

-- ============================================================
--  BOOTSTRAP DU COMPTE ADMIN (à faire après avoir créé l'utilisateur
--  admin@gefec.local dans Authentication → Users, mot de passe Remi51100$$).
--  Décommentez et exécutez :
-- ============================================================
-- insert into public.profiles (user_id, username, role, display_name)
-- select id, 'admin', 'admin', 'Administrateur'
-- from auth.users where email = 'admin@gefec.local'
-- on conflict (user_id) do update set role = 'admin';
