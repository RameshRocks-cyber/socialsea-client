import axios from "axios";
import { getApiBaseUrl } from "./baseUrl";
import { clearAuthStorage } from "../auth";

const BASE_URL = getApiBaseUrl();
const AUTH_BASE_KEY = "socialsea_auth_base_url";
const STORED_BASE_URL = (() => {
  try {
    return (
      localStorage.getItem(AUTH_BASE_KEY) ||
      sessionStorage.getItem(AUTH_BASE_KEY) ||
      ""
    );
  } catch {
    return "";
  }
})();
const ACTIVE_BASE_URL = BASE_URL || STORED_BASE_URL;

// Keep the last used API base for diagnostics/fallback continuity.
// Do NOT force-clear auth on base change; fallback retries can temporarily switch base
// and would otherwise log users out on refresh.
try {
  if (BASE_URL) {
    localStorage.setItem(AUTH_BASE_KEY, BASE_URL);
    sessionStorage.setItem(AUTH_BASE_KEY, BASE_URL);
  } else if (ACTIVE_BASE_URL) {
    localStorage.setItem(AUTH_BASE_KEY, ACTIVE_BASE_URL);
    sessionStorage.setItem(AUTH_BASE_KEY, ACTIVE_BASE_URL);
  }
} catch {
  // ignore storage errors
}

const api = axios.create({
  baseURL: ACTIVE_BASE_URL,
});

const refreshClient = axios.create({
  baseURL: ACTIVE_BASE_URL,
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

