export const isAuthenticated = () => {
  return !!localStorage.getItem("accessToken");
};

export const getUserRole = () => {
  const role = localStorage.getItem("role");
  return role; // "USER" | "ADMIN"
};

export const logout = () => {
  localStorage.clear();
  window.location.href = "/login";
};