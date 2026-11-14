import { BoardNotebook, BoardPage } from '../types/board';

const DB_NAME = 'SmartDigitalBlackboardDB';
const DB_VERSION = 1;
const STORE_NOTEBOOKS = 'notebooks';
const STORE_META = 'meta';
const ACTIVE_NOTEBOOK_KEY = 'activeNotebookId';

export function createId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultPage(index = 1): BoardPage {
  return {
    id: createId('page'),
    title: `Page ${index}`,
    background: 'black',
    paper: 'plain',
    elements: [],
    updatedAt: Date.now(),
  };
}

export function createDefaultNotebook(name = 'Mathematics Lecture 1'): BoardNotebook {
  const firstPage = createDefaultPage(1);
  return {
    id: createId('nb'),
    name,
    pages: [firstPage],
    currentPageId: firstPage.id,
    updatedAt: Date.now(),
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NOTEBOOKS)) {
        db.createObjectStore(STORE_NOTEBOOKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveNotebookLocal(notebook: BoardNotebook): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NOTEBOOKS, STORE_META], 'readwrite');
      tx.objectStore(STORE_NOTEBOOKS).put(notebook);
      tx.objectStore(STORE_META).put({ key: ACTIVE_NOTEBOOK_KEY, value: notebook.id });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to localStorage for small payloads
    try {
      localStorage.setItem(`sdb_nb_${notebook.id}`, JSON.stringify(notebook));
      localStorage.setItem('sdb_active_id', notebook.id);
    } catch {
      // Ignore quota exceeded
    }
  }
}

export async function loadAllNotebooksLocal(): Promise<{
  notebooks: BoardNotebook[];
  activeId: string | null;
}> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NOTEBOOKS, STORE_META], 'readonly');
      const nbReq = tx.objectStore(STORE_NOTEBOOKS).getAll();
      const metaReq = tx.objectStore(STORE_META).get(ACTIVE_NOTEBOOK_KEY);
      tx.oncomplete = () => {
        const notebooks = (nbReq.result as BoardNotebook[]) || [];
        notebooks.sort((a, b) => b.updatedAt - a.updatedAt);
        const activeId = (metaReq.result as { value?: string } | undefined)?.value ?? null;
        resolve({ notebooks, activeId });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return { notebooks: [], activeId: null };
  }
}

export async function deleteNotebookLocal(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NOTEBOOKS, 'readwrite');
      tx.objectStore(STORE_NOTEBOOKS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.removeItem(`sdb_nb_${id}`);
  }
}
