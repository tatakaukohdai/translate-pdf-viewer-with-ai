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

export async function saveFileHandle(
  pdfHash: string,
  fileHandle: FileSystemFileHandle
): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error ?? new Error('IDB transaction failed'));
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

export async function getFileHandle(
  pdfHash: string
): Promise<FileSystemFileHandle | null> {
  const db = await openDb();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error ?? new Error('IDB transaction failed'));
    const req = store.get(pdfHash);

    req.onsuccess = () => {
      const entry = req.result as LocalBookEntry | undefined;
      resolve(entry?.fileHandle ?? null);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function saveThumbnail(
  pdfHash: string,
  thumbnail: Blob
): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error ?? new Error('IDB transaction failed'));
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

export async function getThumbnail(
  pdfHash: string
): Promise<Blob | null> {
  const db = await openDb();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error ?? new Error('IDB transaction failed'));
    const req = store.get(pdfHash);

    req.onsuccess = () => {
      const entry = req.result as LocalBookEntry | undefined;
      resolve(entry?.thumbnail ?? null);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function removeEntry(pdfHash: string): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error ?? new Error('IDB transaction failed'));
    const req = store.delete(pdfHash);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
