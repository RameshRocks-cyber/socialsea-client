const DB_NAME = "socialsea_local_media_v1";
const STORE_NAME = "recordings";
const DB_VERSION = 1;
const IDB_MEDIA_PREFIX = "idb:sos-recording:";

const openDb = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });

const waitForTx = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });

export const buildIdbMediaRef = (key) => {
  const text = String(key || "").trim();
  if (!text) return "";
  return `${IDB_MEDIA_PREFIX}${encodeURIComponent(text)}`;
};

export const parseIdbMediaRef = (value) => {
  const raw = String(value || "").trim();
  if (!raw.toLowerCase().startsWith(IDB_MEDIA_PREFIX)) return "";
  const encoded = raw.slice(IDB_MEDIA_PREFIX.length);
  if (!encoded) return "";
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
};

export const isIdbMediaRef = (value) => Boolean(parseIdbMediaRef(value));

export const saveRecordingBlob = async (key, blob, meta = {}) => {
  const id = String(key || "").trim();
  if (!id) throw new Error("Missing recording id");
  if (!blob) throw new Error("Missing recording blob");
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(
      {
        blob,
        mime: String(meta?.mime || blob?.type || ""),
        size: Number(blob?.size || 0),
        updatedAt: new Date().toISOString()
      },
      id
    );
    await waitForTx(tx);
  } finally {
    db.close();
  }
};

export const loadRecordingBlob = async (key) => {
  const id = String(key || "").trim();
  if (!id) return null;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    const record = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
    });
    return record?.blob || null;
  } finally {
    db.close();
  }
};

export const deleteRecordingBlob = async (key) => {
  const id = String(key || "").trim();
  if (!id) return;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    await waitForTx(tx);
  } finally {
    db.close();
  }
};
