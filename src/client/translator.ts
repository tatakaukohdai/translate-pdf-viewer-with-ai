import { marked } from 'marked';
import type { PageTextResult } from './pdfViewer';

interface TranslateRequest {
  pdfHash: string;
  pageNum: number;
  pageText: string;
  contextBefore: string;
  contextAfter: string;
}

export interface TranslateResponse {
  translation: string;
  fromCache: boolean;
  pageNum: number;
}

export async function requestTranslation(
  pdfHash: string,
  pageNum: number,
  textResult: PageTextResult
): Promise<TranslateResponse> {
  const body: TranslateRequest = {
    pdfHash,
    pageNum,
    pageText: textResult.mainText,
    contextBefore: textResult.contextBefore,
    contextAfter: textResult.contextAfter,
  };

  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown) as string;
}

export interface CacheCheckResponse {
  hit: boolean;
  translation?: string;
  pageNum?: number;
}

export async function checkCachedTranslation(
  pdfHash: string,
  pageNum: number
): Promise<CacheCheckResponse> {
  const response = await fetch(`/api/translate/${pdfHash}/${pageNum}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function exportNotes(pdfHash: string): Promise<void> {
  const response = await fetch(`/api/notes/export/${pdfHash}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(err.error || 'Export failed');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notes-${pdfHash.slice(0, 8)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
