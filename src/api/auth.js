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
  const isHttpsPage =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const baseCandidates = [
    api.defaults.baseURL,
    "https://api.socialsea.co.in",
    "/api",
    "http://43.205.213.14:8080",
    "http://localhost:8080",
  ]
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .filter((v) => !(isHttpsPage && /^http:\/\//i.test(v)));

  // Password-only login flow (NO OTP endpoint probing).
  const payloads = [
    { username: value, password },
    { identifier: value, password },
    { email: value, password },
  ];
  const endpoints = ["/api/auth/login"];

  const run = async () => {
    let lastError = null;
    for (const baseURL of baseCandidates) {
      for (const url of endpoints) {
        for (const body of payloads) {
          try {
            const res = await api.request({
              method: "POST",
              url,
              data: body,
              baseURL,
              timeout: 9000,
            });
            const textData = typeof res?.data === "string" ? res.data.trim() : "";
            if (textData && (/^\s*<!doctype html/i.test(textData) || /<html[\s>]/i.test(textData))) {
              // Web host fallback page instead of API JSON; continue to next base candidate.
              const htmlErr = new Error("Received HTML instead of API response");
              htmlErr.response = { status: 404, data: textData };
              throw htmlErr;
            }
            return res;
          } catch (err) {
            lastError = err;
            const status = err?.response?.status;
            const text = String(err?.response?.data?.message || err?.response?.data || err?.message || "").toLowerCase();
            // If backend asks for OTP here, stop immediately because this screen is password-only.
            if (text.includes("otp") && text.includes("required")) {
              throw new Error("Password login endpoint is misconfigured (OTP required). Contact backend admin.");
            }
            // Retry only for endpoint/transport failures; auth failures should return immediately.
            if (!(status === 404 || status === 405 || (status >= 500 && status <= 599) || !status)) {
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

export const forgotPassword = (emailOrUsername) => {
  const value = String(emailOrUsername || "").trim();
  const isHttpsPage =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const baseCandidates = [
    api.defaults.baseURL,
    "https://api.socialsea.co.in",
  ]
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .filter((v) => !(isHttpsPage && /^http:\/\//i.test(v)));

  const payloads = [{ email: value, username: value, identifier: value }];
  const endpoints = [
    "/api/auth/send-otp",
    "/auth/send-otp",
  ];

  const run = async () => {
    let lastError = null;
    for (const baseURL of baseCandidates) {
      for (const url of endpoints) {
        for (const body of payloads) {
          try {
            return await api.request({
              method: "POST",
              url,
              data: body,
              baseURL,
              timeout: 2500,
            });
          } catch (err) {
            lastError = err;
            const status = err?.response?.status;
            // Retry only for route/transport failures; return other errors immediately.
            if (!(status === 404 || status === 405 || (status >= 500 && status <= 599) || !status)) {
              throw err;
            }
          }
        }
      }
    }
    if (lastError?.code === "ECONNABORTED" || !lastError?.response) {
      throw new Error("Server is not reachable right now. Please try again in a minute.");
    }
    throw lastError || new Error("Failed to send OTP");
  };

  return run();
};

export const resetPasswordWithOtp = ({ identifier, otp, newPassword }) => {
  const value = String(identifier || "").trim();
  const code = String(otp || "").trim();
  const password = String(newPassword || "");
  const isHttpsPage =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const baseCandidates = [
    api.defaults.baseURL,
    "https://api.socialsea.co.in",
  ]
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .filter((v) => !(isHttpsPage && /^http:\/\//i.test(v)));

  const endpoints = [
    "/api/auth/reset-password",
    "/api/auth/resetPassword",
  ];

  const payloads = [
    {
      email: value,
      username: value,
      identifier: value,
      otp: code,
      newPassword: password,
      password,
      new_password: password,
    },
  ];

  const run = async () => {
    let lastError = null;
    for (const baseURL of baseCandidates) {
      for (const url of endpoints) {
        for (const body of payloads) {
          try {
            return await api.request({
              method: "POST",
              url,
              data: body,
              baseURL,
              timeout: 2500,
            });
          } catch (err) {
            lastError = err;
            const status = err?.response?.status;
            if (!(status === 404 || status === 405 || (status >= 500 && status <= 599) || !status)) {
              throw err;
            }
          }
        }
      }
    }

    if (lastError?.code === "ECONNABORTED" || !lastError?.response) {
      throw new Error("Server is not reachable right now. Please try again in a minute.");
    }
    if (lastError?.response?.status === 404 || lastError?.response?.status === 405 || lastError?.response?.status === 503) {
      throw new Error("Password reset service is temporarily unavailable.");
    }
    throw lastError || new Error("Failed to reset password");
  };

  return run();
};

export function getRole() {
  const token = localStorage.getItem("accessToken");
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role || null;
  } catch {
    return null;
  }
}
