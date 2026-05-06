import axios from "axios";
import { getApiBaseUrl } from "./baseUrl";
import { clearAuthStorage } from "../auth";
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (config.headers?.Authorization) {
      delete config.headers.Authorization;
    }
    return config;
  }
  const token =
    sessionStorage.getItem("accessToken") ||
    sessionStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");

  if (token && token !== "null" && token !== "undefined") {
    config.headers.Authorization = `Bearer ${token.trim()}`;
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

    const refreshToken =
      sessionStorage.getItem("refreshToken") ||
      localStorage.getItem("refreshToken");
    if (!refreshToken) {
      if (isTrustedOrigin) {
        clearAuthStorage();
        if (!originalRequest?.suppressAuthRedirect) {
          window.location.href = "/login";
        }
      }
      return Promise.reject(error);
    }

    try {
      const response = await refreshClient.post("/api/auth/refresh", {
        refreshToken,
      });

      const newAccessToken =
        response.data?.accessToken || response.data?.token;

      if (!newAccessToken) {
        throw new Error("No new access token received");
      }

      // Keep auth tab-scoped to avoid cross-window account collisions.
      sessionStorage.setItem("accessToken", newAccessToken);
      sessionStorage.setItem("token", newAccessToken);
      localStorage.setItem("accessToken", newAccessToken);
      localStorage.setItem("token", newAccessToken);

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

      return api(originalRequest);
    } catch (refreshError) {
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

