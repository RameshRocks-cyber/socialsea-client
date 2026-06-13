import { toApiUrl } from "./api/baseUrl";
import { getOrCreateDeviceId } from "./deviceId";

const AUTH_SESSION_KEY = "socialsea_auth_session_v1";

export const setAuthSessionActive = (active) => {
  try {
    if (active) {
      sessionStorage.setItem(AUTH_SESSION_KEY, "1");
    } else {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
    }
  } catch {
    // ignore storage failures
  }
};

export const isAuthenticated = () => {
  try {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
  } catch {
    return false;
  }
};

const AUTH_KEYS = [
  "accessToken",
  "token",
  "refreshToken",
  "userId",
  "role",
  "profileCompleted",
  "email",
  "username",
  "name",
  AUTH_SESSION_KEY
];

export const clearAuthStorage = () => {
  AUTH_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

export const getUserRole = () => {
  const normalizeRole = (role) => {
    if (!role) return null;
    const raw = String(role).trim();
    const noPrefix = raw.startsWith("ROLE_") ? raw.slice(5) : raw;
    return noPrefix.toUpperCase();
  };

  const storedRole = sessionStorage.getItem("role");
  if (storedRole) return normalizeRole(storedRole);
  return null;
};

export const logout = () => {
  (async () => {
    try {
      await fetch(toApiUrl("/api/security/sessions/logout"), {
        method: "POST",
        credentials: "include",
        headers: {
          "X-Device-Id": getOrCreateDeviceId(),
        },
        keepalive: true,
      });
    } catch {
      // ignore revoke failures
    } finally {
      clearAuthStorage();
      window.location.href = "/login";
    }
  })();
};
