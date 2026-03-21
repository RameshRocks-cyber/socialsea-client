import api from "./axios";

const OTP_BASE_KEY = "socialsea_otp_base_url";
const looksLikeHtml = (value) =>
  typeof value === "string" &&
  (/^\s*<!doctype html/i.test(value) || /<html[\s>]/i.test(value));

const BAD_OTP_HOSTS = new Set(["43.205.213.14"]);

const normalizeBaseCandidate = (rawValue) => {
  const value = String(rawValue || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  if (value.startsWith("/")) return value;
  if (!/^https?:\/\//i.test(value)) return "";

  try {
    const host = new URL(value).hostname.toLowerCase();
    if (BAD_OTP_HOSTS.has(host)) return "https://socialsea.co.in";
  } catch {
    return "";
  }

  return value;
};

const buildOtpBaseCandidates = () => {
  const isHttpsPage =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const isLocalPage =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  const storedRaw =
    sessionStorage.getItem(OTP_BASE_KEY) ||
    localStorage.getItem(OTP_BASE_KEY) ||
    "";

  const stored = normalizeBaseCandidate(storedRaw);
  const defaultBase = normalizeBaseCandidate(api.defaults.baseURL);
  const envBase = normalizeBaseCandidate(import.meta.env.VITE_API_URL);

  const localCandidates = [
    "http://localhost:8080",
    "/api",
    defaultBase,
    envBase,
  ];
  const deployedCandidates = [
    stored,
    defaultBase,
    envBase,
    "https://api.socialsea.co.in",
    "/api",
    "https://socialsea.co.in",
  ];

  const candidates = (isLocalPage ? localCandidates : deployedCandidates)
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .filter((v) => !(isHttpsPage && /^http:\/\//i.test(v)));

  if (storedRaw && stored && stored !== String(storedRaw).trim().replace(/\/+$/, "")) {
    try {
      sessionStorage.setItem(OTP_BASE_KEY, stored);
      localStorage.setItem(OTP_BASE_KEY, stored);
    } catch {
      // ignore storage errors
    }
  }

  return candidates;
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
  const looksLikeEmail = /@/.test(value);

  const payloads = looksLikeEmail
    ? [
        { email: value, password },
        { identifier: value, password },
        { username: value, password },
      ]
    : [
        { username: value, password },
        { identifier: value, password },
        { email: value, password },
      ];

  const run = async () => {
    let lastError = null;
    for (const body of payloads) {
      try {
        return await api.request({
          method: "POST",
          url: "/api/auth/login",
          data: body,
          skipAuth: true,
          timeout: 9000,
        });
      } catch (err) {
        lastError = err;
        const status = err?.response?.status;
        const text = String(err?.response?.data?.message || err?.response?.data || err?.message || "").toLowerCase();
        if (text.includes("otp") && text.includes("required")) {
          throw new Error("Password login endpoint is misconfigured (OTP required). Contact backend admin.");
        }
        if (!(status === 400 || status === 401 || status === 403 || status === 404 || status === 405 || (status >= 500 && status <= 599) || !status)) {
          throw err;
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
  const looksLikeEmail = /@/.test(value);
  const payloads = looksLikeEmail
    ? [
        { email: value },
        { identifier: value },
        { email: value, identifier: value },
        { username: value },
      ]
    : [
        { username: value },
        { identifier: value },
        { username: value, identifier: value },
        { email: value },
      ];
  const endpoints = [
    "/api/auth/send-otp",
    "/auth/send-otp",
    "/api/auth/forgot-password",
    "/auth/forgot-password",
    "/api/auth/forgotPassword",
  ];

  const isOtpAccepted = (payload) => {
    if (payload == null) return true;
  if (typeof payload === "string") {
    const text = payload.trim().toLowerCase();
    if (!text) return true;
    if (looksLikeHtml(payload)) return false;
    if (text.includes("otp") && text.includes("generated")) return true;
    if (text.includes("failed") || text.includes("invalid") || text.includes("not found") || text.includes("error")) {
      return false;
    }
    return true;
  }
  if (typeof payload === "object") {
    if (payload.deliveryFailed === true) return true;
    if (payload.debugOtp != null && String(payload.debugOtp).trim()) return true;
    if (payload.success === false || payload.sent === false || payload.otpSent === false) return false;
    const status = String(payload.status || "").toLowerCase();
    if (status === "error" || status === "failed") return false;
      const msg = String(payload.message || payload.error || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("invalid") || msg.includes("failed") || msg.includes("error")) {
        return false;
      }
    }
    return true;
  };

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
            if (!isOtpAccepted(res?.data)) {
              const bodyError = new Error(
                String(
                  res?.data?.message ||
                  res?.data?.error ||
                  "OTP request was not accepted by backend."
                )
              );
              bodyError.response = { status: 400, data: res?.data };
              throw bodyError;
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
      const isLocalPage =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      if (isLocalPage) {
        throw new Error("Local backend is not running on http://localhost:8080. Start backend and retry.");
      }
      throw new Error("Cannot reach backend API. Please check your API URL/server.");
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
    "/api/auth/resetPassword",  ];
  const fallbackEndpoints = [];

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
          let routeUnavailable = false;
          for (const body of payloads) {
            if (routeUnavailable) break;
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
              // 400 means the route exists and rejected this payload/OTP. Try the next shape.
              if (status === 400) {
                continue;
              }
              // 401/403/404/405 indicate the route itself is blocked or missing, so stop
              // retrying payload variants for this exact base+endpoint combination.
              if (status === 401 || status === 403 || status === 404 || status === 405) {
                routeUnavailable = true;
                continue;
              }
              // Continue probing other bases/routes for transport/server variants only.
              if ((status >= 500 && status <= 599) || !status) {
                routeUnavailable = true;
                continue;
              }
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
      const isLocalPage =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      if (isLocalPage) {
        throw new Error("Local backend is not running on http://localhost:8080. Start backend and retry.");
      }
      throw new Error("Cannot reach backend API. Please check your API URL/server.");
    }
    if (lastError?.response?.status === 401 || lastError?.response?.status === 403) {
      throw new Error("Reset endpoint exists but is blocked (403). Backend must allow OTP-based password reset without login.");
    }
    if (lastError?.response?.status === 404 || lastError?.response?.status === 405 || lastError?.response?.status === 503) {
      throw new Error("OTP send works, but reset-password endpoint is missing on backend deployment.");
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





