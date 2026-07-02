@echo off
REM ============================================================
REM  translate-pdf-viewer-with-ai  -  Windows dev 起動 (代替手段)
REM ------------------------------------------------------------
REM  推奨はデスクトップのショートカット "translate-pdf dev" です。
REM  この .bat を使う場合の注意:
REM    !! \\wsl.localhost\... (UNCパス) 上に置いたまま実行すると
REM       「UNC パスはサポートされません/アクセスが拒否されました」
REM       となり一瞬で閉じます。
REM    => 必ず Windows ドライブ(例: C:\Users\... やデスクトップ)に
REM       コピーしてから実行してください。
REM
REM  挙動: WSL(Ubuntu) で scripts/win-dev.sh を実行します。
REM    - dev が起動済み  -> その旨を表示し、このディレクトリで
REM                          ターミナルを開くだけ
REM    - dev が未起動    -> npm run dev を起動
REM ============================================================

REM UNC cwd 対策: 作業ディレクトリを安全な Windows パスへ
cd /d "%USERPROFILE%" 2>nul

set "DISTRO=Ubuntu"
set "SCRIPT=/home/kodai_enomoto/personal/translate-pdf-viewer-with-ai/scripts/win-dev.sh"

where wt.exe >nul 2>&1
if %errorlevel%==0 (
  start "" wt.exe --title "translate-pdf dev" wsl.exe -d %DISTRO% -- bash -lic "%SCRIPT%"
) else (
  start "translate-pdf dev" wsl.exe -d %DISTRO% -- bash -lic "%SCRIPT%"
)
