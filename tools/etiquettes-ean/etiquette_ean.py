# -*- coding: utf-8 -*-
"""
Étiquettes EAN — Douchette virtuelle pour NOSICA
=================================================

Outil autonome (Windows) pour le magasin BUT.

Principe : NOSICA ne permet pas d'importer une liste de codes EAN. Pour créer
des étiquettes, il faut saisir chaque EAN à la main dans la case « code », puis
cliquer sur « Ajouter dans la liste ». Une vraie douchette code-barres n'est
rien d'autre qu'un clavier qui tape le code suivi de « Entrée ». Cet outil
reproduit exactement ce comportement :

  1. On dépose un (ou plusieurs) PDF contenant plein de codes EAN.
  2. L'outil extrait automatiquement tous les codes du PDF.
  3. On clique une fois dans la case « code » de NOSICA.
  4. L'outil « tape » chaque code l'un après l'autre, comme une douchette,
     en validant à chaque fois (Entrée) ou en cliquant sur le bouton
     « Ajouter dans la liste » à une position enregistrée.

Aucune donnée ne quitte le poste : tout se passe en local.

------------------------------------------------------------------------------
Le code est volontairement séparé en deux couches :
  - une couche « extraction PDF » 100 % standard (testable hors Windows) ;
  - une couche « interface + automatisation clavier/souris » (Windows).
Cela permet de tester l'extraction n'importe où :  python etiquette_ean.py --selftest
------------------------------------------------------------------------------
"""

import re
import sys
import threading
import time

APP_NAME = "Étiquettes EAN — Douchette virtuelle NOSICA"
APP_VERSION = "1.0"

# Longueurs de codes acceptées par défaut. On se limite à l'EAN-13 (standard
# du commerce de détail français / BUT) : c'est le plus sûr pour une saisie
# autonome, car cela évite d'attraper par erreur des fragments de prix, de
# références internes ou de numéros de téléphone. Les autres longueurs (UPC-A,
# EAN-8, GTIN-14) restent gérées par le moteur si on les passe explicitement.
DEFAULT_LENGTHS = (13,)


# =============================================================================
#  COUCHE 1 — Extraction des codes EAN depuis un PDF (sans dépendance Windows)
# =============================================================================

def ean_check_digit(body: str) -> str:
    """Calcule la clé de contrôle GTIN/EAN d'un corps de chiffres (sans la clé)."""
    digits = [int(c) for c in body][::-1]
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(digits))
    return str((10 - (total % 10)) % 10)


def make_ean13(body12: str) -> str:
    """Construit un EAN-13 valide à partir de 12 chiffres."""
    return body12 + ean_check_digit(body12)


def ean_checksum_ok(code: str) -> bool:
    """Vérifie la clé de contrôle GTIN/EAN (EAN-8, UPC-A, EAN-13, GTIN-14).

    La somme pondérée 3-1 des chiffres (de droite à gauche, hors clé) plus la
    clé doit être un multiple de 10. Permet d'écarter les nombres parasites
    (prix, références internes, numéros de téléphone…)."""
    if not code.isdigit() or len(code) not in (8, 12, 13, 14):
        return False
    digits = [int(c) for c in code]
    check = digits[-1]
    body = digits[:-1][::-1]  # de droite à gauche, en partant du chiffre juste avant la clé
    total = 0
    for i, d in enumerate(body):
        total += d * (3 if i % 2 == 0 else 1)
    calc = (10 - (total % 10)) % 10
    return calc == check


def extract_eans_from_text(text: str, lengths=DEFAULT_LENGTHS,
                           validate_checksum=True, dedupe=True):
    """Extrait les codes EAN d'un texte brut.

    On repère toutes les suites de chiffres, puis on garde celles dont la
    longueur est acceptée et (option) dont la clé de contrôle est valide.
    L'ordre d'apparition dans le document est conservé.
    """
    found = []
    seen = set()
    # On capture les suites de chiffres pouvant être séparées par espaces/tirets
    # dans le PDF (ex : "3 660970 123456"), puis on recolle.
    for raw in re.findall(r"\d[\d\s\-\.]{6,}\d", text):
        candidate = re.sub(r"[\s\-\.]", "", raw)
        # Une même suite « collée » peut contenir un EAN-13 et déborder ;
        # on teste plusieurs longueurs en partant de la plus longue.
        if not candidate.isdigit():
            continue
        matched = _match_candidate(candidate, lengths, validate_checksum)
        for code in matched:
            if dedupe and code in seen:
                continue
            seen.add(code)
            found.append(code)
    return found


