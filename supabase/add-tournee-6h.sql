-- ════════════════════════════════════════════════════════════════
-- Tournée des affiches à 6 h pile (heure de Paris)
-- pg_cron appelle la fonction Edge « cron-auto-run » à 4 h et 5 h UTC
-- (heure d'été / d'hiver) ; la fonction ne lance la tournée qu'à 6 h à Paris.
-- Déjà appliqué sur le projet ; conservé ici pour une réinstallation.
-- ════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- jetons à usage unique (lus et supprimés par la fonction, en service_role)
create table if not exists public.cron_tokens (
  token text primary key,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.cron_tokens enable row level security;   -- aucune politique : invisible pour anon / authenticated

create or replace function public.new_cron_token() returns text
language plpgsql security definer set search_path = public as $$
declare t text := gen_random_uuid()::text;
begin
  delete from public.cron_tokens where expires_at < now();
  insert into public.cron_tokens (token) values (t);
  return t;
end $$;
revoke all on function public.new_cron_token() from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname in ('tournee-affiches-4h-utc', 'tournee-affiches-5h-utc');
select cron.schedule(j.name, j.spec, $job$
  select net.http_post(
    url := 'https://wtqqjsfctyzgawfgjfvf.supabase.co/functions/v1/cron-auto-run',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', public.new_cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$job$)
from (values ('tournee-affiches-4h-utc', '0 4 * * *'), ('tournee-affiches-5h-utc', '0 5 * * *')) as j(name, spec);
