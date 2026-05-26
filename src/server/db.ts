import { createClient, Client } from '@libsql/client';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'cache.db');

export interface CachedTranslation {
  id: number;
  pdf_hash: string;
  page_num: number;
  prompt_ver: string;
  source_text: string;
  translation: string;
  created_at: number;
}

let _client: Client | null = null;

export function getDb(): Client {
  if (_client) return _client;

  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  let url: string;
  let authToken: string | undefined;

  if (tursoUrl && tursoToken) {
    url = tursoUrl;
    authToken = tursoToken;
  } else {
    // Local file mode — ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    url = `file:${DB_PATH}`;
    authToken = undefined;
  }

  _client = createClient({ url, authToken });
  return _client;
}

export async function initDb(): Promise<void> {
  const client = getDb();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS translations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pdf_hash    TEXT    NOT NULL,
      page_num    INTEGER NOT NULL,
      prompt_ver  TEXT    NOT NULL,
      source_text TEXT    NOT NULL,
      translation TEXT    NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(pdf_hash, page_num, prompt_ver)
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_translations_hash
      ON translations(pdf_hash, page_num)
  `);
}

export async function getCachedTranslation(
  pdfHash: string,
  pageNum: number,
  promptVer: string
): Promise<CachedTranslation | undefined> {
  const client = getDb();
  const result = await client.execute({
    sql: 'SELECT * FROM translations WHERE pdf_hash = ? AND page_num = ? AND prompt_ver = ?',
    args: [pdfHash, pageNum, promptVer],
  });
  if (result.rows.length === 0) return undefined;
  const row = result.rows[0];
  return {
    id: row['id'] as number,
    pdf_hash: row['pdf_hash'] as string,
    page_num: row['page_num'] as number,
    prompt_ver: row['prompt_ver'] as string,
    source_text: row['source_text'] as string,
    translation: row['translation'] as string,
    created_at: row['created_at'] as number,
  };
}

export async function saveTranslation(
  pdfHash: string,
  pageNum: number,
  promptVer: string,
  sourceText: string,
  translation: string
): Promise<void> {
  const client = getDb();
  await client.execute({
    sql: `INSERT OR REPLACE INTO translations (pdf_hash, page_num, prompt_ver, source_text, translation)
          VALUES (?, ?, ?, ?, ?)`,
    args: [pdfHash, pageNum, promptVer, sourceText, translation],
  });
}

export async function getAllTranslationsForPdf(pdfHash: string): Promise<CachedTranslation[]> {
  const client = getDb();
  const result = await client.execute({
    sql: 'SELECT * FROM translations WHERE pdf_hash = ? ORDER BY page_num ASC',
    args: [pdfHash],
  });
  return result.rows.map((row) => ({
    id: row['id'] as number,
    pdf_hash: row['pdf_hash'] as string,
    page_num: row['page_num'] as number,
    prompt_ver: row['prompt_ver'] as string,
    source_text: row['source_text'] as string,
    translation: row['translation'] as string,
    created_at: row['created_at'] as number,
  }));
}
