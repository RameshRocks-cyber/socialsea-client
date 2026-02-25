export const isAuthenticated = () => {
  return !!(
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("accessToken") ||
    sessionStorage.getItem("token")
  );
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

  const token =
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("accessToken") ||
    sessionStorage.getItem("token");
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const role = payload.role || (Array.isArray(payload.roles) ? payload.roles[0] : null);
    return normalizeRole(role);
  } catch (e) {
    return null;
  }
};

export const logout = () => {
  localStorage.clear();
  window.location.href = "/login";
};
