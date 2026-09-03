-- 1) Ajout de la colonne pour stocker les préférences de format des magasins
alter table public.stores add column if not exists mail_prefs jsonb default '{}'::jsonb;
