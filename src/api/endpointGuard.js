const STORAGE_KEY = "socialsea_endpoint_guard_v1";

const DEFAULT_TTLS_MS = {
  chat_presence: 5 * 60 * 1000,
  profile_language: 12 * 60 * 60 * 1000,
  notifications: 30 * 60 * 1000,
  notifications_mark: 30 * 60 * 1000
};

const now = () => Date.now();

const safeParse = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const readState = () => {
  if (typeof window === "undefined") return {};
  const raw = safeParse(localStorage.getItem(STORAGE_KEY));
  return raw && typeof raw === "object" ? raw : {};
};

const writeState = (state) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state || {}));
  } catch {
    // ignore storage failures
  }
};

const normalizeKey = (key) => String(key || "").trim().toLowerCase();

const getTtl = (key) => DEFAULT_TTLS_MS[key] || 10 * 60 * 1000;

const pruneExpired = (state) => {
  const next = { ...(state || {}) };
  const ts = now();
  let changed = false;
  Object.keys(next).forEach((key) => {
    if (!next[key] || !Number.isFinite(next[key].until) || next[key].until <= ts) {
      delete next[key];
      changed = true;
    }
  });
  return changed ? next : state;
};

export const getEndpointGuardKey = (config) => {
  const rawUrl = String(config?.url || "").trim().toLowerCase();
  if (!rawUrl) return "";
  if (rawUrl.startsWith("/api/chat/presence") || rawUrl.startsWith("/chat/presence")) return "chat_presence";
  if (rawUrl.startsWith("/api/profile/me/language") || rawUrl.startsWith("/profile/me/language")) return "profile_language";
  if (rawUrl.startsWith("/api/notifications/read-all") || rawUrl.startsWith("/api/notifications/mark-all-read")) {
    return "notifications_mark";
  }
  if (rawUrl.startsWith("/api/notifications")) return "notifications";
  return "";
};

export const shouldSkipEndpoint = (key) => {
  const normalized = normalizeKey(key);
  if (!normalized) return false;
  let state = readState();
  state = pruneExpired(state);
  if (state !== null) writeState(state);
  return Boolean(state?.[normalized]);
};

export const markEndpointDown = (key, info = {}) => {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  const state = pruneExpired(readState());
  const ttl = getTtl(normalized);
  state[normalized] = {
    until: now() + ttl,
    at: now(),
    status: info?.status || null,
    reason: info?.reason || "unavailable"
  };
  writeState(state);
};

export const clearEndpointGuard = (key) => {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  const state = readState();
  if (!state?.[normalized]) return;
  delete state[normalized];
  writeState(state);
};

export const buildGuardedResponse = (key) => {
  const normalized = normalizeKey(key);
  if (normalized === "notifications" || normalized === "notifications_mark") {
    return [];
  }
  return null;
};
