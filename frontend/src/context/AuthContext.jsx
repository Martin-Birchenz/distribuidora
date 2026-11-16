import { createContext, useContext, useState } from "react";
import api from "../config/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("dist_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(
    () => localStorage.getItem("dist_token") || null,
  );

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    const { token: jwtToken, user: userData } = data.data;

    localStorage.setItem("dist_token", jwtToken);
    localStorage.setItem("dist_user", JSON.stringify(userData));
    localStorage.removeItem("superadmin_target_dist_id");

    setToken(jwtToken);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem("dist_token");
    localStorage.removeItem("dist_user");
    localStorage.removeItem("superadmin_target_dist_id");
    setToken(null);
    setUser(null);
  };

  const impersonateDistribuidora = (distribuidoraId) => {
    if (distribuidoraId) {
      localStorage.setItem(
        "superadmin_target_dist_id",
        String(distribuidoraId),
      );
    } else {
      localStorage.removeItem("superadmin_target_dist_id");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(token && user),
        login,
        logout,
        impersonateDistribuidora,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
