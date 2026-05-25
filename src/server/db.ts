import Database from 'better-sqlite3';
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

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS translations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pdf_hash    TEXT    NOT NULL,
      page_num    INTEGER NOT NULL,
      prompt_ver  TEXT    NOT NULL,
      source_text TEXT    NOT NULL,
      translation TEXT    NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(pdf_hash, page_num, prompt_ver)
    );

    CREATE INDEX IF NOT EXISTS idx_translations_hash
      ON translations(pdf_hash, page_num);
  `);

  return _db;
}

export function getCachedTranslation(
  pdfHash: string,
  pageNum: number,
  promptVer: string
): CachedTranslation | undefined {
  const db = getDb();
  return db
    .prepare(
      'SELECT * FROM translations WHERE pdf_hash = ? AND page_num = ? AND prompt_ver = ?'
    )
    .get(pdfHash, pageNum, promptVer) as CachedTranslation | undefined;
}

export function saveTranslation(
  pdfHash: string,
  pageNum: number,
  promptVer: string,
  sourceText: string,
  translation: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO translations (pdf_hash, page_num, prompt_ver, source_text, translation)
     VALUES (?, ?, ?, ?, ?)`
  ).run(pdfHash, pageNum, promptVer, sourceText, translation);
}

export function getAllTranslationsForPdf(pdfHash: string): CachedTranslation[] {
  const db = getDb();
  return db
    .prepare(
      'SELECT * FROM translations WHERE pdf_hash = ? ORDER BY page_num ASC'
    )
    .all(pdfHash) as CachedTranslation[];
}
