import { Router, Request, Response } from 'express';
import { getAllTranslationsForPdf } from '../db';

export const notesRouter = Router();

function isValidPdfHash(hash: unknown): hash is string {
  return typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash);
}

notesRouter.get('/export/:pdfHash', async (req: Request, res: Response) => {
  const { pdfHash } = req.params;

  if (!isValidPdfHash(pdfHash)) {
    res.status(400).json({ error: 'Invalid pdfHash' });
    return;
  }

  let translations;
  try {
    translations = await getAllTranslationsForPdf(pdfHash);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'Database error', detail: message });
    return;
  }

  if (translations.length === 0) {
    res.status(404).json({ error: 'No translations found for this PDF' });
    return;
  }

  const date = new Date().toISOString().split('T')[0];
  const lines: string[] = [
    `# 読書ノート`,
    ``,
    `生成日: ${date}  `,
    `PDF: \`${pdfHash.slice(0, 16)}...\`  `,
    `ページ数: ${translations.length}ページ分`,
    ``,
    `---`,
    ``,
  ];

  for (const t of translations) {
    lines.push(`## Page ${t.page_num}`);
    lines.push('');
    lines.push(t.translation);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const markdown = lines.join('\n');
  const filename = `notes-${pdfHash.slice(0, 8)}.md`;

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(markdown);
});
