import axios from "axios";
import { getApiBaseUrl } from "./baseUrl";
import { clearAuthStorage, setAuthSessionActive } from "../auth";
import { getOrCreateDeviceId } from "../deviceId";
import {
  buildGuardedResponse,
  clearEndpointGuard,
  getEndpointGuardKey,
  markEndpointDown,
  shouldSkipEndpoint
} from "./endpointGuard";

const normalizeBase = (value) => String(value || "").trim().replace(/\/+$/, "");
const readStoredBase = () => {
  try {
    return normalizeBase(
      localStorage.getItem("socialsea_auth_base_url") ||
        sessionStorage.getItem("socialsea_auth_base_url") ||
        ""
    );
  } catch {
    return "";
  }
};

const previousBase = readStoredBase();
const BASE_URL = getApiBaseUrl();
const nextBase = readStoredBase() || normalizeBase(BASE_URL);
const APP_ORIGIN = typeof window !== "undefined" ? String(window.location.origin || "").trim() : "";

const resolveRequestOrigin = (config) => {
  const rawUrl = String(config?.url || "").trim();
  const base = String(config?.baseURL || BASE_URL || "").trim();
  const baseForRelative = base || APP_ORIGIN || "http://localhost";
  try {
    const resolved = new URL(rawUrl || "/", baseForRelative);
    return String(resolved.origin || "").trim();
  } catch {
    return "";
  }
};

const TRUSTED_API_ORIGIN = (() => {
  try {
    return String(new URL(BASE_URL || "/api", APP_ORIGIN || "http://localhost").origin || "").trim();
  } catch {
    return "";
  }
})();

const RETRYABLE_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_METHODS = new Set(["get", "head", "options"]);
const MAX_AUTO_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 700;
const MAX_RETRY_DELAY_MS = 9000;
const AUTH_RECOVERY_LOCK_KEY = "socialsea_auth_recovery_lock_v1";
const AUTH_RECOVERY_LOCK_MAX_AGE_MS = 30 * 60 * 1000;
const AUTH_SESSION_KEY = "socialsea_auth_session_v1";

try {
  // Clean up any legacy localStorage copy from previous app versions.
  localStorage.removeItem(AUTH_RECOVERY_LOCK_KEY);
} catch {
  // ignore storage failures
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizePathForAuthLock = (url) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, "http://localhost");
    return String(parsed.pathname || "").trim().toLowerCase();
  } catch {
    return raw.split("?")[0].split("#")[0].trim().toLowerCase();
  }
};

const AUTH_LOCK_NOISY_READ_PATHS = new Set([
  "/api/follow/requests",
  "/api/follow/pending-requests",
  "/api/calls/inbox",
  "/calls/inbox",
]);

const getAuthSessionSnapshot = () => ({
  sessionState: String(sessionStorage.getItem(AUTH_SESSION_KEY) || "").trim(),
});

const readAuthRecoveryLock = () => {
  try {
    const raw = sessionStorage.getItem(AUTH_RECOVERY_LOCK_KEY) || "";
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const createdAt = Number(parsed.createdAt || 0);
    const sessionState = String(parsed.sessionState || "");
    if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
    return { createdAt, sessionState };
  } catch {
    return null;
  }
};

const clearAuthRecoveryLock = () => {
  try {
    sessionStorage.removeItem(AUTH_RECOVERY_LOCK_KEY);
    localStorage.removeItem(AUTH_RECOVERY_LOCK_KEY);
  } catch {
    // ignore storage failures
  }
};

const persistAuthRecoveryLock = () => {
  const snapshot = getAuthSessionSnapshot();
  const payload = JSON.stringify({
    createdAt: Date.now(),
    sessionState: snapshot.sessionState,
  });
  try {
    sessionStorage.setItem(AUTH_RECOVERY_LOCK_KEY, payload);
  } catch {
    // ignore storage failures
  }
};

const isAuthEndpointRequest = (config) => {
  const path = String(config?.url || "").trim().toLowerCase();
  if (!path) return false;
  return /^\/?auth(\/|$)/.test(path) || /^\/?api\/auth(\/|$)/.test(path);
};

