import type { PDFDocumentProxy } from 'pdfjs-dist';
import { computePdfHash, loadPdf, renderPageToCanvas, getPageTextWithContext } from './pdfViewer';
import { requestTranslation, renderMarkdown, exportNotes, checkCachedTranslation } from './translator';
import { initBookshelf } from './bookshelf';

let pdfDoc: PDFDocumentProxy | null = null;
let currentPdfHash = '';
let currentPage = 1;
let totalPages = 0;
let isTranslating = false;

const pdfInput         = document.getElementById('pdf-input') as HTMLInputElement;
const btnPrev          = document.getElementById('btn-prev') as HTMLButtonElement;
const btnNext          = document.getElementById('btn-next') as HTMLButtonElement;
const btnTranslate     = document.getElementById('btn-translate') as HTMLButtonElement;
const btnExport        = document.getElementById('btn-export') as HTMLButtonElement;
const pageDisplay      = document.getElementById('page-display') as HTMLSpanElement;
const cacheBadge       = document.getElementById('cache-badge') as HTMLSpanElement;
const pdfCanvas        = document.getElementById('pdf-canvas') as HTMLCanvasElement;
const translationContent  = document.getElementById('translation-content') as HTMLDivElement;
const translationLoading  = document.getElementById('translation-loading') as HTMLDivElement;
const pdfPane          = document.getElementById('pdf-pane') as HTMLElement;

pdfInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const buffer = await file.arrayBuffer();
    currentPdfHash = await computePdfHash(buffer);
    pdfDoc = await loadPdf(buffer);
    totalPages = pdfDoc.numPages;
    currentPage = 1;
    btnExport.disabled = false;
    clearTranslation();
    await goToPage(1);
  } catch (err) {
    showError(err instanceof Error ? err.message : 'PDFの読み込みに失敗しました');
  }
});

btnPrev.addEventListener('click', () => {
  if (currentPage > 1) goToPage(currentPage - 1);
});

btnNext.addEventListener('click', () => {
  if (currentPage < totalPages) goToPage(currentPage + 1);
});

btnTranslate.addEventListener('click', () => {
  translateCurrentPage();
});

btnExport.addEventListener('click', async () => {
  if (!currentPdfHash) return;
  try {
    btnExport.disabled = true;
    await exportNotes(currentPdfHash);
  } catch (err) {
    showError(err instanceof Error ? err.message : 'エクスポートに失敗しました');
  } finally {
    btnExport.disabled = false;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (currentPage > 1) goToPage(currentPage - 1);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (currentPage < totalPages) goToPage(currentPage + 1);
  } else if (e.key === 't' || e.key === 'T') {
    translateCurrentPage();
  }
});

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

const updateLastReadPage = debounce((hash: string, page: number) => {
  fetch(`/api/books/${hash}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lastReadPage: page }),
  }).catch(() => {}); // fire-and-forget, non-critical
}, 500);

async function openFromBookshelf(pdfHash: string, file: File): Promise<void> {
  try {
    const buffer = await file.arrayBuffer();
    currentPdfHash = pdfHash;
    pdfDoc = await loadPdf(buffer);
    totalPages = pdfDoc.numPages;
    currentPage = 1;
    btnExport.disabled = false;
    clearTranslation();
    await goToPage(1);
  } catch (err) {
    showError(err instanceof Error ? err.message : 'PDFの読み込みに失敗しました');
  }
}

async function goToPage(page: number): Promise<void> {
  if (!pdfDoc) return;
  currentPage = page;
  updatePageDisplay();
  clearCacheBadge();
  await renderPageToCanvas(pdfDoc, page, pdfCanvas, pdfPane.clientWidth);
  if (currentPdfHash) updateLastReadPage(currentPdfHash, page);
  if (currentPdfHash) await loadCachedTranslation();
}

async function loadCachedTranslation(): Promise<void> {
  try {
    const result = await checkCachedTranslation(currentPdfHash, currentPage);
    if (result.hit && result.translation) {
      translationContent.innerHTML = renderMarkdown(result.translation); // content is from Claude API, same as translateCurrentPage
      setCacheBadge(true);
      translationContent.scrollTop = 0;
    } else {
      clearTranslation();
    }
  } catch {
    clearTranslation();
  }
}

async function translateCurrentPage(): Promise<void> {
  if (!pdfDoc || isTranslating) return;

  isTranslating = true;
  setLoadingState(true);

  try {
    const textResult = await getPageTextWithContext(pdfDoc, currentPage);

    if (!textResult.mainText.trim()) {
      translationContent.innerHTML =
        '<p class="empty-hint">このページにはテキストが含まれていません（画像のみのページの可能性があります）</p>';
      return;
    }

    const result = await requestTranslation(currentPdfHash, currentPage, textResult);
    translationContent.innerHTML = renderMarkdown(result.translation);
    setCacheBadge(result.fromCache);
    translationContent.scrollTop = 0;
  } catch (err) {
    showError(err instanceof Error ? err.message : '翻訳に失敗しました');
  } finally {
    isTranslating = false;
    setLoadingState(false);
  }
}

function updatePageDisplay(): void {
  if (totalPages === 0) {
    pageDisplay.textContent = '-/-';
  } else {
    pageDisplay.textContent = `${currentPage} / ${totalPages}`;
  }
  btnPrev.disabled = currentPage <= 1;
  btnNext.disabled = currentPage >= totalPages || totalPages === 0;
}

function setLoadingState(loading: boolean): void {
  translationLoading.hidden = !loading;
  btnTranslate.disabled = loading;
  translationContent.style.opacity = loading ? '0.4' : '1';
}

function setCacheBadge(fromCache: boolean): void {
  cacheBadge.textContent = fromCache ? 'キャッシュ済み' : '新規翻訳';
  cacheBadge.className = fromCache ? 'cached' : 'fresh';
}

function clearCacheBadge(): void {
  cacheBadge.textContent = '';
  cacheBadge.className = '';
}

function clearTranslation(): void {
  translationContent.innerHTML = '<p class="empty-hint">翻訳ボタンを押してください</p>';
  clearCacheBadge();
}

function showError(msg: string): void {
  translationContent.innerHTML = `<p style="color: var(--color-error)">エラー: ${msg}</p>`;
}

updatePageDisplay();
initBookshelf(openFromBookshelf);
