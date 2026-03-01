import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

const refreshClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// 🔹 Attach Access Token Automatically
api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("accessToken");

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

    // Only retry on 401 (NOT 403)
    if (status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    const refreshToken = localStorage.getItem("refreshToken");
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

      localStorage.setItem("accessToken", newAccessToken);

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

      return api(originalRequest);
    } catch (refreshError) {
      // If refresh fails → force logout
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      sessionStorage.removeItem("accessToken");

      window.location.href = "/login";
      return Promise.reject(refreshError);
    }
  }
);

export default api;