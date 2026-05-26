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

export function initBookshelf(
  onOpen: (pdfHash: string, file: File) => Promise<void>
): void {
  onOpenCallback = onOpen;

  const btnBookshelf = document.getElementById('btn-bookshelf')!;
  const btnAddBook = document.getElementById('btn-add-book')!;
  const btnClose = document.getElementById('btn-close-bookshelf')!;
  const overlay = document.getElementById('bookshelf-overlay')!;

  btnBookshelf.addEventListener('click', () => openBookshelf());
  btnAddBook.addEventListener('click', () => handleAddBook());
  btnClose.addEventListener('click', () => closeBookshelf());
  overlay.addEventListener('click', () => closeBookshelf());
}

export function openBookshelf(): void {
  const modal = document.getElementById('bookshelf-modal')!;
  modal.removeAttribute('hidden');
  renderBookshelf();
}

export function closeBookshelf(): void {
  const modal = document.getElementById('bookshelf-modal')!;
  modal.setAttribute('hidden', '');
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
      const permission = await fileHandle.requestPermission({ mode: 'read' });
      if (permission === 'granted') {
        const file = await fileHandle.getFile();
        closeBookshelf();
        await onOpenCallback!(book.pdf_hash, file);
        return;
      }
    } catch {
      // Permission denied or error — fall through to re-registration
    }
  }

  // Re-registration flow
  await handleReRegistration(book);
}

async function handleReRegistration(book: BookRecord): Promise<void> {
  const confirmed = confirm(`「${book.title}」のファイルが見つかりません。再登録しますか？`);
  if (!confirmed) return;

  try {
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
    }) as [FileSystemFileHandle];

    const file = await handle.getFile();
    const buffer = await file.arrayBuffer();
    const hash = await computePdfHash(buffer);

    if (hash !== book.pdf_hash) {
      alert('異なるファイルが選択されました。同じPDFを選択してください。');
      return;
    }

    await saveFileHandle(book.pdf_hash, handle);
    closeBookshelf();
    await onOpenCallback!(book.pdf_hash, file);
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.error('Re-registration failed:', err);
      alert(`再登録に失敗しました: ${err?.message ?? err}`);
    }
  }
}

async function handleAddBook(): Promise<void> {
  try {
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
    }) as [FileSystemFileHandle];

    const file = await handle.getFile();
    const buffer = await file.arrayBuffer();
    const hash = await computePdfHash(buffer);

    const pdfDoc = await loadPdf(buffer);
    const pageCount = pdfDoc.numPages;

    // Render thumbnail from page 1
    const offscreen = document.createElement('canvas');
    await renderPageToCanvas(pdfDoc, 1, offscreen, 300);
    offscreen.toBlob(
      (blob) => {
        if (blob) saveThumbnail(hash, blob);
      },
      'image/jpeg',
      0.8
    );

    // Save file handle locally
    await saveFileHandle(hash, handle);

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
