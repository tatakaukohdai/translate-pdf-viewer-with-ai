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

export interface BookRecord {
  pdf_hash: string;
  title: string;
  filename: string;
  page_count: number | null;
  added_at: number;
  last_read_page: number;
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
  await client.execute(`
    CREATE TABLE IF NOT EXISTS books (
      pdf_hash       TEXT PRIMARY KEY,
      title          TEXT NOT NULL,
      filename       TEXT NOT NULL,
      page_count     INTEGER,
      added_at       INTEGER NOT NULL DEFAULT (unixepoch()),
      last_read_page INTEGER DEFAULT 1
    )
  `);
}

function rowToBookRecord(row: Record<string, unknown>): BookRecord {
  return {
    pdf_hash: row['pdf_hash'] as string,
    title: row['title'] as string,
    filename: row['filename'] as string,
    page_count: row['page_count'] as number | null,
    added_at: row['added_at'] as number,
    last_read_page: row['last_read_page'] as number,
  };
}

export async function getAllBooks(): Promise<BookRecord[]> {
  const client = getDb();
  const result = await client.execute(
    'SELECT * FROM books ORDER BY added_at DESC'
  );
  return result.rows.map((row) => rowToBookRecord(row as Record<string, unknown>));
}

export async function getBook(pdfHash: string): Promise<BookRecord | undefined> {
  const client = getDb();
  const result = await client.execute({
    sql: 'SELECT * FROM books WHERE pdf_hash = ?',
    args: [pdfHash],
  });
  if (result.rows.length === 0) return undefined;
  return rowToBookRecord(result.rows[0] as Record<string, unknown>);
}

export async function upsertBook(
  pdfHash: string,
  title: string,
  filename: string,
  pageCount: number | null
): Promise<{ record: BookRecord; inserted: boolean }> {
  const client = getDb();
  const insertResult = await client.execute({
    sql: `INSERT OR IGNORE INTO books (pdf_hash, title, filename, page_count) VALUES (?, ?, ?, ?)`,
    args: [pdfHash, title, filename, pageCount],
  });
  const record = await getBook(pdfHash);
  if (!record) {
    throw new Error(`upsertBook: record not found after INSERT for hash ${pdfHash}`);
  }
  return { record, inserted: insertResult.rowsAffected > 0 };
}

export async function updateBook(
  pdfHash: string,
  updates: { lastReadPage?: number; title?: string }
): Promise<BookRecord | undefined> {
  const client = getDb();
  const setClauses: string[] = [];
  const args: (string | number)[] = [];

  if (updates.title !== undefined) {
    setClauses.push('title = ?');
    args.push(updates.title);
  }
  if (updates.lastReadPage !== undefined) {
    setClauses.push('last_read_page = ?');
    args.push(updates.lastReadPage);
  }

  if (setClauses.length === 0) {
    return getBook(pdfHash);
  }

  args.push(pdfHash);
  await client.execute({
    sql: `UPDATE books SET ${setClauses.join(', ')} WHERE pdf_hash = ?`,
    args,
  });

  return getBook(pdfHash);
}

export async function deleteBook(pdfHash: string): Promise<void> {
  const client = getDb();
  await client.execute({
    sql: 'DELETE FROM books WHERE pdf_hash = ?',
    args: [pdfHash],
  });
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

export function isTursoMode(): boolean {
  return !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
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
