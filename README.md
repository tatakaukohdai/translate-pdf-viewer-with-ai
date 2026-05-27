# PDF翻訳ビューワー

英語のPDFドキュメントを開いて、ページ単位でAI日本語訳を並べて読めるローカルWebアプリ。

- PDFを左ペインに表示、翻訳を右ペインに表示
- 翻訳結果はSQLiteにキャッシュ（同じページは2回目以降即時表示）
- 全翻訳をMarkdownファイルとして保存できる
- PDFを本棚に登録して一覧管理（サムネイル付き）
- 翻訳キャッシュをTurso経由で複数端末同期可能

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

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `CLAUDE_CODE_OAUTH_TOKEN` | ✅ | claude setup-token で生成したトークン |
| `PORT` | — | サーバーポート（デフォルト: 3000） |
| `TURSO_DATABASE_URL` | — | Turso DB の URL（例: `libsql://your-db.turso.io`）。省略するとローカルの `data/cache.db` を使用 |
| `TURSO_AUTH_TOKEN` | — | Turso の認証トークン。`TURSO_DATABASE_URL` と一緒に設定する |

## 翻訳キャッシュについて

翻訳結果は `data/cache.db`（SQLite）に保存される。同じPDFの同じページは2回目以降APIを呼ばない。

キャッシュをリセットしたい場合は `data/cache.db` を削除する。

## 本棚機能

ツールバーの「本棚」ボタンからPDFを登録・管理できる。

- 「＋ 追加」でPDFファイルを選択して本棚に登録（ファイルはコピーされず参照のみ）
- カードをクリックして開く。ファイルが見つからない場合は「再登録」を求める（翻訳キャッシュは引き継がれる）
- サムネイル（表紙）はブラウザのIndexedDBに保存される

## 複数端末での翻訳キャッシュ共有（Turso）

Tursoを使うと、翻訳キャッシュと本棚情報を複数端末で共有できる。

### セットアップ手順

1. [Turso](https://turso.tech) でアカウントを作成（無料プランあり）
2. CLIをインストール: `brew install tursodatabase/tap/turso`（Mac）
3. ログイン: `turso auth login`
4. DBを作成: `turso db create pdf-viewer`
5. URLとトークンを取得:
   ```bash
   turso db show pdf-viewer --url  # → TURSO_DATABASE_URL
   turso db tokens create pdf-viewer  # → TURSO_AUTH_TOKEN
   ```
6. `.env` に追記:
   ```
   TURSO_DATABASE_URL=libsql://pdf-viewer-<username>.turso.io
   TURSO_AUTH_TOKEN=<token>
   ```

### ローカルから移行する場合

すでにローカルで翻訳キャッシュが蓄積されている場合、本棚モーダル下部の「**cache.dbをインポート**」ボタンで `data/cache.db` のデータをTursoに移行できる。

### 別端末での利用

別端末の `.env` に同じ `TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` を設定するだけで、翻訳キャッシュと本棚が共有される。PDFファイル自体は各端末でそれぞれ本棚に登録する必要がある。

## 詳細ドキュメント

アーキテクチャ・API仕様・アルゴリズムの解説は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照。
