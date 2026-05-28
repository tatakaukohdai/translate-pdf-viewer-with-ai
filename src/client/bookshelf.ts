import { computePdfHash, loadPdf, renderPageToCanvas } from './pdfViewer';
import { saveFileHandle, getFileHandle, saveThumbnail, getThumbnail } from './bookshelfStore';

interface BookRecord {
  pdf_hash: string;
  title: string;
  filename: string;
  page_count: number | null;
  added_at: number;
  last_read_page: number;
}

let onOpenCallback: ((pdfHash: string, file: File) => Promise<void>) | null = null;

// File System Access API は Chrome/Edge のみ対応。Firefox はフォールバックを使う。
const hasFileSystemAccess = 'showOpenFilePicker' in window;

interface PickedFile {
  file: File;
  handle: FileSystemFileHandle | null;
}

async function pickPdfFile(): Promise<PickedFile | null> {
  if (hasFileSystemAccess) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      }) as [FileSystemFileHandle];
      const file = await handle.getFile();
      return { file, handle };
    } catch (err: any) {
      if (err?.name === 'AbortError') return null;
      throw err;
    }
  }

  // Firefox / Safari fallback: 隠し input[type=file] を使う
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = () => resolve(input.files?.[0] ? { file: input.files[0], handle: null } : null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function initBookshelf(
  onOpen: (pdfHash: string, file: File) => Promise<void>
): void {
  onOpenCallback = onOpen;

  // 初期状態で確実に非表示にする（CSSの[hidden]が効かない場合の保険）
  const modal = document.getElementById('bookshelf-modal')!;
  modal.style.display = 'none';

  const btnBookshelf = document.getElementById('btn-bookshelf')!;
  const btnAddBook = document.getElementById('btn-add-book')!;
  const btnClose = document.getElementById('btn-close-bookshelf')!;
  const overlay = document.getElementById('bookshelf-overlay')!;

  const btnImport = document.getElementById('btn-import-cache')!;

  btnBookshelf.addEventListener('click', () => openBookshelf());
  btnAddBook.addEventListener('click', () => handleAddBook());
  btnClose.addEventListener('click', () => closeBookshelf());
  overlay.addEventListener('click', () => closeBookshelf());
  btnImport.addEventListener('click', () => handleImportCache());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBookshelf();
  });
}

export function openBookshelf(): void {
  const modal = document.getElementById('bookshelf-modal')!;
  modal.removeAttribute('hidden');
  modal.style.display = '';
  renderBookshelf();
}

export function closeBookshelf(): void {
  const modal = document.getElementById('bookshelf-modal')!;
  modal.setAttribute('hidden', '');
  modal.style.display = 'none'; // [hidden]が効かないブラウザ向けの保険
}

async function renderBookshelf(): Promise<void> {
  const grid = document.getElementById('bookshelf-grid')!;
  // Clear grid using DOM methods
  while (grid.firstChild) {
    grid.removeChild(grid.firstChild);
  }

  let books: BookRecord[] = [];
  try {
    const res = await fetch('/api/books');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    books = await res.json();
  } catch (err) {
    const emptyEl = document.createElement('div');
    emptyEl.id = 'bookshelf-empty';
    emptyEl.textContent = '本棚の読み込みに失敗しました';
    grid.appendChild(emptyEl);
    console.error('Failed to fetch books:', err);
    return;
  }

  if (books.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.id = 'bookshelf-empty';
    emptyEl.textContent = '本棚にまだ本がありません。「＋ 追加」から登録してください。';
    grid.appendChild(emptyEl);
    return;
  }

  for (const book of books) {
    const card = await createBookCard(book);
    grid.appendChild(card);
  }
}

