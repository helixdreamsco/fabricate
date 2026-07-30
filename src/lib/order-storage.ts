"use client";

const DB_NAME = "fabricate-pending-upload";
const STORE = "files";
const KEY = "draft";
/** Companion record to the pending file: choices made before /configure. */
const HINTS_KEY = "draft-hints";

/**
 * Settings already chosen upstream (today: quantity picked in the design
 * customiser) that /configure should adopt instead of its own defaults.
 * Kept separate from the File so the existing upload path is untouched.
 */
export type PendingHints = {
  quantity?: number;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePendingUpload(file: File): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(file, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadPendingUpload(): Promise<File | null> {
  const db = await openDB();
  try {
    return await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as File | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function clearPendingUpload(): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.delete(KEY);
      // Hints are only ever meaningful for the file they arrived with.
      store.delete(HINTS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function savePendingHints(hints: PendingHints): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(hints, HINTS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadPendingHints(): Promise<PendingHints | null> {
  const db = await openDB();
  try {
    return await new Promise<PendingHints | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(HINTS_KEY);
      req.onsuccess = () => resolve((req.result as PendingHints | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
