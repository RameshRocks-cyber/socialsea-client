import api from "./axios";

const OTP_BASE_KEY = "socialsea_otp_base_url";
const looksLikeHtml = (value) =>
  typeof value === "string" &&
  (/^\s*<!doctype html/i.test(value) || /<html[\s>]/i.test(value));

const buildOtpBaseCandidates = () => {
  const isHttpsPage =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const isLocalPage =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const storedBase =
    sessionStorage.getItem(OTP_BASE_KEY) ||
    localStorage.getItem(OTP_BASE_KEY) ||
    "";
  const normalizedStored = String(storedBase || "").trim();
  const storedHost =
    normalizedStored && /^https?:\/\//i.test(normalizedStored)
      ? new URL(normalizedStored).hostname.toLowerCase()
      : "";
  const safeStoredForLocal =
    isLocalPage && storedHost === "api.socialsea.co.in" ? "" : normalizedStored;
  const storedLooksRelative = safeStoredForLocal.startsWith("/");
  const defaultBase = String(api.defaults.baseURL || "").trim();
  const defaultLooksRelative = defaultBase.startsWith("/");
  const envBaseRaw = String(import.meta.env.VITE_API_URL || "").trim();
  const envLooksRelative = envBaseRaw.startsWith("/");
  const wantsLocalBackend =
    /localhost:8080|127\.0\.0\.1:8080/i.test(normalizedStored);

  // Prefer the same base that succeeded for OTP sending, then try known fallbacks.
  const localCandidates = [
    storedLooksRelative ? null : safeStoredForLocal,
    defaultLooksRelative ? null : (!/localhost:8080|127\.0\.0\.1:8080/i.test(defaultBase) ? defaultBase : null),
    envLooksRelative ? null : envBaseRaw,
    "http://43.205.213.14:8080",
    "/api",
    wantsLocalBackend ? "http://localhost:8080" : null,
    "https://api.socialsea.co.in",
  ];
  const defaultCandidates = [
    safeStoredForLocal,
    api.defaults.baseURL,
    "https://api.socialsea.co.in",
    "http://43.205.213.14:8080",
    "/api",
    "http://localhost:8080",
  ];

  return (isLocalPage ? localCandidates : defaultCandidates)
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .filter((v) => !(isHttpsPage && /^http:\/\//i.test(v)));
};

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
              skipAuth: true,
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
  const baseCandidates = buildOtpBaseCandidates();

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
            const res = await api.request({
              method: "POST",
              url,
              data: body,
              baseURL,
              skipAuth: true,
              timeout: 9000,
            });
            const textData = typeof res?.data === "string" ? res.data.trim() : "";
            if (looksLikeHtml(textData)) {
              const htmlErr = new Error("Received HTML instead of API response");
              htmlErr.response = { status: 404, data: textData };
              throw htmlErr;
            }
            try {
              sessionStorage.setItem(OTP_BASE_KEY, String(baseURL));
              localStorage.setItem(OTP_BASE_KEY, String(baseURL));
            } catch {
              // ignore storage errors
            }
            return res;
          } catch (err) {
            lastError = err;
            const status = err?.response?.status;
            // Retry for route/transport failures and auth-gated variants on fallback bases.
            if (!(status === 401 || status === 403 || status === 404 || status === 405 || (status >= 500 && status <= 599) || !status)) {
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
  const baseCandidates = buildOtpBaseCandidates();

  const primaryEndpoints = [
    "/api/auth/reset-password",
    "/api/auth/resetPassword",
    "/auth/reset-password",
    "/auth/resetPassword",
  ];
  const fallbackEndpoints = [
    "/api/auth/password/reset",
    "/auth/password/reset",
    "/api/auth/forgot-password/reset",
    "/auth/forgot-password/reset",
    "/api/auth/forgot-password",
    "/auth/forgot-password",
    "/api/users/reset-password",
  ];

  const payloads = [
    {
      email: value,
      username: value,
      identifier: value,
      otp: code,
      newPassword: password,
      confirmPassword: password,
      password,
      new_password: password,
      passwordConfirmation: password,
      otpCode: code,
    },
    {
      identifier: value,
      email: value,
      username: value,
      code,
      password,
      confirmPassword: password,
    },
  ];

  const run = async () => {
    let lastError = null;
    const tryEndpoints = async (endpoints) => {
      for (const baseURL of baseCandidates) {
        for (const url of endpoints) {
          for (const body of payloads) {
            try {
              const res = await api.request({
                method: "POST",
                url,
                data: body,
                baseURL,
                skipAuth: true,
                timeout: 9000,
              });
              const textData = typeof res?.data === "string" ? res.data.trim() : "";
              if (looksLikeHtml(textData)) {
                const htmlErr = new Error("Received HTML instead of API response");
                htmlErr.response = { status: 404, data: textData };
                throw htmlErr;
              }
              try {
                sessionStorage.setItem(OTP_BASE_KEY, String(baseURL));
                localStorage.setItem(OTP_BASE_KEY, String(baseURL));
              } catch {
                // ignore storage errors
              }
              return res;
            } catch (err) {
              lastError = err;
              const status = err?.response?.status;
              // 400 means route exists but payload/otp failed: surface real backend message.
              if (status === 400) throw err;
              // Continue probing other bases/routes only for route/transport/permission variants.
              if (!(status === 401 || status === 403 || status === 404 || status === 405 || (status >= 500 && status <= 599) || !status)) {
                throw err;
              }
            }
          }
        }
      }
      return null;
    };

    const primary = await tryEndpoints(primaryEndpoints);
    if (primary) return primary;
    const fallback = await tryEndpoints(fallbackEndpoints);
    if (fallback) return fallback;

    if (lastError?.code === "ECONNABORTED" || !lastError?.response) {
      throw new Error("Server is not reachable right now. Please try again in a minute.");
    }
    if (lastError?.response?.status === 401 || lastError?.response?.status === 403) {
      throw new Error("Password reset was blocked on current API route. Please verify backend reset-password permissions.");
    }
    if (lastError?.response?.status === 404 || lastError?.response?.status === 405 || lastError?.response?.status === 503) {
      throw new Error("Password reset endpoint not available on backend. Please verify reset-password API route.");
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
