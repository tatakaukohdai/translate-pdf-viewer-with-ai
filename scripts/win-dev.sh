#!/usr/bin/env bash
#
# Windows のワンクリック起動から呼ばれる本体スクリプト。
# - すでに dev サーバー(vite:5173 / api:3000)が起動済みなら、その旨を表示して
#   このディレクトリで対話シェルを開くだけ。
# - 未起動なら `npm run dev` を実行する。
#
# 直接 WSL から実行しても動く。

# プロジェクトルートへ移動（このスクリプトの1つ上）
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

GREEN=$'\e[32m'; YELLOW=$'\e[33m'; CYAN=$'\e[36m'; BOLD=$'\e[1m'; RESET=$'\e[0m'

is_running() {
  # vite(5173) または api(3000) が LISTEN していれば起動済みとみなす
  ss -tln 2>/dev/null | grep -qE ':(5173|3000)\b'
}

print_box() {
  echo "$1"
  echo "=================================================="
}

if is_running; then
  echo "${YELLOW}=================================================="
  echo " ${BOLD}開発サーバーは既に起動済みです${RESET}${YELLOW}"
  echo "=================================================="
  echo "${RESET}"
  echo "  Frontend : ${CYAN}http://localhost:5173${RESET}"
  echo "  API      : ${CYAN}http://localhost:3000${RESET}"
  echo ""
  echo "  新しく起動はしません。"
  echo "  このディレクトリ(${PROJECT_DIR})でターミナルを開きました。"
  echo ""
  # この場所で対話シェルに入る（ウィンドウは開いたまま）
  exec bash
else
  echo "${GREEN}=================================================="
  echo " ${BOLD}開発サーバーを起動します...${RESET}${GREEN}"
  echo "=================================================="
  echo "${RESET}"
  echo "  Frontend : ${CYAN}http://localhost:5173${RESET}"
  echo "  API      : ${CYAN}http://localhost:3000${RESET}"
  echo ""
  echo "  停止するには Ctrl+C を押してください。"
  echo ""

  npm run dev

  echo ""
  echo "${YELLOW}[開発サーバーが終了しました]${RESET} このウィンドウは開いたままです。"
  exec bash
fi