const shouldShortCircuitProtectedRead = (config) => {
  if (!config || config?.skipAuth || isAuthEndpointRequest(config)) return false;

  const method = String(config.method || "get").trim().toLowerCase();
  if (method !== "get" && method !== "head" && method !== "options") {
    return false;
  }

  const lock = readAuthRecoveryLock();
  if (!lock) return false;

  if (Date.now() - lock.createdAt > AUTH_RECOVERY_LOCK_MAX_AGE_MS) {
    clearAuthRecoveryLock();
    return false;
  }

  const snapshot = getAuthSessionSnapshot();
  const lockMatchesSnapshot =
    lock.sessionState === snapshot.sessionState;

  if (!lockMatchesSnapshot) {
    clearAuthRecoveryLock();
    return false;
  }

  // Never block normal data-loading routes. Only quiet known noisy background pollers.
  const normalizedPath = normalizePathForAuthLock(config?.url);
  if (!AUTH_LOCK_NOISY_READ_PATHS.has(normalizedPath)) {
    return false;
  }

  return true;
};

const parseRetryAfterMs = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, asSeconds * 1000);
  }
  const asDateMs = new Date(raw).getTime();
  if (!Number.isFinite(asDateMs)) return 0;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, asDateMs - Date.now()));
};

const isTimeoutLikeError = (error) => {
  const code = String(error?.code || "").toUpperCase();
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("timeout");
};

const isNetworkLikeError = (error) => {
  const code = String(error?.code || "").toUpperCase();
  if (code === "ERR_NETWORK") return true;
  const message = String(error?.message || "");
  return message === "Network Error";
};

const getMaxRetries = (config) => {
  const parsed = Number(config?.maxRetries);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  return MAX_AUTO_RETRIES;
};

const isAutoRetryAllowed = (error, config) => {
  if (!config || config.disableAutoRetry === true) return false;
  const method = String(config.method || "get").toLowerCase();
  const forceRetry = config.retryable === true;
  if (!forceRetry && !RETRYABLE_METHODS.has(method)) return false;

  const retryCount = Number(config.__networkRetryCount || 0);
  if (retryCount >= getMaxRetries(config)) return false;

  const status = Number(error?.response?.status || 0);
  if (status === 401 || status === 403) return false;
  if (RETRYABLE_HTTP_STATUS.has(status)) return true;

  if (!status && (isTimeoutLikeError(error) || isNetworkLikeError(error))) return true;
  return false;
};

const computeRetryDelayMs = (error, retryCount) => {
  const retryAfterMs = parseRetryAfterMs(error?.response?.headers?.["retry-after"]);
  if (retryAfterMs > 0) return retryAfterMs;
  const exponentialMs = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** retryCount));
  const jitterMs = Math.floor(Math.random() * 250);
  return exponentialMs + jitterMs;
};

if (previousBase && nextBase && previousBase !== nextBase) {
  clearAuthStorage();
  clearAuthRecoveryLock();
  try {
    localStorage.removeItem("socialsea_profile_cache_v1");
    localStorage.removeItem("socialsea_following_cache_v1");
    localStorage.removeItem("socialsea_otp_base_url");
    sessionStorage.removeItem("socialsea_profile_cache_v1");
    sessionStorage.removeItem("socialsea_following_cache_v1");
    sessionStorage.removeItem("socialsea_otp_base_url");
  } catch {
    // ignore storage errors
  }
}

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

const refreshClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

function normalizeApiPath(config) {
  const base = String(config?.baseURL || "").replace(/\/+$/, "");
  const url = String(config?.url || "");
  const endsWithApi = base === "/api" || base.endsWith("/api");
  if (endsWithApi && /^\/api(\/|$)/.test(url)) {
    config.url = url.replace(/^\/api(?=\/|$)/, "") || "/";
  }
  return config;
}

