import { Router, Request, Response } from 'express';
import { getCachedTranslation, saveTranslation } from '../db';
import { translatePage, PROMPT_VERSION } from '../services/claude';
import { normalizeText } from '../services/textClean';

export const translateRouter = Router();

interface TranslateRequestBody {
  pdfHash: string;
  pageNum: number;
  pageText: string;
  contextBefore: string;
  contextAfter: string;
}

function isValidPdfHash(hash: unknown): hash is string {
  return typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash);
}

translateRouter.get('/:pdfHash/:pageNum', (req: Request, res: Response) => {
  const { pdfHash, pageNum: pageNumStr } = req.params;
  if (!isValidPdfHash(pdfHash)) {
    res.status(400).json({ error: 'Invalid pdfHash' });
    return;
  }
  const pageNum = parseInt(pageNumStr, 10);
  if (!Number.isInteger(pageNum) || pageNum < 1) {
    res.status(400).json({ error: 'Invalid pageNum' });
    return;
  }
  const cached = getCachedTranslation(pdfHash, pageNum, PROMPT_VERSION);
  if (cached) {
    res.json({ hit: true, translation: cached.translation, pageNum });
  } else {
    res.json({ hit: false });
  }
});

translateRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as Partial<TranslateRequestBody>;

  if (!isValidPdfHash(body.pdfHash)) {
    res.status(400).json({ error: 'pdfHash must be a 64-character hex string' });
    return;
  }
  if (!Number.isInteger(body.pageNum) || (body.pageNum as number) < 1) {
    res.status(400).json({ error: 'pageNum must be a positive integer' });
    return;
  }
  if (typeof body.pageText !== 'string' || body.pageText.trim() === '') {
    res.status(400).json({ error: 'pageText must be a non-empty string' });
    return;
  }

  const { pdfHash, pageNum, pageText, contextBefore = '', contextAfter = '' } = body as TranslateRequestBody;

  const cached = getCachedTranslation(pdfHash, pageNum, PROMPT_VERSION);
  if (cached) {
    res.json({ translation: cached.translation, fromCache: true, pageNum });
    return;
  }

  try {
    const cleanedText = normalizeText(pageText);
    const cleanedBefore = normalizeText(contextBefore);
    const cleanedAfter = normalizeText(contextAfter);

    const result = await translatePage({
      pageText: cleanedText,
      contextBefore: cleanedBefore,
      contextAfter: cleanedAfter,
      pageNum,
    });

    saveTranslation(pdfHash, pageNum, PROMPT_VERSION, cleanedText, result.translation);

    res.json({ translation: result.translation, fromCache: false, pageNum });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ error: 'Translation API error', detail: message });
  }
});
