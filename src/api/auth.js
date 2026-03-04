import api from "./axios";

const OTP_BASE_KEY = "socialsea_otp_base_url";

export const sendOtp = (email) => {
  const value = String(email || "").trim();
  const payloads = [
    { email: value },
    { username: value },
    { identifier: value, email: value, username: value },
  ];
  const endpoints = ["/api/auth/send-otp", "/auth/send-otp"];

  const run = async () => {
    let lastError = null;
    for (const url of endpoints) {
      for (const body of payloads) {
        try {
          const res = await api.post(url, body);
          const usedBase = res?.config?.baseURL || api.defaults.baseURL || "";
          if (usedBase) {
            try {
              sessionStorage.setItem(OTP_BASE_KEY, usedBase);
              localStorage.setItem(OTP_BASE_KEY, usedBase);
            } catch {
              // ignore storage errors
            }
          }
          return res;
        } catch (err) {
          lastError = err;
          const status = err?.response?.status;
          if (!(status === 400 || status === 404 || status === 405 || (status >= 500 && status <= 599))) {
            throw err;
          }
        }
      }
    }
    throw lastError || new Error("Failed to send OTP");
  };

  return run();
};

export const verifyOtp = (email, otp) => {
  const value = String(email || "").trim();
  const code = String(otp || "").trim();
  const otpBase =
    sessionStorage.getItem(OTP_BASE_KEY) ||
    localStorage.getItem(OTP_BASE_KEY) ||
    api.defaults.baseURL;
  const verifyPayloads = [
    { email: value, otp: code },
    { username: value, otp: code },
    { email: value, code },
    { username: value, code },
    { identifier: value, email: value, username: value, otp: code, code, otpCode: code },
  ];
  const verifyEndpoints = [
    "/api/auth/verify-otp",
    "/auth/verify-otp",
    "/api/auth/verifyOtp",
    "/api/auth/verify",
    "/auth/verify",
    "/api/auth/otp/verify",
  ];

  // Some deployed backends complete OTP login on the normal login endpoint.
  const otpLoginPayloads = [
    { identifier: value, otp: code },
    { username: value, otp: code },
    { email: value, otp: code },
    { identifier: value, code },
    { username: value, code },
    { email: value, code },
    { identifier: value, otpCode: code },
    { username: value, otpCode: code },
    { email: value, otpCode: code },
  ];
  const otpLoginEndpoints = ["/api/auth/login", "/auth/login"];

  const run = async () => {
    let lastError = null;
    let lastHttpError = null;
    for (const url of verifyEndpoints) {
      for (const body of verifyPayloads) {
        try {
          return await api.request({ method: "POST", url, data: body, baseURL: otpBase });
        } catch (err) {
          lastError = err;
          const status = err?.response?.status;
          if (status) lastHttpError = err;
          if (!(status === 400 || status === 404 || status === 405 || (status >= 500 && status <= 599))) {
            throw err;
          }
        }
      }
    }

    for (const url of otpLoginEndpoints) {
      for (const body of otpLoginPayloads) {
        try {
          return await api.request({ method: "POST", url, data: body, baseURL: otpBase });
        } catch (err) {
          lastError = err;
          const status = err?.response?.status;
          if (status) lastHttpError = err;
          if (!(status === 400 || status === 401 || status === 404 || status === 405 || (status >= 500 && status <= 599))) {
            throw err;
          }
        }
      }
    }

    throw lastHttpError || lastError || new Error("OTP verification failed");
  };

  return run();
};

export const registerWithPassword = ({ username, email, password, otp }) => {
  const body = { username, email, password };
  if (otp && String(otp).trim()) body.otp = String(otp).trim();
  return api.post("/api/auth/register", body);
};

export const loginWithPassword = ({ identifier, password }) => {
  const value = String(identifier || "").trim();
  const baseCandidates = [
    api.defaults.baseURL,
    "http://localhost:8080",
    "http://43.205.213.14:8080",
    "https://api.socialsea.co.in",
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  const payloads = [
    { identifier: value, password },
    { username: value, password },
    { email: value, password },
    { identifier: value, username: value, password },
    { identifier: value, email: value, password },
  ];
  const endpoints = ["/api/auth/login", "/auth/login"];

  const tryOne = (url, body) => api.post(url, body);

  const run = async () => {
    let lastError = null;
    for (const baseURL of baseCandidates) {
      for (const url of endpoints) {
        for (const body of payloads) {
          try {
            return await api.request({ method: "POST", url, data: body, baseURL });
          } catch (err) {
            lastError = err;
            const status = err?.response?.status;
            const text = String(err?.response?.data?.message || err?.response?.data || err?.message || "").toLowerCase();
            const otpRequired = text.includes("otp") && text.includes("required");
            // retry for contract/path errors, backend 5xx, and OTP-required (to test other backend bases)
            if (!(status === 400 || status === 404 || status === 405 || (status >= 500 && status <= 599) || otpRequired)) {
              throw err;
            }
          }
        }
      }
    }
    throw lastError || new Error("Login failed");
  };

  return run();
};

export function getRole() {
  const token = localStorage.getItem("accessToken");
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role || null;
  } catch (e) {
    return null;
  }
}
