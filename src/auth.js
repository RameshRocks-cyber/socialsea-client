const getStoredToken = () =>
  sessionStorage.getItem("accessToken") ||
  sessionStorage.getItem("token") ||
  localStorage.getItem("accessToken") ||
  localStorage.getItem("token");

const parseJwt = (token) => {
  try {
    const payload = token?.split(".")?.[1];
    if (!payload) return null;
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
};

const isTokenUsable = (token) => {
  if (!token) return false;
  const payload = parseJwt(token);
  // Some environments may return opaque/non-JWT access tokens.
  // Treat them as usable and rely on backend 401 to invalidate.
  if (!payload) return true;
  if (!payload.exp) return true;
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp)) return true;
  return exp > nowSec;
};

export const isAuthenticated = () => {
  const token = getStoredToken();
  if (!token) return false;
  if (isTokenUsable(token)) return true;
  clearAuthStorage();
  return false;
};

const AUTH_KEYS = ["accessToken", "token", "refreshToken", "userId", "role", "profileCompleted", "email", "username", "name"];

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

  const storedRole = localStorage.getItem("role") || sessionStorage.getItem("role");
  if (storedRole) return normalizeRole(storedRole);

  const token = getStoredToken();
  if (!token) return null;

  try {
    const payload = parseJwt(token);
    if (!payload) return null;
    const role = payload.role || (Array.isArray(payload.roles) ? payload.roles[0] : null);
    return normalizeRole(role);
  } catch (e) {
    return null;
  }
};

export const logout = () => {
  clearAuthStorage();
  window.location.href = "/login";
};
