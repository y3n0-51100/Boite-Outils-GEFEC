# Mise en place du backend Supabase (gratuit)

Objectif : connexion par magasin, stockage des valorisations dans le cloud, et
accès « tout magasin » pour l'admin + les directeurs régionaux. Tout est gratuit
(plan Free de Supabase, sans carte bancaire).

Rôles : **admin** (Rémi), **director** (2 directeurs régionaux, voient tout),
**store** (16 magasins, voient seulement leur valorisation).

---

## 1. Créer le projet Supabase
1. Aller sur https://supabase.com → **Start your project** → se connecter (GitHub).
2. **New project** : nom `gefec`, mot de passe base de données (à garder), région
   **EU (Paris ou Francfort)**. Attendre ~2 min la création.
3. Dans **Project Settings → API**, noter :
   - **Project URL** (ex : `https://xxxx.supabase.co`)
   - **anon public** key (clé publique, sans danger à mettre dans le site)

   👉 **Ce sont ces deux valeurs qu'il faut me transmettre** pour câbler l'interface.

## 2. Créer le schéma + les règles de sécurité
1. Menu **SQL Editor → New query**.
2. Coller tout le contenu de [`schema.sql`](./schema.sql) → **Run**.
   (Crée les tables, les règles d'accès et le bucket privé `valorisations`.)

## 3. Créer le compte administrateur
1. Menu **Authentication → Users → Add user → Create new user**.
   - Email : `admin@gefec.local`
   - Password : `Remi51100$$`
   - Cocher **Auto Confirm User**.
2. Retourner dans **SQL Editor**, exécuter (bloc « BOOTSTRAP » en bas de `schema.sql`) :
   ```sql
   insert into public.profiles (user_id, username, role, display_name)
   select id, 'admin', 'admin', 'Administrateur'
   from auth.users where email = 'admin@gefec.local'
   on conflict (user_id) do update set role = 'admin';
   ```

## 4. Déployer la fonction de création de comptes
Cette fonction permet à l'admin de créer les comptes magasins **depuis l'onglet
Réglages** (la clé secrète `service_role` reste côté serveur, jamais dans le site).

**Option A — via l'interface web (le plus simple)**
1. Menu **Edge Functions → Deploy a new function** (éditeur dans le navigateur).
2. Nom : `admin-create-user`.
3. Coller le contenu de
   [`functions/admin-create-user/index.ts`](./functions/admin-create-user/index.ts) → **Deploy**.

**Option B — via la CLI** (si vous l'utilisez)
```bash
supabase functions deploy admin-create-user --project-ref <ref-du-projet>
```

> Les variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`
> sont fournies **automatiquement** à la fonction — rien à configurer.

## 5. Autoriser le site (CORS / URL)
Dans **Authentication → URL Configuration**, ajouter l'URL du site GitHub Pages
dans **Site URL** et **Redirect URLs** (ex : `https://<vous>.github.io/Boite-Outils-GEFEC/`).

---

## Ce que vous me transmettez ensuite
- **Project URL**
- **anon public key**

Avec ça, je câble dans l'outil : l'écran de connexion, le chargement/sauvegarde
automatique de la valorisation par magasin, et l'onglet **Réglages admin**
(création des 16 magasins + 2 directeurs, vue sur toutes les valorisations).

> La clé `service_role` (Project Settings → API) ne doit **jamais** être copiée dans
> le site : elle ne sert qu'à la fonction Edge. Ne me la transmettez pas.
