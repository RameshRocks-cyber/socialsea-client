import axios from "axios";
import { getApiBaseUrl } from "./baseUrl";
import { clearAuthStorage } from "../auth";

const BASE_URL = getApiBaseUrl();
const AUTH_BASE_KEY = "socialsea_auth_base_url";
const IS_HTTPS_PAGE =
  typeof window !== "undefined" && window.location.protocol === "https:";
const FALLBACK_BASE_URLS = [
  BASE_URL,
  "http://localhost:8080",
  "http://43.205.213.14:8080",
  "/api",
  "https://api.socialsea.co.in",
]
  .filter((value, index, arr) => value && arr.indexOf(value) === index)
  .filter((value) => !(IS_HTTPS_PAGE && /^http:\/\//i.test(value)));

// Tokens from one backend (localhost/remote) are not valid on another backend.
// If API base changes, clear auth once and force fresh login for this backend.
try {
  const prevBase = localStorage.getItem(AUTH_BASE_KEY) || sessionStorage.getItem(AUTH_BASE_KEY);
  if (prevBase && prevBase !== BASE_URL) {
    clearAuthStorage();
  }
  localStorage.setItem(AUTH_BASE_KEY, BASE_URL);
  sessionStorage.setItem(AUTH_BASE_KEY, BASE_URL);
} catch {
  // ignore storage errors
}

const api = axios.create({
  baseURL: BASE_URL,
});

const refreshClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

// 🔹 Attach Access Token Automatically
api.interceptors.request.use((config) => {
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

// 🔹 Handle Expired Token (401 ONLY)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error?.response?.status;

    // Network/CORS failures often come with no HTTP status. Retry on alternate API base URLs.
    if (!error?.response && originalRequest) {
      const tried = Array.isArray(originalRequest._triedBaseUrls)
        ? originalRequest._triedBaseUrls
        : [];
      const currentBase = originalRequest.baseURL || api.defaults.baseURL || BASE_URL;
      const nextBase = FALLBACK_BASE_URLS.find(
        (base) => base !== currentBase && !tried.includes(base)
      );

      if (nextBase) {
        originalRequest._triedBaseUrls = [...tried, currentBase];
        originalRequest.baseURL = nextBase;
        api.defaults.baseURL = nextBase;
        refreshClient.defaults.baseURL = nextBase;
        try {
          localStorage.setItem(AUTH_BASE_KEY, nextBase);
          sessionStorage.setItem(AUTH_BASE_KEY, nextBase);
        } catch {
          // ignore storage errors
        }
        return api(originalRequest);
      }
    }

    // Only retry on 401 (NOT 403)
    if (status !== 401 || originalRequest._retry) {
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

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

      return api(originalRequest);
    } catch (refreshError) {
      // If refresh fails → force logout
      clearAuthStorage();
      window.location.href = "/login";
      return Promise.reject(refreshError);
    }
  }
);

export default api;
