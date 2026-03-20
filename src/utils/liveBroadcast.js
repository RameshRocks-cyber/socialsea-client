import api from "../api/axios";

export const LIVE_BROADCAST_KEY = "socialsea_live_broadcast_v1";
const LIVE_BROADCAST_API = "/api/live-broadcast";
const LIVE_BROADCAST_DISABLE_MS = 5 * 60 * 1000;
let pollTimer = 0;
let pollSubscribers = 0;
let liveBroadcastDisabledUntil = 0;

const parsePayload = (raw) => {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
};

const normalizePayload = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  if (payload.active === false) return null;
  const expiresAt = Number(payload.expiresAt || 0);
  if (expiresAt && Date.now() > expiresAt) return null;
  return { ...payload, active: payload.active !== false };
};

const writeLocal = (payload) => {
  if (typeof window === "undefined") return;
  if (!payload) {
    localStorage.removeItem(LIVE_BROADCAST_KEY);
    window.dispatchEvent(new CustomEvent("socialsea-live-update", { detail: null }));
    return;
  }
  localStorage.setItem(LIVE_BROADCAST_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent("socialsea-live-update", { detail: payload }));
};

export const readLiveBroadcast = () => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LIVE_BROADCAST_KEY);
  return normalizePayload(parsePayload(raw));
};

export const writeLiveBroadcast = (payload) => {
  if (typeof window === "undefined") return Promise.resolve(false);
  const normalized = normalizePayload(payload || {});
  if (normalized) {
    writeLocal(normalized);
  }
  return api.post(`${LIVE_BROADCAST_API}/start`, payload || {})
    .then((res) => {
      liveBroadcastDisabledUntil = 0;
      const serverPayload = normalizePayload(res?.data);
      if (serverPayload) writeLocal(serverPayload);
      return true;
    })
    .catch(() => false);
};

export const clearLiveBroadcast = () => {
  if (typeof window === "undefined") return;
  writeLocal(null);
  api.post(`${LIVE_BROADCAST_API}/stop`, {}, { suppressAuthRedirect: true })
    .catch(() => {});
};

export const fetchLiveBroadcast = async () => {
  if (typeof window === "undefined") return null;
  if (liveBroadcastDisabledUntil && Date.now() < liveBroadcastDisabledUntil) {
    return readLiveBroadcast();
  }
  try {
    const res = await api.get(`${LIVE_BROADCAST_API}/active`, { skipAuth: true, suppressAuthRedirect: true });
    const normalized = normalizePayload(res?.data);
    writeLocal(normalized);
    return normalized;
  } catch (err) {
    if (err?.response?.status === 404) {
      liveBroadcastDisabledUntil = Date.now() + LIVE_BROADCAST_DISABLE_MS;
    }
    return readLiveBroadcast();
  }
};

const startPolling = () => {
  if (pollTimer) return;
  pollTimer = window.setInterval(() => {
    fetchLiveBroadcast().catch(() => {});
  }, 15000);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = 0;
  }
};

export const subscribeLiveBroadcast = (handler) => {
  const onStorage = (event) => {
    if (event?.key !== LIVE_BROADCAST_KEY) return;
    handler(readLiveBroadcast());
  };
  const onLocal = () => handler(readLiveBroadcast());
  window.addEventListener("storage", onStorage);
  window.addEventListener("socialsea-live-update", onLocal);
  fetchLiveBroadcast().catch(() => {});
  pollSubscribers += 1;
  startPolling();
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("socialsea-live-update", onLocal);
    pollSubscribers = Math.max(0, pollSubscribers - 1);
    if (!pollSubscribers) stopPolling();
  };
};
