import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getPageTextWithContext } from './pdfViewer';
import { requestTranslation } from './translator';

export interface BatchOptions {
  pdfDoc: PDFDocumentProxy;
  pdfHash: string;
  startPage: number;
  endPage: number;
  concurrency: number;
  onProgress: (done: number, total: number) => void;
  onPageDone: (pageNum: number) => void;
  onFinish: (cancelled: boolean) => void;
}

export class BatchTranslator {
  private cancelled = false;
  private running = false;

  cancel(): void {
    this.cancelled = true;
  }

  get isRunning(): boolean {
    return this.running;
  }

  async start(opts: BatchOptions, skipPages: Set<number>): Promise<void> {
    const { pdfDoc, pdfHash, startPage, endPage, concurrency, onProgress, onPageDone, onFinish } = opts;

    const queue: number[] = [];
    for (let p = startPage; p <= endPage; p++) {
      if (!skipPages.has(p)) queue.push(p);
    }

    const total = queue.length;
    let done = 0;
    let idx = 0;
    this.running = true;

    if (total === 0) {
      this.running = false;
      onFinish(false);
      return;
    }

    onProgress(0, total);

    const worker = async (): Promise<void> => {
      while (idx < queue.length && !this.cancelled) {
        const pageNum = queue[idx++];
        try {
          const textResult = await getPageTextWithContext(pdfDoc, pageNum);
          if (!textResult.mainText.trim()) {
            done++;
            onProgress(done, total);
            onPageDone(pageNum);
            continue;
          }
          await requestTranslation(pdfHash, pageNum, textResult);
        } catch {
          // ページ失敗は無視して続行
        }
        done++;
        onProgress(done, total);
        onPageDone(pageNum);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
    await Promise.all(workers);

    this.running = false;
    onFinish(this.cancelled);
  }
}

export async function fetchTranslatedPages(pdfHash: string): Promise<Set<number>> {
  const res = await fetch(`/api/translate/${pdfHash}/pages`);
  if (!res.ok) return new Set();
  const data: { translatedPages: number[] } = await res.json();
  return new Set(data.translatedPages);
}

export async function startBatchTranslation(opts: BatchOptions): Promise<BatchTranslator> {
  const translator = new BatchTranslator();
  const skipPages = await fetchTranslatedPages(opts.pdfHash);
  translator.start(opts, skipPages);
  return translator;
}
