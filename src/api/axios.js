import axios from "axios";

const rawBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  ""
).trim();

const normalizeBase = (base) => base.replace(/\/+$/, "");

const resolveApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    const pageProtocol = window.location.protocol;
    const host = window.location.hostname;
    const isLocalHost =
      host === "localhost" || host === "127.0.0.1" || host === "::1";

    if (rawBaseUrl && rawBaseUrl !== "undefined") {
      const normalizedEnvBase = normalizeBase(rawBaseUrl);
      if (pageProtocol === "https:" && normalizedEnvBase.startsWith("http://")) {
        return normalizedEnvBase.replace(/^http:\/\//i, "https://");
      }
      return normalizedEnvBase;
    }

    if (!isLocalHost && host === "socialsea.co.in") {
      return "https://api.socialsea.co.in";
    }

    if (!isLocalHost) {
      return normalizeBase(window.location.origin);
    }
  }

  if (rawBaseUrl && rawBaseUrl !== "undefined") {
    return normalizeBase(rawBaseUrl);
  }

  return "http://localhost:8080";
};

export const API_BASE_URL = resolveApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 12000,
});

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 12000,
});

api.interceptors.request.use((config) => {
  const url = config?.url || "";
  const isPublicAuth =
    /\/auth\/(send-otp|verify-otp|refresh|login|register)\b/i.test(url);
  const token =
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("accessToken") ||
    sessionStorage.getItem("token");
  const normalized = token && token !== "null" && token !== "undefined" ? token.trim() : "";
  if (normalized && !isPublicAuth) {
    config.headers.Authorization = `Bearer ${normalized}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error?.response?.status;
    if ((status !== 401 && status !== 403) || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) {
      return Promise.reject(error);
    }

    try {
      const res = await refreshClient.post("/api/auth/refresh", { refreshToken });
      const newToken = res?.data?.accessToken || res?.data?.token;
      if (!newToken) {
        throw new Error("Missing access token");
      }
      localStorage.setItem("accessToken", newToken);
      localStorage.setItem("token", newToken);
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshError) {
      const status = refreshError?.response?.status;
      if (status === 401) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        sessionStorage.removeItem("accessToken");
        sessionStorage.removeItem("token");
        window.location.href = "/login";
      }
      return Promise.reject(refreshError);
    }
  }
);

export default api;
