const DEFAULT_MAX_IDS = 2000;

const normalizeId = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

const isQuotaError = (err) => {
  if (!err) return false;
  const name = String(err?.name || "");
  const message = String(err?.message || "");
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  return message.toLowerCase().includes("exceeded the quota");
};

const trimUniqueIds = (raw, maxIds) => {
  const limit = Number.isFinite(maxIds) && maxIds > 0 ? Math.floor(maxIds) : DEFAULT_MAX_IDS;
  const output = [];
  const seen = new Set();

  for (let idx = raw.length - 1; idx >= 0; idx -= 1) {
    const normalized = normalizeId(raw[idx]);
    if (normalized == null) continue;
    const key = String(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }

  output.reverse();
  return output;
};

export const readIdListFromStorage = (key, options = {}) => {
  const storageKey = String(key || "").trim();
  if (!storageKey) return [];

  const maxIds = Number.isFinite(options.maxIds) ? options.maxIds : DEFAULT_MAX_IDS;

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);

    let extracted = [];
    if (Array.isArray(parsed)) {
      extracted = parsed;
    } else if (parsed && typeof parsed === "object") {
      extracted = Object.keys(parsed).filter((id) => parsed[id]);
    } else {
      return [];
    }

    if (!extracted.length) return [];

    const trimmed = trimUniqueIds(extracted, maxIds);
    if (extracted.length > trimmed.length) {
      writeIdListToStorage(storageKey, trimmed, { maxIds });
    }
    return trimmed;
  } catch {
    return [];
  }
};

export const writeIdListToStorage = (key, ids, options = {}) => {
  const storageKey = String(key || "").trim();
  if (!storageKey) return;

  const maxIds = Number.isFinite(options.maxIds) ? options.maxIds : DEFAULT_MAX_IDS;
  const list = Array.isArray(ids) ? ids : [];
  const trimmed = trimUniqueIds(list, maxIds);

  const attemptWrite = (value) => {
    localStorage.setItem(storageKey, JSON.stringify(value));
  };

  try {
    attemptWrite(trimmed);
    return;
  } catch (err) {
    if (!isQuotaError(err)) return;
  }

  const fallbacks = [Math.min(500, maxIds), 200, 100, 50, 20].filter((n) => n > 0);
  for (const size of fallbacks) {
    try {
      attemptWrite(trimmed.slice(-size));
      return;
    } catch {
      // keep shrinking
    }
  }

  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore storage failures
  }
};

export const readIdMapFromStorage = (key, options = {}) => {
  const ids = readIdListFromStorage(key, options);
  const map = {};
  ids.forEach((id) => {
    map[id] = true;
  });
  return map;
};

export const writeIdMapToStorage = (key, map, options = {}) => {
  const ids = [];
  Object.keys(map || {}).forEach((id) => {
    if (!map[id]) return;
    const normalized = normalizeId(id);
    if (normalized == null) return;
    ids.push(normalized);
  });
  writeIdListToStorage(key, ids, options);
};