def _match_candidate(candidate, lengths, validate_checksum):
    """Retourne le(s) code(s) valides extraits d'une longue suite de chiffres."""
    out = []
    sorted_lengths = sorted(set(lengths), reverse=True)
    # Cas simple : la suite a exactement une longueur acceptée.
    if len(candidate) in sorted_lengths:
        if (not validate_checksum) or ean_checksum_ok(candidate):
            return [candidate]
    # Cas « collé » : on glisse une fenêtre pour retrouver des EAN valides.
    if validate_checksum:
        i = 0
        n = len(candidate)
        while i < n:
            hit = None
            for L in sorted_lengths:
                if i + L <= n and ean_checksum_ok(candidate[i:i + L]):
                    hit = L
                    break
            if hit:
                out.append(candidate[i:i + hit])
                i += hit
            else:
                i += 1
    return out


def read_pdf_text(path: str) -> str:
    """Extrait tout le texte d'un PDF avec pypdf."""
    from pypdf import PdfReader
    reader = PdfReader(path)
    parts = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            parts.append("")
    return "\n".join(parts)


def extract_eans_from_pdf(path: str, **kwargs):
    return extract_eans_from_text(read_pdf_text(path), **kwargs)


# =============================================================================
#  COUCHE 2 — Interface graphique + automatisation (Windows)
# =============================================================================

