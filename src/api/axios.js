import axios from "axios";
import { getApiBaseUrl } from "./baseUrl";
import { clearAuthStorage } from "../auth";

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
  if (base === "/api" && /^\/api(\/|$)/.test(url)) {
    config.url = url.replace(/^\/api(?=\/|$)/, "") || "/";
  }
  return config;
}

// 🔹 Attach Access Token Automatically
api.interceptors.request.use((config) => {
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

refreshClient.interceptors.request.use((config) => normalizeApiPath(config));

// 🔹 Handle Expired Token (401 ONLY)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error?.response?.status;
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
        return Promise.reject(refreshError);
      }
      clearAuthStorage();
      window.location.href = "/login";
      return Promise.reject(refreshError);
    }
  }
);

export default api;

