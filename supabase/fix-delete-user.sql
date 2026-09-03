alter table public.valorisations drop constraint if exists valorisations_updated_by_fkey;
alter table public.valorisations add constraint valorisations_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.affiches_mails drop constraint if exists affiches_mails_sent_by_fkey;
alter table public.affiches_mails add constraint affiches_mails_sent_by_fkey foreign key (sent_by) references auth.users(id) on delete set null;

alter table public.campagne_mails drop constraint if exists campagne_mails_sent_by_fkey;
alter table public.campagne_mails add constraint campagne_mails_sent_by_fkey foreign key (sent_by) references auth.users(id) on delete set null;

alter table public.app_settings drop constraint if exists app_settings_updated_by_fkey;
alter table public.app_settings add constraint app_settings_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;
