-- ============================================================
--  ENVOI AUTOMATIQUE DES AFFICHES — opérations commerciales,
--  historique des affiches envoyées, journal des tournées
--  ------------------------------------------------------------
--  · operations      : périodes saisies par l'administrateur (nom, du, au,
--                      masque des offres PROMO, masque des offres BON PLAN)
--  · auto_sent       : chaque affiche déjà envoyée à un magasin (clé
--                      plan + EAN + période + prix) — une offre reprise à
--                      l'identique d'un plan promo à l'autre ne repart jamais
--  · auto_runs       : une ligne par tournée (quotidienne ou manuelle)
--  · campagne_mails  : deux colonnes en plus (envoi auto, opérations)
--  Réglages : app_settings, clé « auto » (activation, date de mise en
--  service, adresse d'alerte, papier, objet, message).
--
--  À exécuter UNE FOIS dans Supabase : SQL Editor -> coller -> Run.
--  (Nécessite schema.sql et add-campagne-mail.sql.)
-- ============================================================

-- ---------- 1. Opérations commerciales ----------
create table if not exists public.operations (
  id            bigserial primary key,
  name          text not null,
  date_from     date not null,
  date_to       date not null,
  mask_promo    text not null default 'promo',     -- 'promo' | 'bonplan' | id d'un masque perso
  mask_bonplan  text not null default 'bonplan',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  updated_by    uuid references auth.users(id) on delete set null,
  constraint operations_dates_chk check (date_to >= date_from)
);
create index if not exists operations_dates_idx on public.operations (date_from, date_to);

alter table public.operations enable row level security;

drop policy if exists "operations_admin_all" on public.operations;
create policy "operations_admin_all" on public.operations
  for all using (public.app_role() = 'admin')
         with check (public.app_role() = 'admin');

-- ---------- 2. Affiches déjà envoyées ----------
create table if not exists public.auto_sent (
  id            bigserial primary key,
  store_id      text not null references public.stores(id) on delete cascade,
  plan          text not null,                     -- 'tv' | 'pem'
  ean           text not null,
  date_from     date,
  date_to       date,
  price         numeric(10,2),
  sent_key      text not null,                     -- plan|ean|du|au|prix
  mask          text,
  operation_id  bigint references public.operations(id) on delete set null,
  sent_at       timestamptz default now(),
  unique (store_id, sent_key)
);
create index if not exists auto_sent_store_idx on public.auto_sent (store_id, sent_at desc);

alter table public.auto_sent enable row level security;

drop policy if exists "auto_sent_admin_all" on public.auto_sent;
create policy "auto_sent_admin_all" on public.auto_sent
  for all using (public.app_role() = 'admin')
         with check (public.app_role() = 'admin');

-- ---------- 3. Journal des tournées ----------
create table if not exists public.auto_runs (
  id            bigserial primary key,
  run_date      date not null,
  trigger       text not null default 'cron',      -- 'cron' | 'manuel'
  status        text not null default 'en_cours',  -- 'en_cours' | 'ok' | 'alertes' | 'echec' | 'inactif'
  stores_sent   int default 0,
  affiches      int default 0,
  details       jsonb default '{}'::jsonb,         -- { stores:[…], alerts:[…] }
  started_at    timestamptz default now(),
  finished_at   timestamptz,
  run_by        uuid references auth.users(id) on delete set null
);
create index if not exists auto_runs_date_idx on public.auto_runs (run_date desc, started_at desc);

alter table public.auto_runs enable row level security;

drop policy if exists "auto_runs_admin_all" on public.auto_runs;
create policy "auto_runs_admin_all" on public.auto_runs
  for all using (public.app_role() = 'admin')
         with check (public.app_role() = 'admin');

-- ---------- 4. Journal des mails : envoi auto + opérations ----------
alter table public.campagne_mails add column if not exists auto boolean default false;
alter table public.campagne_mails add column if not exists operations text;
