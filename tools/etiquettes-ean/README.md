# Étiquettes EAN — Douchette virtuelle pour NOSICA

Petit logiciel Windows autonome qui **saisit automatiquement des codes EAN dans
NOSICA** à votre place, pour créer des étiquettes, à partir d'un PDF.

NOSICA n'accepte pas l'import d'une liste de codes : il faut taper chaque EAN
dans la case **« code »** puis cliquer sur **« Ajouter dans la liste »**. Une
douchette code-barres n'est rien d'autre qu'un clavier qui tape le code suivi
de « Entrée » : cet outil fait exactement la même chose, mais en lisant les
codes dans un PDF.

> 🔒 **Tout reste sur votre poste.** Le PDF est lu en local, aucune donnée
> n'est envoyée sur Internet.

---

## Utilisation (en magasin)

1. **Lancez** `EtiquettesEAN.exe` (téléchargeable depuis la Boîte à Outils GEFEC).
2. **Ajoutez vos PDF** contenant les codes EAN → l'outil les extrait tout seul
   et affiche la liste (vous pouvez la corriger à la main si besoin).
3. **Ouvrez NOSICA** sur l'écran de création d'étiquettes et **cliquez une fois
   dans la case « code »**.
4. Choisissez la validation :
   - **Touche Entrée (douchette)** — recommandé : comme une vraie douchette, le
     code est tapé puis validé par « Entrée » (qui déclenche en général le
     bouton « Ajouter dans la liste »).
   - **Clic sur le bouton** — si « Entrée » ne suffit pas : cliquez sur
     « Enregistrer la position du bouton », placez la souris sur le bouton
     « Ajouter dans la liste » pendant le compte à rebours. L'outil cliquera
     dessus après chaque code.
5. Cliquez sur **« Démarrer la saisie »**, confirmez, puis **recliquez dans la
   case « code » de NOSICA** pendant le compte à rebours.
6. L'outil saisit tous les codes l'un après l'autre.

### Arrêt d'urgence
- Appuyez sur **Échap** à tout moment, **ou** poussez la souris dans le
  **coin haut-gauche** de l'écran.
- Boutons **Pause / Stop** dans la fenêtre.

### Réglages utiles
- **Délai entre 2 codes** : augmentez-le si NOSICA n'a pas le temps de suivre.
- **Vitesse de frappe** : ms entre chaque chiffre (laissez 15 par défaut).
- **Vider la case avant chaque code** : à cocher seulement si la case ne se
  vide pas toute seule après l'ajout.
- **Valider la clé EAN** : décochez uniquement si vos codes ne sont pas des
  EAN-13 standard et que rien n'est détecté.

---

## Construire le .exe soi-même

Deux possibilités :

### A. Automatique (GitHub Actions) — recommandé
Le dépôt contient un workflow `.github/workflows/build-etiquettes-ean.yml` qui
construit `EtiquettesEAN.exe` sur un poste Windows dans le cloud et le dépose à
la racine du dépôt. Déclenchez-le depuis l'onglet **Actions → Construire
EtiquettesEAN.exe → Run workflow**.

### B. En local (Windows)
Avec [Python 3.11+](https://www.python.org/downloads/) installé, double-cliquez
sur **`build.bat`**. L'exécutable est généré dans `dist\EtiquettesEAN.exe` et
copié à la racine du dépôt.

---

## Détails techniques

- `etiquette_ean.py` — tout le code (interface Tkinter + automatisation).
  - **Couche extraction** (sans dépendance Windows) : lecture du PDF avec
    `pypdf`, repérage des suites de chiffres, validation par la **clé de
    contrôle EAN-13** pour écarter prix et numéros parasites, déduplication.
    Testable partout : `python etiquette_ean.py --selftest`.
  - **Couche automatisation** : `pyautogui` pour « taper » les codes et cliquer ;
    surveillance de la touche Échap via l'API Windows (`GetAsyncKeyState`).
- Par défaut seuls les **EAN-13** sont retenus (standard du commerce de détail).
