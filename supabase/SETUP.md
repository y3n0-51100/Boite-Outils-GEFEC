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

## 6. Le mail « vos affiches sont prêtes » (facultatif mais recommandé)

Permet à l'administrateur d'envoyer au directeur d'un magasin, en un clic, le
PDF de **toutes** les affiches de ce magasin (bouton **✉️ Affiches** dans
📂 Valorisations). Le directeur reçoit un lien : il clique, le PDF se télécharge.

### 6.1 Le schéma
**SQL Editor → New query** → coller [`add-affiches-mail.sql`](./add-affiches-mail.sql)
→ **Run**. Cela ajoute l'adresse mail sur la fiche magasin, le bucket privé
`affiches` et le journal des envois.

### 6.2 La fonction d'envoi
**Edge Functions → Deploy a new function**, nom `send-affiches-mail`, coller
[`functions/send-affiches-mail/index.ts`](./functions/send-affiches-mail/index.ts)
→ **Deploy**. (En CLI : `supabase functions deploy send-affiches-mail --project-ref <ref>`.)

### 6.3 Par où les mails partent
Dans **Edge Functions → Secrets**. `MAIL_FROM` est **toujours** requis ; pour le
reste, **une seule des trois voies suffit** — la première configurée l'emporte.

**Voie 1 — votre messagerie existante (aucun compte à créer, aucun domaine).**
C'est la plus simple, et les magasins reçoivent le mail depuis une adresse
qu'ils connaissent déjà.

| Secret | Valeur |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` (Gmail) · `smtp-mail.outlook.com` (Outlook) · le serveur de la centrale |
| `SMTP_PORT` | `465` (TLS direct, par défaut) ou `587` (STARTTLS) |
| `SMTP_USER` | l'adresse du compte, ex : `remi.schaff@gmail.com` |
| `SMTP_PASS` | un **mot de passe d'application**, jamais le mot de passe du compte |
| `MAIL_FROM` | ex : `Boîte à Outils GEFEC <remi.schaff@gmail.com>` |

> Gmail : la double authentification doit être active, puis
> [créer un mot de passe d'application](https://myaccount.google.com/apppasswords)
> (16 caractères) à coller dans `SMTP_PASS`. Limite ~500 envois/jour, très
> au-delà des 16 magasins.

**Voie 2 — Brevo** (`BREVO_API_KEY`) : 300 mails/jour gratuits, un simple
expéditeur validé par clic suffit, pas de domaine exigé.

**Voie 3 — Resend** (`RESEND_API_KEY`) : 3 000 mails/mois, mais l'envoi vers des
destinataires quelconques réclame un **domaine vérifié**.

`MAIL_REPLY_TO` est facultatif partout (adresse de réponse).

**Sans aucun de ces secrets, rien ne casse** : l'outil génère quand même le PDF
et le lien, puis ouvre le message tout rédigé dans la messagerie de
l'administrateur, qui n'a plus qu'à l'envoyer. C'est un dépannage, pas le mode
normal — et seul l'envoi groupé aux 16 magasins exige une vraie voie d'envoi.

### 6.4 Les adresses des directeurs
Elles ne sont pas dans les comptes (les identifiants de connexion utilisent un
domaine interne, `@gefec.local`). L'adresse réelle est demandée **au premier
envoi** pour chaque magasin, puis mémorisée sur sa fiche.

---

## 7. L'outil « ✉️ Envoi Campagne Mail » (administrateur)

L'administrateur ouvre l'outil, voit **tous les magasins en liste**, et pour
chacun un bouton. Un clic et l'outil, seul : il contrôle que la valorisation du
magasin a **moins de 20 jours**, croise les plans promo publiés avec cette
valorisation, fabrique **un PDF d'affiches par plan** (Plan Promo TV et Plan
Promo PEM) et envoie le mail au magasin, **les deux PDF en pièces jointes**.
Aucune messagerie tierce : tout part de l'outil.

### 7.1 Le schéma
**SQL Editor → New query** → coller [`add-campagne-mail.sql`](./add-campagne-mail.sql)
→ **Run**. Cela ajoute :
- `stores.email` — l'adresse de chaque magasin (une par magasin, jamais générique) ;
- `app_settings` — les réglages d'envoi, dont **l'adresse d'expédition** ;
- `campagne_mails` — le journal des campagnes envoyées ;
- le bucket privé `affiches` et ses règles (il peut déjà exister).

### 7.2 La fonction d'envoi
**Edge Functions → Deploy a new function**, nom `send-campagne-mail`, coller
[`functions/send-campagne-mail/index.ts`](./functions/send-campagne-mail/index.ts)
→ **Deploy**. (En CLI : `supabase functions deploy send-campagne-mail --project-ref <ref>`.)

C'est elle qui relit les PDF dans le bucket et les attache au mail : les
mégaoctets ne repassent jamais par le navigateur de l'administrateur.

### 7.3 Par où les mails partent
**Exactement les mêmes secrets qu'à l'étape 6.3** (`SMTP_HOST` / `SMTP_PORT` /
`SMTP_USER` / `SMTP_PASS`, ou `BREVO_API_KEY`, ou `RESEND_API_KEY`) : si l'étape 6
est déjà faite, il n'y a **rien à ajouter**. Contrairement au mail « affiches
prêtes », il n'y a pas de repli sur la messagerie de l'administrateur : une
campagne avec pièces jointes part de l'outil ou ne part pas.

### 7.4 L'adresse d'expédition, réglée depuis l'interface
Dans **⚙️ Réglages → « Envoi des campagnes mail »** : nom de l'expéditeur,
**adresse d'expédition**, adresse de réponse, objet et message par défaut. Ces
valeurs sont enregistrées dans `app_settings` et lues par la fonction — les
changer ne demande **aucun redéploiement**. Le secret `MAIL_FROM` ne sert plus
que de repli si le champ est laissé vide.

> Avec une voie **SMTP**, l'adresse d'expédition doit être celle du compte SMTP
> configuré (`SMTP_USER`) : les serveurs refusent d'expédier au nom d'une autre.

Le bouton **« ✉️ Envoyer un test »**, juste à côté, envoie un vrai mail sans
pièce jointe : de quoi valider la voie d'envoi et l'expéditeur avant de lancer
une campagne sur les 16 magasins.

### 7.5 Les adresses des magasins
Elles se saisissent **dans l'outil**, sur la ligne de chaque magasin, et sont
mémorisées sur sa fiche (`stores.email`). Un magasin sans adresse reste visible
mais sort de l'envoi groupé.

---

## Ce que vous me transmettez ensuite
- **Project URL**
- **anon public key**

Avec ça, je câble dans l'outil : l'écran de connexion, le chargement/sauvegarde
automatique de la valorisation par magasin, et l'onglet **Réglages admin**
(création des 16 magasins + 2 directeurs, vue sur toutes les valorisations).

> La clé `service_role` (Project Settings → API) ne doit **jamais** être copiée dans
> le site : elle ne sert qu'à la fonction Edge. Ne me la transmettez pas.
