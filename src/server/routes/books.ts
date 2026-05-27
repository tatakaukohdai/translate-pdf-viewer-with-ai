import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { getAllBooks, getBook, upsertBook, updateBook, deleteBook, getDb, isTursoMode } from '../db';

export const booksRouter = Router();

const PDF_HASH_RE = /^[0-9a-f]{64}$/;

// GET /api/books — return all books ordered by added_at DESC
booksRouter.get('/', async (_req, res) => {
  try {
    const books = await getAllBooks();
    res.json(books);
  } catch (err) {
    console.error('[books] GET /api/books error:', err);
    res.status(500).json({ error: 'Failed to retrieve books' });
  }
});

// POST /api/books — add a book
booksRouter.post('/', async (req, res) => {
  try {
    const { pdfHash, title, filename, pageCount } = req.body as {
      pdfHash?: unknown;
      title?: unknown;
      filename?: unknown;
      pageCount?: unknown;
    };

    if (typeof pdfHash !== 'string' || !PDF_HASH_RE.test(pdfHash)) {
      res.status(400).json({ error: 'pdfHash must be a 64-char hex string' });
      return;
    }
    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title must be a non-empty string' });
      return;
    }
    if (typeof filename !== 'string' || filename.trim() === '') {
      res.status(400).json({ error: 'filename must be a non-empty string' });
      return;
    }

    let resolvedPageCount: number | null = null;
    if (pageCount !== undefined && pageCount !== null) {
      if (!Number.isInteger(pageCount) || (pageCount as number) <= 0) {
        res.status(400).json({ error: 'pageCount must be a positive integer' });
        return;
      }
      resolvedPageCount = pageCount as number;
    }

    const { record, inserted } = await upsertBook(pdfHash, title.trim(), filename.trim(), resolvedPageCount);
    res.status(inserted ? 201 : 200).json(record);
  } catch (err) {
    console.error('[books] POST /api/books error:', err);
    res.status(500).json({ error: 'Failed to add book' });
  }
});

// POST /api/books/import-local — import translations and books from local cache.db into Turso
booksRouter.post('/import-local', async (_req, res) => {
  try {
    if (!isTursoMode()) {
      res.status(400).json({ error: 'ローカルモードではインポートは不要です' });
      return;
    }

    const cacheDbPath = path.join(process.cwd(), 'data', 'cache.db');
    if (!fs.existsSync(cacheDbPath)) {
      res.status(404).json({ error: 'data/cache.db が見つかりません' });
      return;
    }

    const localDb = new Database(cacheDbPath, { readonly: true });
    const client = getDb();

    // Read all rows from local DB
    const localTranslations = localDb.prepare('SELECT * FROM translations').all() as {
      id: number;
      pdf_hash: string;
      page_num: number;
      prompt_ver: string;
      source_text: string;
      translation: string;
      created_at: number;
    }[];

    const localBooks = localDb.prepare('SELECT * FROM books').all() as {
      pdf_hash: string;
      title: string;
      filename: string;
      page_count: number | null;
      added_at: number;
      last_read_page: number;
    }[];

    localDb.close();

    // Insert translations into Turso using INSERT OR IGNORE
    let importedTranslations = 0;
    for (const t of localTranslations) {
      const result = await client.execute({
        sql: `INSERT OR IGNORE INTO translations (pdf_hash, page_num, prompt_ver, source_text, translation, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [t.pdf_hash, t.page_num, t.prompt_ver, t.source_text, t.translation, t.created_at],
      });
      importedTranslations += result.rowsAffected;
    }

    // Insert books into Turso using INSERT OR IGNORE
    let importedBooks = 0;
    for (const b of localBooks) {
      const result = await client.execute({
        sql: `INSERT OR IGNORE INTO books (pdf_hash, title, filename, page_count, added_at, last_read_page)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [b.pdf_hash, b.title, b.filename, b.page_count, b.added_at, b.last_read_page],
      });
      importedBooks += result.rowsAffected;
    }

    res.json({ imported: { translations: importedTranslations, books: importedBooks } });
  } catch (err) {
    console.error('[books] POST /api/books/import-local error:', err);
    res.status(500).json({ error: 'インポートに失敗しました' });
  }
});

// PATCH /api/books/:hash — update a book
booksRouter.patch('/:hash', async (req, res) => {
  try {
    const { hash } = req.params;

    if (!PDF_HASH_RE.test(hash)) {
      res.status(400).json({ error: 'hash must be a 64-char hex string' });
      return;
    }

    const { lastReadPage, title } = req.body as {
      lastReadPage?: unknown;
      title?: unknown;
    };

    const updates: { lastReadPage?: number; title?: string } = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim() === '') {
        res.status(400).json({ error: 'title must be a non-empty string' });
        return;
      }
      updates.title = title.trim();
    }

    if (lastReadPage !== undefined) {
      if (!Number.isInteger(lastReadPage) || (lastReadPage as number) <= 0) {
        res.status(400).json({ error: 'lastReadPage must be a positive integer' });
        return;
      }
      updates.lastReadPage = lastReadPage as number;
    }

    const book = await updateBook(hash, updates);
    if (!book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }
    res.json(book);
  } catch (err) {
    console.error('[books] PATCH /api/books/:hash error:', err);
    res.status(500).json({ error: 'Failed to update book' });
  }
});

// DELETE /api/books/:hash — remove book (translations stay)
booksRouter.delete('/:hash', async (req, res) => {
  try {
    const { hash } = req.params;

    if (!PDF_HASH_RE.test(hash)) {
      res.status(400).json({ error: 'hash must be a 64-char hex string' });
      return;
    }

    const existing = await getBook(hash);
    if (!existing) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    await deleteBook(hash);
    res.status(204).send();
  } catch (err) {
    console.error('[books] DELETE /api/books/:hash error:', err);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});
