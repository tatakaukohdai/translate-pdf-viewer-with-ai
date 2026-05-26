import { Router } from 'express';
import { getAllBooks, getBook, upsertBook, updateBook, deleteBook } from '../db';

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

    const book = await upsertBook(pdfHash, title.trim(), filename.trim(), resolvedPageCount);
    res.status(201).json(book);
  } catch (err) {
    console.error('[books] POST /api/books error:', err);
    res.status(500).json({ error: 'Failed to add book' });
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
