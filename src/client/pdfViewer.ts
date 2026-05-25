import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href;

const MARGIN_THRESHOLD = 0.07;
const CONTEXT_LINE_COUNT = 5;

export interface PageTextResult {
  mainText: string;
  contextBefore: string;
  contextAfter: string;
}

export async function computePdfHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function loadPdf(buffer: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  return loadingTask.promise;
}

export async function extractPageText(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number
): Promise<string> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.0 });
  const textContent = await page.getTextContent();
  const pageHeight = viewport.height;

  const lines: string[] = [];
  let currentLine = '';
  let lastY = -1;

  const items = textContent.items.filter(
    (item): item is TextItem => 'str' in item
  );

  for (const item of items) {
    const y = item.transform[5];
    const yFromTop = pageHeight - y;
    const relY = yFromTop / pageHeight;

    if (relY < MARGIN_THRESHOLD || relY > 1 - MARGIN_THRESHOLD) continue;

    if (lastY !== -1 && Math.abs(y - lastY) > 5) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = item.str;
    } else {
      currentLine += item.str;
    }
    lastY = y;
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  return lines.join('\n');
}

export async function getPageTextWithContext(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number
): Promise<PageTextResult> {
  const mainText = await extractPageText(pdfDoc, pageNum);
  const total = pdfDoc.numPages;

  let contextBefore = '';
  if (pageNum > 1) {
    const prevText = await extractPageText(pdfDoc, pageNum - 1);
    const lines = prevText.split('\n').filter(l => l.trim());
    contextBefore = lines.slice(-CONTEXT_LINE_COUNT).join('\n');
  }

  let contextAfter = '';
  if (pageNum < total) {
    const nextText = await extractPageText(pdfDoc, pageNum + 1);
    const lines = nextText.split('\n').filter(l => l.trim());
    contextAfter = lines.slice(0, CONTEXT_LINE_COUNT).join('\n');
  }

  return { mainText, contextBefore, contextAfter };
}

export async function renderPageToCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement,
  containerWidth: number
): Promise<void> {
  const page = await pdfDoc.getPage(pageNum);
  const unscaledViewport = page.getViewport({ scale: 1.0 });
  const scale = Math.min((containerWidth - 32) / unscaledViewport.width, 2.0);
  const viewport = page.getViewport({ scale });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2D context');

  await page.render({ canvasContext: ctx, viewport }).promise;
}
