# 技術書翻訳ビューワー

英語の技術書PDFを開いて、ページ単位でAI日本語訳を並べて読めるローカルWebアプリ。

- PDFを左ペインに表示、翻訳を右ペインに表示
- 翻訳結果はSQLiteにキャッシュ（同じページは2回目以降即時表示）
- 全翻訳をMarkdownファイルとして保存できる

## 前提条件

- Node.js 18以上
- Claude Code CLI（`npm install -g @anthropic-ai/claude-code`）
- Claude Pro / Max / Team / Enterprise サブスクリプション

## セットアップ

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd translate-pdf-viewer-with-ai

# 2. OAuth トークンを生成（初回のみ・1年間有効）
claude setup-token
# 表示されたトークンをコピーしておく

# 3. 環境変数を設定
cp .env.example .env
# .env を開いて CLAUDE_CODE_OAUTH_TOKEN= の後にトークンを貼り付ける

# 4. 依存パッケージをインストール
npm install
```

## 起動方法

### 開発モード（推奨）

```bash
npm run dev
```

ブラウザで http://localhost:5173 を開く。

ファイルを編集すると自動でリロードされる。

### 本番モード

```bash
npm run build
npm start
```

ブラウザで http://localhost:3000 を開く。

Mac / Linux は `./start.sh` を実行するとインストール・ビルド・起動を一括で行える。

## 使い方

1. **「PDF を開く」** でPDFファイルを選択
2. ページを移動して読み進める
3. **「翻訳」** ボタンを押すと右ペインに日本語訳が表示される
4. 翻訳済みのページは次回から即時表示（キャッシュ済みバッジが出る）
5. **「ノートを保存」** で全翻訳をMarkdownファイルとしてダウンロード

### キーボードショートカット

| キー | 操作 |
|---|---|
| `←` / `↑` | 前のページ |
| `→` / `↓` | 次のページ |
| `T` | 現在のページを翻訳 |

## .env の内容

```
CLAUDE_CODE_OAUTH_TOKEN=（claude setup-token で生成したトークン）
PORT=3000  # 省略可（デフォルト3000）
```

## 翻訳キャッシュについて

翻訳結果は `data/cache.db`（SQLite）に保存される。同じPDFの同じページは2回目以降APIを呼ばない。

キャッシュをリセットしたい場合は `data/cache.db` を削除する。

## 詳細ドキュメント

アーキテクチャ・API仕様・アルゴリズムの解説は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照。
