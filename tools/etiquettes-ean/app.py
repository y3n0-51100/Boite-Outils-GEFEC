# -*- coding: utf-8 -*-
"""
Étiquettes EAN — Douchette virtuelle NOSICA (interface premium)
================================================================

Même moteur que `etiquette_ean.py` (extraction PDF PyMuPDF + saisie type
douchette via pyautogui), mais habillé d'une interface web embarquée
(pywebview / WebView2) : fond animé, code-barres 3D, assistant pas-à-pas.

Le Python ne fait que la « plomberie » (lire les PDF, piloter le clavier) ;
toute la mise en scène est dans le dossier `web/`.
"""

import os
import sys
import threading
import time

# --- Moteur métier (extraction + validation), réutilisé tel quel -------------
from etiquette_ean import (
    read_pdf_text_ex,
    extract_eans_from_text,
    DEFAULT_LENGTHS,
)

APP_TITLE = "Étiquettes EAN — Douchette virtuelle"


def resource_path(rel: str) -> str:
    """Chemin d'une ressource, qu'on tourne en script ou en .exe PyInstaller."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, rel)


# =============================================================================
#  Pont JavaScript  <->  Python
# =============================================================================
class Api:
    def __init__(self):
        self.window = None
        self.codes = []
        self.button_pos = None
        self._stop = False
        self._pause = False
        self._sending = False
        self.progress = {
            "running": False, "done": False, "aborted": False,
            "index": 0, "total": 0, "current": "", "phase": "idle",
        }

    # ---- Sélection de fichiers (boîte de dialogue native) -------------------
    def choose_pdfs(self):
        import webview
        paths = self.window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=True,
            file_types=("Fichiers PDF (*.pdf)", "Tous les fichiers (*.*)"))
        return {"files": list(paths) if paths else []}

    # ---- Extraction des codes d'un ou plusieurs PDF ------------------------
    def extract(self, paths, validate_checksum=True, dedupe=True):
        all_codes, seen, errors = [], set(), []
        total_pages, empty_pages = 0, 0
        for p in paths:
            try:
                text, n_pages, n_empty = read_pdf_text_ex(p)
                codes = extract_eans_from_text(
                    text, lengths=DEFAULT_LENGTHS,
                    validate_checksum=validate_checksum, dedupe=False)
            except Exception as e:
                errors.append(f"{os.path.basename(p)} : {e}")
                continue
            total_pages += n_pages
            empty_pages += n_empty
            for code in codes:
                if dedupe and code in seen:
                    continue
                seen.add(code)
                all_codes.append(code)
        self.codes = all_codes
        return {
            "codes": all_codes, "count": len(all_codes),
            "pages": total_pages, "empty": empty_pages, "errors": errors,
        }

    def set_codes(self, codes):
        self.codes = [c for c in codes if c]
        return {"count": len(self.codes)}

    # ---- Capture de la position du bouton « Ajouter dans la liste » --------
    def capture_button(self):
        import pyautogui
        x, y = pyautogui.position()
        self.button_pos = (int(x), int(y))
        return {"x": int(x), "y": int(y)}

    # ---- Envoi (douchette virtuelle) ---------------------------------------
    def start(self, opts):
        if self._sending:
            return {"ok": False, "msg": "Déjà en cours."}
        codes = list(self.codes)
        if not codes:
            return {"ok": False, "msg": "Aucun code à saisir."}
        mode = opts.get("mode", "enter")
        if mode == "button" and not self.button_pos:
            return {"ok": False, "msg": "Position du bouton non enregistrée."}
        self._stop = False
        self._pause = False
        self._sending = True
        self.progress = {
            "running": True, "done": False, "aborted": False,
            "index": 0, "total": len(codes), "current": "", "phase": "sending",
            "ok_count": 0, "skipped": 0, "skipped_list": [],
        }
        t = threading.Thread(target=self._worker, args=(codes, opts), daemon=True)
        t.start()
        return {"ok": True}

    def _worker(self, codes, opts):
        import re as _re
        import ctypes
        import pyautogui
        try:
            import pyperclip
            _have_clip = True
        except Exception:
            _have_clip = False
        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0
        user32 = ctypes.windll.user32 if os.name == "nt" else None

        def esc():
            return bool(user32.GetAsyncKeyState(0x1B) & 0x8000) if user32 else False

        def digits(s):
            return _re.sub(r"\D", "", s or "")

        delay = max(0, int(opts.get("delay_ms", 400))) / 1000.0
        key_int = max(0, int(opts.get("key_int_ms", 15))) / 1000.0
        mode = opts.get("mode", "enter")
        bpos = self.button_pos
        # Saisie sécurisée : coller (presse-papier) puis relire et vérifier le
        # contenu avant de valider. Aucun code n'est ajouté s'il n'est pas
        # confirmé exact -> on n'envoie jamais de code corrompu à NOSICA.
        secure = bool(opts.get("secure", True)) and _have_clip
        retries = max(0, int(opts.get("retries", 2)))

        clip_backup = ""
        if _have_clip:
            try:
                clip_backup = pyperclip.paste()
            except Exception:
                clip_backup = ""

        def put_code(code):
            """Saisit `code` dans le champ. Renvoie True si confirmé exact."""
            # 1) vider le champ
            pyautogui.hotkey("ctrl", "a")
            pyautogui.press("delete")
            # 2) saisir
            if secure:
                pyperclip.copy(code)
                time.sleep(0.03)
                pyautogui.hotkey("ctrl", "v")
            else:
                pyautogui.write(code, interval=key_int)
            time.sleep(0.06)
            # 3) vérifier en relisant le champ (sélection -> copie -> comparaison)
            if not secure:
                return True
            pyautogui.hotkey("ctrl", "a")
            pyautogui.hotkey("ctrl", "c")
            time.sleep(0.04)
            try:
                got = digits(pyperclip.paste())
            except Exception:
                got = ""
            ok = (got == code) or (got.lstrip("0") == code.lstrip("0") and got != "")
            if ok:
                pyautogui.press("end")  # déselectionner, curseur en fin
            return ok

        ok_count = 0
        skipped = []
        try:
            for i, code in enumerate(codes, start=1):
                if self._stop or esc():
                    break
                while self._pause and not self._stop:
                    time.sleep(0.08)
                if self._stop or esc():
                    break

                confirmed = False
                for _ in range(retries + 1):
                    if self._stop or esc():
                        break
                    if put_code(code):
                        confirmed = True
                        break
                    time.sleep(0.12)  # laisser le champ se stabiliser avant retry

                if confirmed:
                    if mode == "button" and bpos:
                        pyautogui.click(bpos[0], bpos[1])
                    else:
                        pyautogui.press("enter")
                    ok_count += 1
                else:
                    # On NE valide PAS : pas de code douteux envoyé à NOSICA.
                    skipped.append(code)

                self.progress.update(index=i, current=code, ok_count=ok_count,
                                     skipped=len(skipped), skipped_list=skipped[-50:])
                waited = 0.0
                while waited < delay:
                    if self._stop or esc():
                        break
                    time.sleep(0.04)
                    waited += 0.04
        finally:
            if _have_clip:
                try:
                    pyperclip.copy(clip_backup)
                except Exception:
                    pass
            aborted = self._stop or esc()
            self._sending = False
            self.progress.update(running=False, done=not aborted, aborted=aborted,
                                 phase="done", ok_count=ok_count,
                                 skipped=len(skipped), skipped_list=skipped)

    def poll(self):
        return self.progress

    def pause(self):
        self._pause = not self._pause
        self.progress["phase"] = "paused" if self._pause else "sending"
        return {"paused": self._pause}

    def stop(self):
        self._stop = True
        return {"ok": True}

    def quit(self):
        if self.window:
            self.window.destroy()
        return {"ok": True}


def main():
    try:
        import webview
    except Exception as e:  # pragma: no cover
        sys.stderr.write(f"pywebview manquant : {e}\n")
        return
    api = Api()
    window = webview.create_window(
        APP_TITLE,
        url=resource_path(os.path.join("web", "index.html")),
        js_api=api,
        width=1180, height=820, min_size=(960, 680),
        background_color="#0a0b10", text_select=False,
    )
    api.window = window
    webview.start(debug=False)


if __name__ == "__main__":
    main()
