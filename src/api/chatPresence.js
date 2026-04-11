import api from "./axios";
import { getApiBaseUrl } from "./baseUrl";

const CHAT_SERVER_BASE_KEY = "socialsea_chat_server_base_v1";

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
      readStoredValue(CHAT_SERVER_BASE_KEY),
      readStoredValue("socialsea_auth_base_url"),
      readStoredValue("socialsea_otp_base_url"),
      import.meta.env?.VITE_DEV_PROXY_TARGET,
      import.meta.env?.VITE_API_BASE_URL,
      import.meta.env?.VITE_API_URL,
      api.defaults.baseURL,
      getApiBaseUrl(),
      resolveRuntimeBase(),
      "/api"
    ]
      .map(normalizeBaseCandidate)
      .filter(Boolean)
  );

export const pingChatPresence = async ({ timeoutMs = 4000 } = {}) => {
  const bases = buildChatPresenceBases();
  if (!bases.length) return false;
  const endpoints = ["/api/chat/presence", "/chat/presence"];
  const methods = ["POST", "GET"];

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
            allowCrossOriginAuth: true
          });
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
