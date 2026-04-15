import api from "./axios";
import { getApiBaseUrl } from "./baseUrl";

const CHAT_SERVER_BASE_KEY = "socialsea_chat_server_base_v1";
const CHAT_PRESENCE_PROBE_KEY = "socialsea_chat_presence_probe_v1";
const CHAT_PRESENCE_PROBE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const normalizeBaseCandidate = (rawValue) => {
  const value = String(rawValue || "").trim().replace(/\/+$/, "");
  if (!value || value === "/") return "";
  if (value.startsWith("/")) return value;
  if (!/^https?:\/\//i.test(value)) return "";
  return value;
};

const readStoredValue = (key) => {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const uniqueList = (items) =>
  items.filter((value, index, arr) => value && arr.indexOf(value) === index);

const readPresenceProbe = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHAT_PRESENCE_PROBE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const method = String(parsed?.method || "").trim().toUpperCase();
    const url = String(parsed?.url || "").trim();
    const at = Number(parsed?.at || 0);
    if (!method || !url || !Number.isFinite(at) || at <= 0) return null;
    if (Date.now() - at > CHAT_PRESENCE_PROBE_MAX_AGE_MS) return null;
    return { method, url };
  } catch {
    return null;
  }
};

const writePresenceProbe = ({ method, url } = {}) => {
  if (typeof window === "undefined") return;
  const m = String(method || "").trim().toUpperCase();
  const u = String(url || "").trim();
  if (!m || !u) return;
  try {
    localStorage.setItem(CHAT_PRESENCE_PROBE_KEY, JSON.stringify({ method: m, url: u, at: Date.now() }));
  } catch {
    // ignore storage failures
  }
};

const resolveRuntimeBase = () => {
  if (typeof window === "undefined") return "";
  const host = String(window.location.hostname || "").trim().toLowerCase();
  if (!host) return "";
  if (host === "localhost" || host === "127.0.0.1") {
    return `http://${host}:8080`;
  }
  return "";
};

export const buildChatPresenceBases = () =>
  uniqueList(
    [
      "/api",
      readStoredValue(CHAT_SERVER_BASE_KEY),
      readStoredValue("socialsea_auth_base_url"),
      readStoredValue("socialsea_otp_base_url"),
      import.meta.env?.VITE_DEV_PROXY_TARGET,
      import.meta.env?.VITE_API_BASE_URL,
      import.meta.env?.VITE_API_URL,
      api.defaults.baseURL,
      getApiBaseUrl(),
      resolveRuntimeBase()
    ]
      .map(normalizeBaseCandidate)
      .filter(Boolean)
  );

export const pingChatPresence = async ({ timeoutMs = 4000 } = {}) => {
  const bases = buildChatPresenceBases();
  if (!bases.length) return false;
  const probe = readPresenceProbe();
  const endpoints = uniqueList([probe?.url, "/api/chat/presence", "/chat/presence"]);
  const methods = uniqueList([probe?.method, "GET", "POST"].filter(Boolean));

  for (const baseURL of bases) {
    for (const url of endpoints) {
      for (const method of methods) {
        try {
          await api.request({
            method,
            url,
            baseURL,
            timeout: timeoutMs,
            suppressAuthRedirect: true,
            allowCrossOriginAuth: true,
            bypassEndpointGuard: true
          });
          writePresenceProbe({ method, url });
          return true;
        } catch (err) {
          const status = Number(err?.response?.status || 0);
          if (status === 401 || status === 403) {
            return false;
          }
        }
      }
    }
  }
  return false;
};
