import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1",
});

api.interceptors.request.use(
  (config) => {
    const isPublicRoute = config.url?.startsWith("/public/");

    if (isPublicRoute) {
      const portalToken = localStorage.getItem("portal_b2b_token");
      if (portalToken) {
        config.headers.Authorization = `Bearer ${portalToken}`;
      }
    } else {
      const token = localStorage.getItem("dist_token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      const impersonateId = localStorage.getItem("superadmin_target_dist_id");
      if (impersonateId) {
        config.headers["x-distribuidora-id"] = impersonateId;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isPublicRoute = error.config?.url?.startsWith("/public/");
    if (
      error.response?.status === 401 &&
      !isPublicRoute &&
      !window.location.pathname.includes("/login")
    ) {
      localStorage.removeItem("dist_token");
      localStorage.removeItem("dist_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