def run_gui():
    import os
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox

    # --- Automatisation clavier/souris (importée à l'exécution) -------------
    try:
        import pyautogui
        pyautogui.FAILSAFE = True   # coin haut-gauche = arrêt d'urgence
        pyautogui.PAUSE = 0
    except Exception as e:          # pragma: no cover
        try:
            root = tk.Tk(); root.withdraw()
            messagebox.showerror(APP_NAME,
                "Le module d'automatisation (pyautogui) est introuvable.\n\n"
                "Si vous utilisez le .exe fourni, contactez Rémi SCHAFFHAUSER.\n\n"
                f"Détail : {e}")
        finally:
            return

    import ctypes
    user32 = ctypes.windll.user32 if os.name == "nt" else None
    VK_ESCAPE = 0x1B

    def escape_pressed():
        """Touche Échap enfoncée (arrêt d'urgence global)."""
        if user32 is None:
            return False
        return bool(user32.GetAsyncKeyState(VK_ESCAPE) & 0x8000)

    # ---------------------------------------------------------------- état
    state = {
        "files": [],          # chemins PDF chargés
        "codes": [],          # codes EAN courants (après extraction/édition)
        "sending": False,     # envoi en cours
        "stop": False,        # demande d'arrêt
        "pause": False,       # pause
        "button_pos": None,   # (x, y) du bouton « Ajouter dans la liste »
    }

    # -------------------------------------------------------------- fenêtre
    root = tk.Tk()
    root.title(f"{APP_NAME}  v{APP_VERSION}")
    root.geometry("760x720")
    root.minsize(720, 660)

    BG = "#f4f6fb"; CARD = "#ffffff"; ACCENT = "#e6071a"; INK = "#1a2233"
    root.configure(bg=BG)

    style = ttk.Style()
    try:
        style.theme_use("clam")
    except Exception:
        pass
    style.configure("TFrame", background=BG)
    style.configure("Card.TFrame", background=CARD)
    style.configure("TLabel", background=CARD, foreground=INK)
    style.configure("Head.TLabel", background=BG, foreground=INK,
                    font=("Segoe UI", 11, "bold"))
    style.configure("Sub.TLabel", background=BG, foreground="#5a6478",
                    font=("Segoe UI", 9))
    style.configure("Accent.TButton", font=("Segoe UI", 10, "bold"))
    style.configure("TButton", font=("Segoe UI", 10))

    def card(parent, title):
        wrap = ttk.Frame(parent, style="TFrame")
        ttk.Label(wrap, text=title, style="Head.TLabel").pack(anchor="w", pady=(0, 4))
        inner = ttk.Frame(wrap, style="Card.TFrame", padding=12)
        inner.pack(fill="x")
        return wrap, inner

    container = ttk.Frame(root, style="TFrame", padding=14)
    container.pack(fill="both", expand=True)

    # En-tête
    header = ttk.Frame(container, style="TFrame")
    header.pack(fill="x", pady=(0, 12))
    ttk.Label(header, text="Étiquettes EAN — Douchette virtuelle",
              style="Head.TLabel", font=("Segoe UI", 14, "bold")).pack(anchor="w")
    ttk.Label(header,
              text="Déposez vos PDF de codes EAN, puis laissez l'outil les saisir dans NOSICA à votre place.",
              style="Sub.TLabel").pack(anchor="w")

    # ---------------------------------------------------- 1. Fichiers PDF
    c1, b1 = card(container, "1 · Fichiers PDF de codes EAN")
    c1.pack(fill="x", pady=(0, 12))

    files_var = tk.StringVar(value="Aucun fichier chargé.")
    ttk.Label(b1, textvariable=files_var, wraplength=680,
              justify="left").pack(anchor="w", pady=(0, 8))

    f1 = ttk.Frame(b1, style="Card.TFrame"); f1.pack(fill="x")

    def refresh_files():
        if state["files"]:
            names = "\n".join("• " + os.path.basename(p) for p in state["files"])
            files_var.set(names)
        else:
            files_var.set("Aucun fichier chargé.")

    def add_files():
        paths = filedialog.askopenfilenames(
            title="Choisir un ou plusieurs PDF",
            filetypes=[("Fichiers PDF", "*.pdf"), ("Tous les fichiers", "*.*")])
        for p in paths:
            if p not in state["files"]:
                state["files"].append(p)
        refresh_files()
        if state["files"]:
            do_extract()

    def clear_files():
        state["files"].clear()
        refresh_files()

    ttk.Button(f1, text="➕ Ajouter des PDF", command=add_files,
               style="Accent.TButton").pack(side="left")
    ttk.Button(f1, text="Vider", command=clear_files).pack(side="left", padx=6)

    # ------------------------------------------------- 2. Codes détectés
    c2, b2 = card(container, "2 · Codes EAN détectés")
    c2.pack(fill="both", expand=True, pady=(0, 12))

    bar = ttk.Frame(b2, style="Card.TFrame"); bar.pack(fill="x", pady=(0, 6))
    count_var = tk.StringVar(value="0 code")
    ttk.Label(bar, textvariable=count_var,
              font=("Segoe UI", 10, "bold")).pack(side="left")

    chk_checksum = tk.BooleanVar(value=True)
    chk_dedupe = tk.BooleanVar(value=True)
    ttk.Checkbutton(bar, text="Valider la clé EAN", variable=chk_checksum,
                    command=lambda: do_extract()).pack(side="right")
    ttk.Checkbutton(bar, text="Supprimer doublons", variable=chk_dedupe,
                    command=lambda: do_extract()).pack(side="right", padx=8)

    txt_frame = ttk.Frame(b2, style="Card.TFrame"); txt_frame.pack(fill="both", expand=True)
    scroll = ttk.Scrollbar(txt_frame)
    scroll.pack(side="right", fill="y")
    codes_text = tk.Text(txt_frame, height=8, font=("Consolas", 11),
                         yscrollcommand=scroll.set, relief="solid", bd=1,
                         wrap="word", bg="#fbfcfe")
    codes_text.pack(side="left", fill="both", expand=True)
    scroll.config(command=codes_text.yview)
    ttk.Label(b2, text="Vous pouvez corriger la liste à la main (un code par ligne).",
              style="Sub.TLabel").pack(anchor="w", pady=(4, 0))

    def sync_codes_from_text():
        raw = codes_text.get("1.0", "end")
        state["codes"] = [re.sub(r"\D", "", ln) for ln in raw.splitlines()
                          if re.sub(r"\D", "", ln)]
        count_var.set(f"{len(state['codes'])} code" + ("s" if len(state['codes']) > 1 else ""))

    codes_text.bind("<KeyRelease>", lambda e: sync_codes_from_text())

    def set_codes(codes):
        state["codes"] = codes
        codes_text.delete("1.0", "end")
        codes_text.insert("1.0", "\n".join(codes))
        count_var.set(f"{len(codes)} code" + ("s" if len(codes) > 1 else ""))

    def do_extract():
        all_codes = []
        seen = set()
        errors = []
        for p in state["files"]:
            try:
                codes = extract_eans_from_pdf(
                    p, lengths=DEFAULT_LENGTHS,
                    validate_checksum=chk_checksum.get(),
                    dedupe=False)
            except Exception as e:
                errors.append(f"{os.path.basename(p)} : {e}")
                continue
            for code in codes:
                if chk_dedupe.get() and code in seen:
                    continue
                seen.add(code)
                all_codes.append(code)
        set_codes(all_codes)
        if errors:
            messagebox.showwarning(APP_NAME,
                "Certains fichiers n'ont pas pu être lus :\n\n" + "\n".join(errors))
        elif not all_codes and state["files"]:
            messagebox.showwarning(APP_NAME,
                "Aucun code EAN détecté dans le(s) PDF.\n\n"
                "Si le PDF est un scan (image), le texte n'est pas lisible : "
                "il faudrait un PDF contenant du texte sélectionnable.\n\n"
                "Vous pouvez aussi décocher « Valider la clé EAN » si vos codes "
                "ne sont pas des EAN standard.")

    # --------------------------------------------- 3. Réglages d'envoi
    c3, b3 = card(container, "3 · Réglages de saisie")
    c3.pack(fill="x", pady=(0, 12))

    grid = ttk.Frame(b3, style="Card.TFrame"); grid.pack(fill="x")
    for col in range(4):
        grid.columnconfigure(col, weight=1)

    # Mode de validation
    ttk.Label(grid, text="Validation après chaque code :").grid(
        row=0, column=0, columnspan=2, sticky="w", pady=4)
    mode_var = tk.StringVar(value="enter")
    ttk.Radiobutton(grid, text="Touche Entrée (douchette)", value="enter",
                    variable=mode_var).grid(row=0, column=2, sticky="w")
    ttk.Radiobutton(grid, text="Clic sur le bouton", value="button",
                    variable=mode_var).grid(row=0, column=3, sticky="w")

    # Capture position bouton
    btnpos_var = tk.StringVar(value="Position du bouton : non enregistrée")
    ttk.Label(grid, textvariable=btnpos_var, style="TLabel").grid(
        row=1, column=0, columnspan=2, sticky="w", pady=4)

    def capture_button():
        win = tk.Toplevel(root); win.title("Capture")
        win.configure(bg="#111"); win.attributes("-topmost", True)
        msg = tk.Label(win, fg="#fff", bg="#111", font=("Segoe UI", 12),
                       padx=20, pady=20, justify="center")
        msg.pack()
        countdown = {"n": 5}

        def tick():
            if countdown["n"] <= 0:
                x, y = pyautogui.position()
                state["button_pos"] = (x, y)
                btnpos_var.set(f"Position du bouton : x={x}, y={y}")
                win.destroy()
                return
            msg.config(text="Placez la souris SUR le bouton\n"
                            "« Ajouter dans la liste » de NOSICA.\n\n"
                            f"Capture dans {countdown['n']} s…")
            countdown["n"] -= 1
            win.after(1000, tick)
        tick()

    ttk.Button(grid, text="🎯 Enregistrer la position du bouton",
               command=capture_button).grid(row=1, column=2, columnspan=2, sticky="we", pady=4)

    # Délais
    ttk.Label(grid, text="Délai entre 2 codes (ms) :").grid(
        row=2, column=0, sticky="w", pady=4)
    delay_var = tk.IntVar(value=400)
    ttk.Spinbox(grid, from_=0, to=5000, increment=50, textvariable=delay_var,
                width=8).grid(row=2, column=1, sticky="w")

    ttk.Label(grid, text="Vitesse de frappe (ms/car.) :").grid(
        row=2, column=2, sticky="w", pady=4)
    keyint_var = tk.IntVar(value=15)
    ttk.Spinbox(grid, from_=0, to=200, increment=5, textvariable=keyint_var,
                width=8).grid(row=2, column=3, sticky="w")

    ttk.Label(grid, text="Compte à rebours avant départ (s) :").grid(
        row=3, column=0, sticky="w", pady=4)
    cd_var = tk.IntVar(value=5)
    ttk.Spinbox(grid, from_=0, to=15, increment=1, textvariable=cd_var,
                width=8).grid(row=3, column=1, sticky="w")

    clear_field_var = tk.BooleanVar(value=False)
    ttk.Checkbutton(grid, text="Vider la case avant chaque code (Ctrl+A puis Suppr)",
                    variable=clear_field_var).grid(row=3, column=2, columnspan=2, sticky="w")

    # --------------------------------------------------- 4. Envoi
    c4, b4 = card(container, "4 · Lancer la saisie dans NOSICA")
    c4.pack(fill="x")

    ttk.Label(b4, wraplength=680, justify="left", style="TLabel",
              text="Avant de démarrer : ouvrez NOSICA, cliquez UNE FOIS dans la "
                   "case « code » pour y placer le curseur, puis revenez ici et "
                   "cliquez sur Démarrer. Le compte à rebours vous laisse le "
                   "temps de recliquer dans NOSICA.").pack(anchor="w", pady=(0, 8))

    prog = ttk.Progressbar(b4, mode="determinate")
    prog.pack(fill="x", pady=(0, 6))
    status_var = tk.StringVar(value="Prêt.")
    ttk.Label(b4, textvariable=status_var, style="TLabel",
              font=("Segoe UI", 10, "bold")).pack(anchor="w")

    btns = ttk.Frame(b4, style="Card.TFrame"); btns.pack(fill="x", pady=(8, 0))
    start_btn = ttk.Button(btns, text="▶  Démarrer la saisie",
                           style="Accent.TButton")
    start_btn.pack(side="left")
    pause_btn = ttk.Button(btns, text="⏸ Pause", state="disabled")
    pause_btn.pack(side="left", padx=6)
    stop_btn = ttk.Button(btns, text="⏹ Stop", state="disabled")
    stop_btn.pack(side="left")
    ttk.Label(btns, text="Arrêt d'urgence : touche Échap (ou coin haut-gauche de l'écran).",
              style="Sub.TLabel").pack(side="right")

    # ---------------------------------------------------- logique d'envoi
    def set_running(running):
        state["sending"] = running
        start_btn.config(state="disabled" if running else "normal")
        pause_btn.config(state="normal" if running else "disabled")
        stop_btn.config(state="normal" if running else "disabled")

    def worker(codes, delay_ms, key_int_ms, mode, button_pos, clear_field):
        total = len(codes)
        try:
            for idx, code in enumerate(codes, start=1):
                if state["stop"] or escape_pressed():
                    break
                while state["pause"] and not state["stop"]:
                    time.sleep(0.1)
                if state["stop"]:
                    break

                if clear_field:
                    pyautogui.hotkey("ctrl", "a")
                    pyautogui.press("delete")

                pyautogui.write(code, interval=key_int_ms / 1000.0)

                if mode == "button" and button_pos:
                    pyautogui.click(button_pos[0], button_pos[1])
                else:
                    pyautogui.press("enter")

                root.after(0, lambda i=idx, t=total, c=code:
                           (prog.config(value=i * 100.0 / t),
                            status_var.set(f"Code {i}/{t} envoyé : {c}")))

                # délai, en surveillant l'arrêt d'urgence
                waited = 0.0
                step = 0.05
                while waited < delay_ms / 1000.0:
                    if state["stop"] or escape_pressed():
                        break
                    time.sleep(step)
                    waited += step
        finally:
            done = state["stop"] or escape_pressed()
            root.after(0, lambda: finish_sending(aborted=done))

    def finish_sending(aborted):
        set_running(False)
        state["stop"] = False
        state["pause"] = False
        pause_btn.config(text="⏸ Pause")
        if aborted:
            status_var.set("⏹ Arrêté.")
        else:
            status_var.set("✅ Terminé — tous les codes ont été saisis.")
            prog.config(value=100)

    def start_sending():
        sync_codes_from_text()
        codes = list(state["codes"])
        if not codes:
            messagebox.showinfo(APP_NAME, "Aucun code à saisir. Chargez d'abord un PDF.")
            return
        mode = mode_var.get()
        if mode == "button" and not state["button_pos"]:
            messagebox.showwarning(APP_NAME,
                "Mode « Clic sur le bouton » sélectionné mais aucune position "
                "enregistrée.\n\nUtilisez « Enregistrer la position du bouton » "
                "ou choisissez le mode « Touche Entrée ».")
            return
        if not messagebox.askyesno(APP_NAME,
                f"{len(codes)} code(s) vont être saisis automatiquement dans NOSICA.\n\n"
                f"Validation : {'Entrée' if mode == 'enter' else 'Clic sur le bouton'}.\n\n"
                "Après « Oui », cliquez dans la case « code » de NOSICA pendant le "
                "compte à rebours. Touche Échap pour tout arrêter.\n\nDémarrer ?"):
            return

        state["stop"] = False
        state["pause"] = False
        set_running(True)
        delay_ms = max(0, delay_var.get())
        key_int = max(0, keyint_var.get())
        button_pos = state["button_pos"]
        clear_field = clear_field_var.get()

        def countdown_then_run(n):
            if state["stop"]:
                finish_sending(aborted=True)
                return
            if n > 0:
                status_var.set(f"Cliquez dans NOSICA… départ dans {n} s")
                root.after(1000, lambda: countdown_then_run(n - 1))
            else:
                status_var.set("Saisie en cours…")
                t = threading.Thread(
                    target=worker,
                    args=(codes, delay_ms, key_int, mode, button_pos, clear_field),
                    daemon=True)
                t.start()

        countdown_then_run(max(0, cd_var.get()))

    def pause_sending():
        state["pause"] = not state["pause"]
        pause_btn.config(text="▶ Reprendre" if state["pause"] else "⏸ Pause")
        status_var.set("⏸ En pause…" if state["pause"] else "Saisie en cours…")

    def stop_sending():
        state["stop"] = True

    start_btn.config(command=start_sending)
    pause_btn.config(command=pause_sending)
    stop_btn.config(command=stop_sending)

    refresh_files()
    root.mainloop()


# =============================================================================
#  Point d'entrée
# =============================================================================

def _selftest():
    """Test rapide de l'extraction, exécutable n'importe où (sans Windows)."""
    a = make_ean13("366097001020")   # EAN-13 valide
    b = make_ean13("400638133393")   # EAN-13 valide
    sample = (
        f"Article A  {a}   12,99 EUR\n"                 # collé à un prix
        f"Article B  EAN: {b}  prix 5,00\n"             # préfixe + prix
        "Téléphone magasin 01 39 19 00 00 (à ignorer)\n"
        f"Lot collé {a}{b}\n"                            # deux EAN collés
        f"Doublon {a}\n"
    )
    codes = extract_eans_from_text(sample, validate_checksum=True, dedupe=True)
    print("Codes détectés :", codes)
    assert a in codes, f"EAN-13 {a} non détecté"
    assert b in codes, f"EAN-13 {b} non détecté"
    assert codes.count(a) == 1, "déduplication KO"
    assert ean_checksum_ok(a) and ean_checksum_ok(b)
    assert not ean_checksum_ok(a[:-1] + str((int(a[-1]) + 1) % 10))
    print(f"{len(codes)} codes uniques · Self-test OK ✔")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        run_gui()
