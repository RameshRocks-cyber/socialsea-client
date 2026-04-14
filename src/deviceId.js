const DEVICE_ID_KEY = "socialsea_device_id_v1";

const readStored = () => {
  try {
    const raw = localStorage.getItem(DEVICE_ID_KEY);
    return raw ? String(raw).trim() : "";
  } catch {
    return "";
  }
};

const writeStored = (value) => {
  try {
    localStorage.setItem(DEVICE_ID_KEY, String(value));
  } catch {
    // ignore storage errors
  }
};

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2);
  return `d_${Date.now().toString(36)}_${rand}`;
};

export function getOrCreateDeviceId() {
  const existing = readStored();
  if (existing) return existing;
  const next = generateId();
  writeStored(next);
  return next;
}

export function getDeviceId() {
  return readStored();
}