// 🔹 Attach Access Token Automatically
api.interceptors.request.use((config) => {
  config.__networkRetryCount = Number(config.__networkRetryCount || 0);

  if (shouldShortCircuitProtectedRead(config)) {
    config.skipRefresh = true;
    config.suppressAuthRedirect = true;
    config.adapter = async () => ({
      data: [],
      status: 204,
      statusText: "No Content",
      headers: {
        "x-socialsea-auth-short-circuit": "1",
      },
      config,
    });
    return config;
  }

  const guardKey = getEndpointGuardKey(config);
  const bypassEndpointGuard = config?.bypassEndpointGuard === true;
  if (guardKey && !bypassEndpointGuard && shouldSkipEndpoint(guardKey)) {
    const data = buildGuardedResponse(guardKey);
    config.adapter = async () => ({
      data,
      status: 204,
      statusText: "No Content",
      headers: {},
      config
    });
    return config;
  }

  normalizeApiPath(config);
  const requestOrigin = resolveRequestOrigin(config);
  const allowCrossOriginAuth = config?.allowCrossOriginAuth === true;
  const isCrossOrigin =
    !!requestOrigin &&
    !!TRUSTED_API_ORIGIN &&
    requestOrigin !== TRUSTED_API_ORIGIN &&
    requestOrigin !== APP_ORIGIN;

  // Security hardening:
  // never attach bearer token to unexpected cross-origin requests unless explicitly allowed.
  if (isCrossOrigin && !allowCrossOriginAuth) {
    if (config.headers?.Authorization) delete config.headers.Authorization;
    return config;
  }

  try {
    const deviceId = getOrCreateDeviceId();
    if (deviceId) {
      config.headers = config.headers || {};
      config.headers["X-Device-Id"] = deviceId;
    }
  } catch {
    // ignore device-id failures
  }
  if (config?.skipAuth) {
    return config;
  }

  return config;
});

refreshClient.interceptors.request.use((config) => {
  normalizeApiPath(config);
  try {
    const deviceId = getOrCreateDeviceId();
    if (deviceId) {
      config.headers = config.headers || {};
      config.headers["X-Device-Id"] = deviceId;
    }
  } catch {
    // ignore device-id failures
  }
  return config;
});

// 🔹 Handle Expired Token (401 ONLY)
api.interceptors.response.use(
  (response) => {
    const guardKey = getEndpointGuardKey(response?.config);
    if (guardKey) clearEndpointGuard(guardKey);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) {
      return Promise.reject(error);
    }
    const status = error?.response?.status;
    const guardKey = getEndpointGuardKey(originalRequest);
    const bypassEndpointGuard = originalRequest?.bypassEndpointGuard === true;
    const requestOrigin = resolveRequestOrigin(originalRequest);
    const isTrustedOrigin =
      !!requestOrigin &&
      !!TRUSTED_API_ORIGIN &&
      requestOrigin === TRUSTED_API_ORIGIN;

    if (guardKey && !bypassEndpointGuard) {
      if (status === 404) {
        markEndpointDown(guardKey, { status, reason: "not-found" });
      } else if (status === 405) {
        markEndpointDown(guardKey, { status, reason: "method-not-allowed" });
      } else if (!status && error?.message === "Network Error") {
        markEndpointDown(guardKey, { status: 0, reason: "network-error" });
      }
    }

    if (isAutoRetryAllowed(error, originalRequest)) {
      const retryCount = Number(originalRequest.__networkRetryCount || 0);
      const delayMs = computeRetryDelayMs(error, retryCount);
      originalRequest.__networkRetryCount = retryCount + 1;
      await sleep(delayMs);
      return api(originalRequest);
    }

    if (originalRequest?.skipAuth) {
      return Promise.reject(error);
    }

    // Only retry on 401 (NOT 403)
    if (status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }
    if (originalRequest?.skipRefresh) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const response = await refreshClient.post("/api/auth/refresh", {});

      setAuthSessionActive(true);
      clearAuthRecoveryLock();

      return api(originalRequest);
    } catch (refreshError) {
      persistAuthRecoveryLock();
      if (originalRequest?.suppressAuthRedirect) {
        const refreshStatus = refreshError?.response?.status;
        if (isTrustedOrigin && (refreshStatus === 401 || refreshStatus === 403)) {
          clearAuthStorage();
        }
        return Promise.reject(refreshError);
      }
      clearAuthStorage();
      window.location.href = "/login";
      return Promise.reject(refreshError);
    }
  }
);

export default api;

