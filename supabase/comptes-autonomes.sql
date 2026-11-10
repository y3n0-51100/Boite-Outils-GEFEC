-- ============================================================
--  COMPTES MAGASINS EN AUTONOMIE
--  ------------------------------------------------------------
--  Le magasin crée lui-même son compte depuis la page de connexion
--  (fonction Edge « store-signup ») : nom du magasin, mot de passe,
--  1 à 3 adresses de réception des affiches, valorisation PDF.
--
--  Une fois connecté, le magasin n'a accès qu'à :
--    · l'historique des mails envoyés à ses adresses (campagne_mails) ;
--    · ses adresses de réception (modifiables) ;
--    · l'activation / désactivation de la réception des mails.
--
--  À exécuter UNE FOIS dans Supabase : SQL Editor -> coller -> Run.
--  Idempotent. (Nécessite schema.sql, add-campagne-mail.sql, add-envoi-auto.sql.)
-- ============================================================

-- ---------- 1. Adresses de réception (1 à 3) + interrupteur ----------
alter table public.stores add column if not exists emails text[] not null default '{}';
alter table public.stores add column if not exists mail_enabled boolean not null default true;

alter table public.stores drop constraint if exists stores_emails_max3;
alter table public.stores add constraint stores_emails_max3
  check (coalesce(array_length(emails, 1), 0) <= 3);

-- ---------- 2. Le magasin ne modifie plus sa fiche directement ----------
-- La policy « stores_self_update » laissait le magasin réécrire toute sa
-- ligne (nom, région…). On la remplace par une fonction qui ne touche QUE
-- les adresses et l'interrupteur, après contrôle.
drop policy if exists "stores_self_update" on public.stores;

create or replace function public.set_my_mail_settings(p_emails text[], p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store  text := public.app_store();
  v_clean  text[];
begin
  if public.app_role() <> 'store' or v_store is null then
    raise exception 'Réservé aux comptes magasin.';
  end if;

  -- adresses nettoyées, dédoublonnées, ordre conservé
  select coalesce(array_agg(e order by min_ord), '{}')
    into v_clean
  from (
    select lower(trim(x)) as e, min(ord) as min_ord
    from unnest(coalesce(p_emails, '{}')) with ordinality as t(x, ord)
    where trim(coalesce(x, '')) <> ''
    group by lower(trim(x))
  ) s;

  if coalesce(array_length(v_clean, 1), 0) = 0 then
    raise exception 'Au moins une adresse e-mail est requise.';
  end if;
  if array_length(v_clean, 1) > 3 then
    raise exception 'Trois adresses e-mail au maximum.';
  end if;
  if exists (select 1 from unnest(v_clean) e where e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Adresse e-mail invalide.';
  end if;

  update public.stores
     set emails = v_clean,
         mail_enabled = coalesce(p_enabled, true)
   where id = v_store;
end;
$$;

revoke all on function public.set_my_mail_settings(text[], boolean) from public;
grant execute on function public.set_my_mail_settings(text[], boolean) to authenticated;

-- ---------- 3. Historique : le magasin lit ses propres mails ----------
-- (policy déjà posée par add-campagne-mail.sql, rappelée ici)
drop policy if exists "campagne_mails_read" on public.campagne_mails;
create policy "campagne_mails_read" on public.campagne_mails
  for select using (
    public.app_role() in ('admin','director') or store_id = public.app_store()
  );
