import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";
import { clearAuthStorage, logout as performLogout, setAuthSessionActive } from "../auth";
import { persistProfileIdentity } from "../utils/profileRoute";

const AuthContext = createContext();

const normalizeRole = (role) => {
  const raw = String(role || "").trim();
  if (!raw) return "";
  return raw.startsWith("ROLE_") ? raw.slice(5) : raw;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const finish = () => {
      if (!cancelled) {
        setAuthReady(true);
      }
    };

    const bootstrapAuth = async () => {
      try {
        try {
          const response = await api.get("/api/profile/me", {
            suppressAuthRedirect: true,
          });
          const refreshedUser = response?.data?.user || response?.data || null;
          setAuthSessionActive(true);
          if (refreshedUser) {
            setUser(refreshedUser);
            persistProfileIdentity(refreshedUser);
            const role = normalizeRole(refreshedUser?.role);
            if (role) {
              sessionStorage.setItem("role", role);
              localStorage.setItem("role", role);
            }
          }
        } catch {
          clearAuthStorage();
          setUser(null);
          // No cookie-based session is available, so the app will show the login screen.
        }
      } finally {
        finish();
      }
    };

    void bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = (userData) => {
    setAuthSessionActive(true);
    setUser(userData);
    if (userData && typeof userData === "object") {
      persistProfileIdentity(userData);
      const role = normalizeRole(userData?.role);
      if (role) {
        sessionStorage.setItem("role", role);
        localStorage.setItem("role", role);
      }
    }
  };
  const logout = () => {
    setUser(null);
    performLogout();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, authReady }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
