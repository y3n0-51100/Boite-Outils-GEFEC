@echo off
REM ============================================================================
REM  Construction de l'exécutable autonome EtiquettesEAN.exe (Windows)
REM  Double-cliquez sur ce fichier, ou lancez-le depuis une invite de commandes.
REM  Pre-requis : Python 3.11+ installe (https://www.python.org/downloads/)
REM ============================================================================
setlocal
cd /d "%~dp0"

echo [1/3] Installation des dependances...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 goto :err

echo [2/3] Construction de l'executable...
python -m PyInstaller --noconfirm --onefile --windowed ^
  --name EtiquettesEAN ^
  --add-data "web;web" ^
  --collect-all webview ^
  --collect-all pyautogui ^
  --collect-all pyperclip ^
  --collect-all pymupdf ^
  --collect-all pypdf ^
  app.py
if errorlevel 1 goto :err

echo [3/3] Copie de l'executable a la racine du depot...
copy /Y "dist\EtiquettesEAN.exe" "..\..\EtiquettesEAN.exe"

echo.
echo ====================================================
echo  Termine ! Fichier genere : dist\EtiquettesEAN.exe
echo ====================================================
pause
exit /b 0

:err
echo.
echo *** Une erreur est survenue. Verifiez que Python est installe. ***
pause
exit /b 1
