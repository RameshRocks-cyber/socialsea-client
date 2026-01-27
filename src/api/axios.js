import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// 🔐 Attach token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalReq = err.config;

    if (err.response?.status === 401 && !originalReq._retry) {
      originalReq._retry = true;

      try {
        const refreshToken = localStorage.getItem("refreshToken");

        const res = await axios.post(
          `${import.meta.env.VITE_API_URL}/auth/refresh`,
          { refreshToken }
        );

        localStorage.setItem("accessToken", res.data.accessToken);
        originalReq.headers.Authorization = `Bearer ${res.data.accessToken}`;

        return api(originalReq);
      } catch (e) {
        localStorage.clear();
        window.location.href = "/login";
      }
    }

    return Promise.reject(err);
  }
);

export default api;