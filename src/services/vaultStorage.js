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

export const addVaultFiles = async (files) => {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return [];

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const added = [];

    list.forEach((file) => {
      const entry = {
        name: file.name || "Untitled",
        type: file.type || "",
        size: Number(file.size || 0),
        addedAt: Date.now(),
        blob: file
      };
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
