-- ============================================================
--  « Envoyer le mail de téléchargement » — affiches prêtes à imprimer
--  ------------------------------------------------------------
--  Quand un magasin a déposé sa valorisation et que l'administrateur a
--  publié les plans promo TV et PEM, l'administrateur génère le PDF de
--  TOUTES les affiches du magasin et l'envoie par mail à son directeur,
--  sous forme d'un lien de téléchargement (aucun compte à saisir).
--
--  À exécuter UNE FOIS dans Supabase : SQL Editor -> coller -> Run.
--  (Nécessite schema.sql : utilise app_role() et app_store().)
-- ============================================================

-- ---------- 1. L'adresse du directeur, magasin par magasin ----------
alter table public.stores add column if not exists email text;

-- L'administrateur renseigne cette adresse depuis l'écran « Valorisations ».
-- (La création des magasins passe toujours par la fonction Edge en
--  service_role : seule la mise à jour est ouverte ici, à l'admin.)
drop policy if exists "stores_admin_update" on public.stores;
create policy "stores_admin_update" on public.stores
  for update using (public.app_role() = 'admin')
            with check (public.app_role() = 'admin');

-- ---------- 2. Bucket privé des PDF d'affiches ----------
-- Chemin = '<store_id>/affiches.pdf' : un seul fichier par magasin, remplacé
-- à chaque envoi. Les liens déjà envoyés restent valides et servent toujours
-- la dernière version — c'est voulu.
insert into storage.buckets (id, name, public)
values ('affiches', 'affiches', false)
on conflict (id) do nothing;

-- Lecture : admin et directeurs régionaux partout, le magasin chez lui.
-- Le directeur de magasin, lui, n'a rien à ouvrir : le lien qu'il reçoit est
-- une URL signée, valable sans connexion pendant la durée choisie à l'envoi.
drop policy if exists "affiches_read" on storage.objects;
create policy "affiches_read" on storage.objects
  for select using (
    bucket_id = 'affiches' and (
      public.app_role() in ('admin','director')
      or (storage.foldername(name))[1] = public.app_store()
    )
  );

drop policy if exists "affiches_admin_insert" on storage.objects;
create policy "affiches_admin_insert" on storage.objects
  for insert with check (bucket_id = 'affiches' and public.app_role() = 'admin');

drop policy if exists "affiches_admin_update" on storage.objects;
create policy "affiches_admin_update" on storage.objects
  for update using (bucket_id = 'affiches' and public.app_role() = 'admin');

drop policy if exists "affiches_admin_delete" on storage.objects;
create policy "affiches_admin_delete" on storage.objects
  for delete using (bucket_id = 'affiches' and public.app_role() = 'admin');

-- ---------- 3. Journal des envois ----------
-- Sert l'écran « Valorisations » : « affiches envoyées le … à … ».
create table if not exists public.affiches_mails (
  id              bigserial primary key,
  store_id        text not null references public.stores(id) on delete cascade,
  email           text not null,
  file_path       text not null,
  link_expires_at timestamptz,
  pages           int,
  products        int,
  plans           text,                 -- ex : 'Plan Promo TV + Plan Promo PEM'
  sent_via        text,                 -- 'auto' (fonction Edge) | 'manuel' (messagerie de l'admin)
  sent_at         timestamptz default now(),
  sent_by         uuid references auth.users(id)
);
create index if not exists affiches_mails_store_idx
  on public.affiches_mails (store_id, sent_at desc);

alter table public.affiches_mails enable row level security;

drop policy if exists "affiches_mails_read" on public.affiches_mails;
create policy "affiches_mails_read" on public.affiches_mails
  for select using (
    public.app_role() in ('admin','director') or store_id = public.app_store()
  );

drop policy if exists "affiches_mails_insert" on public.affiches_mails;
create policy "affiches_mails_insert" on public.affiches_mails
  for insert with check (public.app_role() = 'admin');
