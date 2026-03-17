export const LIVE_BROADCAST_KEY = "socialsea_live_broadcast_v1";

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

export const readLiveBroadcast = () => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LIVE_BROADCAST_KEY);
  const data = parsePayload(raw);
  if (!data || data.active === false) return null;
  const expiresAt = Number(data.expiresAt || 0);
  if (expiresAt && Date.now() > expiresAt) {
    localStorage.removeItem(LIVE_BROADCAST_KEY);
    return null;
  }
  return data;
};

export const writeLiveBroadcast = (payload) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(LIVE_BROADCAST_KEY, JSON.stringify(payload || {}));
  window.dispatchEvent(new CustomEvent("socialsea-live-update", { detail: payload || null }));
};

export const clearLiveBroadcast = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LIVE_BROADCAST_KEY);
  window.dispatchEvent(new CustomEvent("socialsea-live-update", { detail: null }));
};

export const subscribeLiveBroadcast = (handler) => {
  const onStorage = (event) => {
    if (event?.key !== LIVE_BROADCAST_KEY) return;
    handler(readLiveBroadcast());
  };
  const onLocal = () => handler(readLiveBroadcast());
  window.addEventListener("storage", onStorage);
  window.addEventListener("socialsea-live-update", onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("socialsea-live-update", onLocal);
  };
};
