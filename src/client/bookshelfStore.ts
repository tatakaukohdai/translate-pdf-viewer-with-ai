/**
 * IndexedDB module for storing FileHandle references and thumbnail blobs
 * for the bookshelf feature.
 */

const DB_NAME = 'bookshelf-db';
const DB_VERSION = 1;
const STORE_NAME = 'books';

interface LocalBookEntry {
  pdfHash: string;
  fileHandle: FileSystemFileHandle | null;
  thumbnail: Blob | null;
}

// Module-level singleton promise for database connection
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Opens (or reuses) the IndexedDB database.
 * Returns a singleton promise that resolves to the IDBDatabase instance.
 */
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'pdfHash' });
      }
    };

    req.onsuccess = (e) => {
      resolve((e.target as IDBOpenDBRequest).result);
    };

    req.onerror = (e) => {
      reject((e.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
}

/**
 * Save or update a FileHandle for a book.
 * If an entry exists, updates only the fileHandle field.
 * If not, creates a new entry with fileHandle and null for thumbnail.
 */
export async function saveFileHandle(
  pdfHash: string,
  fileHandle: FileSystemFileHandle
): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    // First, try to get the existing entry
    const getReq = store.get(pdfHash);

    getReq.onsuccess = () => {
      const existing = getReq.result as LocalBookEntry | undefined;
      const entry: LocalBookEntry = {
        pdfHash,
        fileHandle,
        thumbnail: existing?.thumbnail ?? null,
      };

      const putReq = store.put(entry);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Get the FileHandle for a book.
 * Returns null if not found or if no handle is stored.
 */
export async function getFileHandle(
  pdfHash: string
): Promise<FileSystemFileHandle | null> {
  const db = await openDb();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const req = store.get(pdfHash);

    req.onsuccess = () => {
      const entry = req.result as LocalBookEntry | undefined;
      resolve(entry?.fileHandle ?? null);
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Save or update a thumbnail Blob for a book.
 * If an entry exists, updates only the thumbnail field.
 * If not, creates a new entry with thumbnail and null for fileHandle.
 */
export async function saveThumbnail(
  pdfHash: string,
  thumbnail: Blob
): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    // First, try to get the existing entry
    const getReq = store.get(pdfHash);

    getReq.onsuccess = () => {
      const existing = getReq.result as LocalBookEntry | undefined;
      const entry: LocalBookEntry = {
        pdfHash,
        fileHandle: existing?.fileHandle ?? null,
        thumbnail,
      };

      const putReq = store.put(entry);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Get the thumbnail Blob for a book.
 * Returns null if not found or if no thumbnail is stored.
 */
export async function getThumbnail(
  pdfHash: string
): Promise<Blob | null> {
  const db = await openDb();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const req = store.get(pdfHash);

    req.onsuccess = () => {
      const entry = req.result as LocalBookEntry | undefined;
      resolve(entry?.thumbnail ?? null);
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Remove a book's entry from IndexedDB.
 * Called when deleting from bookshelf.
 */
export async function removeEntry(pdfHash: string): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const req = store.delete(pdfHash);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
