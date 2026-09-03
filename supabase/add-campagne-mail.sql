-- ============================================================
--  « ENVOI CAMPAGNE MAIL » — outil administrateur
--  ------------------------------------------------------------
--  L'administrateur ouvre l'outil, voit la liste de TOUS les magasins,
--  et pour chacun un bouton qui : contrôle la valorisation (moins de
--  20 jours), croise les plans promo publiés avec cette valorisation,
--  fabrique UN PDF PAR PLAN (TV et PEM) et envoie le mail au magasin,
--  les deux PDF en pièces jointes. Aucune messagerie tierce.
--
--  À exécuter UNE FOIS dans Supabase : SQL Editor -> coller -> Run.
--  (Nécessite schema.sql pour app_role() / app_store(). Reprend le
--   bucket privé « affiches » et la colonne stores.email s'ils existent
--   déjà — add-affiches-mail.sql peut donc avoir été passé avant ou non.)
-- ============================================================

-- ---------- 1. L'adresse mail du magasin ----------
-- Elle n'est PAS générique : une adresse par magasin, saisie par
-- l'administrateur dans l'outil et mémorisée sur la fiche.
alter table public.stores add column if not exists email text;

drop policy if exists "stores_admin_update" on public.stores;
create policy "stores_admin_update" on public.stores
  for update using (public.app_role() = 'admin')
            with check (public.app_role() = 'admin');

drop policy if exists "stores_self_update" on public.stores;
create policy "stores_self_update" on public.stores
  for update using (public.app_role() = 'store' and id = public.app_store())
            with check (public.app_role() = 'store' and id = public.app_store());

-- ---------- 2. Réglages de l'application (dont l'expéditeur des mails) ----------
-- Une ligne par réglage, la valeur en JSON. La clé « mail » porte
-- l'expéditeur choisi dans ⚙️ Réglages :
--   { from_name, from_email, reply_to, subject, message }
-- La fonction Edge la lit en service_role : l'adresse d'expédition se
-- change donc depuis l'interface, sans redéployer quoi que ce soit.
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now(),
  updated_by  uuid references auth.users(id)
);

alter table public.app_settings enable row level security;

-- Réglages d'administration : lecture ET écriture réservées à l'admin.
drop policy if exists "app_settings_read" on public.app_settings;
create policy "app_settings_read" on public.app_settings
  for select using (public.app_role() = 'admin');

drop policy if exists "app_settings_insert" on public.app_settings;
create policy "app_settings_insert" on public.app_settings
  for insert with check (public.app_role() = 'admin');

drop policy if exists "app_settings_update" on public.app_settings;
create policy "app_settings_update" on public.app_settings
  for update using (public.app_role() = 'admin')
            with check (public.app_role() = 'admin');

-- ---------- 3. Bucket privé des PDF de campagne ----------
-- Les PDF sont déposés sous « <code magasin>/campagne/<plan>.pdf » dans le
-- bucket « affiches » : la fonction Edge les relit côté serveur pour les
-- joindre au mail — ils ne transitent jamais deux fois par le navigateur.
insert into storage.buckets (id, name, public)
values ('affiches', 'affiches', false)
on conflict (id) do nothing;

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

-- ---------- 4. Journal des campagnes envoyées ----------
create table if not exists public.campagne_mails (
  id           bigserial primary key,
  store_id     text not null references public.stores(id) on delete cascade,
  email        text not null,
  subject      text,
  plans        text,                  -- ex : 'Plan Promo TV + Plan Promo PEM'
  files        jsonb,                 -- [{ label, path, pages, products, bytes }]
  pages        int,
  products     int,
  valo_days    int,                   -- âge de la valorisation au moment de l'envoi
  provider     text,                  -- 'smtp' | 'brevo' | 'resend'
  sent_at      timestamptz default now(),
  sent_by      uuid references auth.users(id)
);
create index if not exists campagne_mails_store_idx
  on public.campagne_mails (store_id, sent_at desc);

alter table public.campagne_mails enable row level security;

drop policy if exists "campagne_mails_read" on public.campagne_mails;
create policy "campagne_mails_read" on public.campagne_mails
  for select using (
    public.app_role() in ('admin','director') or store_id = public.app_store()
  );

drop policy if exists "campagne_mails_insert" on public.campagne_mails;
create policy "campagne_mails_insert" on public.campagne_mails
  for insert with check (public.app_role() = 'admin');
