import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import api from "../config/api";

const TenantContext = createContext(null);

function applyChameleonTheme(config) {
  if (!config) return;
  const root = document.documentElement;
  if (config.primary_color)
    root.style.setProperty("--color-primary", config.primary_color);
  if (config.secondary_color)
    root.style.setProperty("--color-secondary", config.secondary_color);
  if (config.accent_color)
    root.style.setProperty("--color-accent", config.accent_color);
  if (config.bg_color) root.style.setProperty("--color-bg", config.bg_color);
  if (config.surface_color)
    root.style.setProperty("--color-surface", config.surface_color);
  if (config.text_color)
    root.style.setProperty("--color-text", config.text_color);
  if (config.nombre_fantasia) document.title = config.nombre_fantasia;
}

export function TenantProvider({ mode = "internal", slug = null, children }) {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadBootstrap = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const endpoint =
        mode === "public" ? `/public/t/${slug}/bootstrap` : "/auth/bootstrap";
      const { data } = await api.get(endpoint);
      setTenant(data.data);
      applyChameleonTheme(data.data);
    } catch (err) {
      setError(
        err.response?.data?.message || "No se pudo cargar la distribuidora",
      );
    } finally {
      setLoading(false);
    }
  }, [mode, slug]);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  return (
    <TenantContext.Provider
      value={{ tenant, loading, error, reloadTenant: loadBootstrap }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);