async function createBookCard(book: BookRecord): Promise<HTMLElement> {
  const card = document.createElement('div');
  card.className = 'book-card';

  // Thumbnail section
  const thumbDiv = document.createElement('div');
  thumbDiv.className = 'book-card-thumb';

  const thumbnail = await getThumbnail(book.pdf_hash);
  if (thumbnail) {
    const img = document.createElement('img');
    img.onload = () => URL.revokeObjectURL(img.src);
    img.onerror = () => URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(thumbnail);
    img.alt = book.title;
    thumbDiv.appendChild(img);
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'book-card-thumb-placeholder';
    placeholder.textContent = '📄';
    thumbDiv.appendChild(placeholder);
  }

  // Info section
  const infoDiv = document.createElement('div');
  infoDiv.className = 'book-card-info';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'book-card-title';
  titleDiv.textContent = book.title;
  titleDiv.title = book.title;

  const progressDiv = document.createElement('div');
  progressDiv.className = 'book-card-progress';
  if (book.page_count) {
    progressDiv.textContent = `${book.last_read_page} / ${book.page_count} ページ`;
  } else {
    progressDiv.textContent = `${book.last_read_page} ページ`;
  }

  infoDiv.appendChild(titleDiv);
  infoDiv.appendChild(progressDiv);

  // Check if file handle exists to show re-registration badge
  const fileHandle = await getFileHandle(book.pdf_hash);
  if (!fileHandle) {
    const badge = document.createElement('span');
    badge.className = 'book-card-badge';
    badge.textContent = '再登録が必要';
    infoDiv.appendChild(badge);
  }

  card.appendChild(thumbDiv);
  card.appendChild(infoDiv);

  card.addEventListener('click', () => handleCardClick(book, fileHandle));

  return card;
}

async function handleCardClick(
  book: BookRecord,
  fileHandle: FileSystemFileHandle | null
): Promise<void> {
  if (fileHandle) {
    try {
      // getFile() はユーザージェスチャーを消費しない。
      // requestPermission() は消費するため、その後の showOpenFilePicker が失敗する。
      const file = await fileHandle.getFile();
      if (!onOpenCallback) return;
      await onOpenCallback(book.pdf_hash, file);
      closeBookshelf();
      return;
    } catch {
      // NotAllowedError（権限未付与）またはファイル移動など → 再登録フローへ
    }
  }

  // Re-registration flow
  await handleReRegistration(book);
}

async function handleReRegistration(book: BookRecord): Promise<void> {
  try {
    const picked = await pickPdfFile();
    if (!picked) return;

    const { file, handle } = picked;
    const buffer = await file.arrayBuffer();
    const hash = await computePdfHash(buffer);

    if (hash !== book.pdf_hash) {
      alert('異なるファイルが選択されました。同じPDFを選択してください。');
      return;
    }

    if (handle) await saveFileHandle(book.pdf_hash, handle);
    if (!onOpenCallback) return;
    await onOpenCallback(book.pdf_hash, file);
    closeBookshelf();
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.error('Re-registration failed:', err);
      alert(`再登録に失敗しました: ${err?.message ?? err}`);
    }
  }
}

async function handleImportCache(): Promise<void> {
  try {
    const res = await fetch('/api/books/import-local', { method: 'POST' });
    if (res.ok) {
      const result = await res.json() as { imported: { translations: number; books: number } };
      alert(`インポート完了: 翻訳 ${result.imported.translations}件、本 ${result.imported.books}件`);
      await renderBookshelf();
    } else if (res.status === 400) {
      alert('ローカルモードではインポートは不要です');
    } else if (res.status === 404) {
      alert('data/cache.db が見つかりません');
    } else {
      alert('インポートに失敗しました');
    }
  } catch {
    alert('インポートに失敗しました');
  }
}

async function handleAddBook(): Promise<void> {
  try {
    const picked = await pickPdfFile();
    if (!picked) return;

    const { file, handle } = picked;
    const buffer = await file.arrayBuffer();
    const hash = await computePdfHash(buffer);

    const pdfDoc = await loadPdf(buffer);
    const pageCount = pdfDoc.numPages;

    // Render thumbnail from page 1
    const offscreen = document.createElement('canvas');
    await renderPageToCanvas(pdfDoc, 1, offscreen, 300);
    await new Promise<void>((resolve) => {
      offscreen.toBlob((blob) => {
        if (blob) saveThumbnail(hash, blob).then(resolve, resolve);
        else resolve();
      }, 'image/jpeg', 0.8);
    });

    // Save file handle locally (Chrome only; null on Firefox)
    if (handle) await saveFileHandle(hash, handle);

    // Derive title from filename (strip .pdf extension)
    const title = file.name.replace(/\.pdf$/i, '');

    // Register on server
    const res = await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdfHash: hash,
        title,
        filename: file.name,
        pageCount,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server error ${res.status}: ${text}`);
    }

    // Re-render grid
    await renderBookshelf();
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.error('Add book failed:', err);
      alert(`追加に失敗しました: ${err?.message ?? err}`);
    }
  }
}
