import api from "../api/axios";

const DB_NAME = "socialsea_vault_v1";
const STORE_NAME = "vault_items";
const DB_VERSION = 1;
const VAULT_LOCK_KEY = "socialsea_vault_lock_v1";
const VAULT_UNLOCK_KEY = "socialsea_vault_unlock_v1";

export const isVaultSupported = () =>
  typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

const safeSessionGet = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSessionSet = (key, value) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
};

const safeSessionRemove = (key) => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
};

const safeLocalGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeLocalSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
};

const safeLocalRemove = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
};

const sanitizeImageIds = (ids) =>
  (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);

export const readVaultLock = () => {
  try {
    const raw = safeLocalGet(VAULT_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const imageIds = sanitizeImageIds(parsed.imageIds);
    if (!imageIds.length) {
      safeLocalRemove(VAULT_LOCK_KEY);
      return null;
    }
    return {
      imageIds,
      createdAt: Number(parsed.createdAt || Date.now())
    };
  } catch {
    return null;
  }
};

export const saveVaultLock = (lock) => {
  const imageIds = sanitizeImageIds(lock?.imageIds);
  if (!imageIds.length) return;
  safeLocalSet(
    VAULT_LOCK_KEY,
    JSON.stringify({
      imageIds,
      createdAt: Number(lock.createdAt || Date.now())
    })
  );
};

export const clearVaultLock = () => {
  safeLocalRemove(VAULT_LOCK_KEY);
};

const normalizeLock = (value) => {
  const imageIds = sanitizeImageIds(value?.imageIds);
  if (!imageIds.length) return null;
  return {
    imageIds,
    createdAt: Number(value?.createdAt || Date.now())
  };
};

export const readVaultLockSynced = async () => {
  try {
    const res = await api.get("/api/vault/lock");
    const data = res?.data || {};
    if (!data?.configured) {
      clearVaultLock();
      return null;
    }
    const lock = normalizeLock(data);
    if (!lock) {
      clearVaultLock();
      return null;
    }
    saveVaultLock(lock);
    return lock;
  } catch {
    return readVaultLock();
  }
};

export const saveVaultLockSynced = async (lock) => {
  const normalized = normalizeLock(lock);
  if (!normalized) {
    throw new Error("Invalid vault lock");
  }
  await api.post("/api/vault/lock", normalized);
  saveVaultLock(normalized);
  return normalized;
};

export const clearVaultLockSynced = async () => {
  try {
    await api.delete("/api/vault/lock");
  } finally {
    clearVaultLock();
  }
};

const buildVaultSig = (lock) => {
  const imageIds = sanitizeImageIds(lock?.imageIds);
  if (!imageIds.length) return "";
  return imageIds.join("|");
};

export const isVaultUnlocked = (lock) => {
  const sig = buildVaultSig(lock);
  if (!sig) return false;
  return safeSessionGet(VAULT_UNLOCK_KEY) === sig;
};

export const setVaultUnlocked = (lock) => {
  const sig = buildVaultSig(lock);
  if (!sig) return;
  safeSessionSet(VAULT_UNLOCK_KEY, sig);
};

export const clearVaultUnlocked = () => {
  safeSessionRemove(VAULT_UNLOCK_KEY);
};

const openDb = () =>
  new Promise((resolve, reject) => {
    if (!isVaultSupported()) {
      reject(new Error("Browser storage is not supported"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open storage"));
  });

const normalizeVaultMeta = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next = {};
  Object.entries(value).forEach(([key, raw]) => {
    const safeKey = String(key || "").trim();
    if (!safeKey || raw == null) return;
    if (typeof raw === "string") {
      const text = raw.trim();
      if (!text) return;
      next[safeKey] = text;
      return;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      next[safeKey] = raw;
    }
  });
  return next;
};

const normalizeVaultFileInput = (value) => {
  if (!value) return null;
  if (value instanceof Blob) {
    return {
      blob: value,
      name: value.name,
      type: value.type,
      source: "",
      meta: {}
    };
  }
  if (typeof value !== "object") return null;
  const blob = value.file instanceof Blob ? value.file : value.blob instanceof Blob ? value.blob : null;
  if (!blob) return null;
  return {
    blob,
    name: value.name,
    type: value.type,
    source: String(value.source || "").trim(),
    meta: normalizeVaultMeta(value.meta)
  };
};

export const addVaultFiles = async (files, options = {}) => {
  const sourceFromOptions = String(options?.source || "").trim();
  const sharedMeta = normalizeVaultMeta(options?.meta);
  const list = Array.from(files || [])
    .map(normalizeVaultFileInput)
    .filter(Boolean);
  if (!list.length) return [];

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const added = [];

    list.forEach((item) => {
      const file = item.blob;
      const entryMeta = {
        ...sharedMeta,
        ...item.meta
      };
      const source = String(item.source || sourceFromOptions || entryMeta.source || "").trim();
      if (source) entryMeta.source = source;
      const entry = {
        name: item.name || file.name || "Untitled",
        type: item.type || file.type || "",
        size: Number(file.size || 0),
        addedAt: Date.now(),
        blob: file
      };
      if (source) entry.source = source;
      if (Object.keys(entryMeta).length) entry.meta = entryMeta;
      const req = store.add(entry);
      req.onsuccess = () => {
        added.push({ ...entry, id: req.result });
      };
    });

    tx.oncomplete = () => {
      db.close();
      resolve(added);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Failed to save files"));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Failed to save files"));
    };
  });
};

export const getVaultItems = async () => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const items = Array.isArray(req.result) ? req.result : [];
      items.sort((a, b) => Number(b.addedAt || 0) - Number(a.addedAt || 0));
      resolve(items);
    };
    req.onerror = () => {
      reject(req.error || new Error("Failed to load files"));
    };
    tx.oncomplete = () => {
      db.close();
    };
    tx.onerror = () => {
      db.close();
    };
  });
};

export const getVaultCount = async () => {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(Number(req.result || 0));
    req.onerror = () => resolve(0);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};

export const removeVaultItem = async (id) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("Failed to remove item"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};

export const clearVault = async () => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("Failed to clear storage"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};
