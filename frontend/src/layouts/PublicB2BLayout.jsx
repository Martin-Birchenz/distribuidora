import { useEffect, useState } from "react";
import { Outlet, useParams, Link } from "react-router-dom";
import api from "../config/api.js";

export default function PublicB2BLayout() {
  const { slug } = useParams();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug) return;
    let active = true;

    async function cargarBootstrap() {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get(`/public/t/${slug}/bootstrap`);
        if (!active) return;

        const payload = data.data;
        setConfig(payload);

        // Inyección en tiempo real del Modo Camaleón en :root
        const root = document.documentElement;
        if (payload.theme?.primaryColor) {
          root.style.setProperty("--color-primary", payload.theme.primaryColor);
        }
        if (payload.theme?.secondaryColor) {
          root.style.setProperty(
            "--color-secondary",
            payload.theme.secondaryColor,
          );
        }
        if (payload.theme?.accentColor) {
          root.style.setProperty("--color-accent", payload.theme.accentColor);
        }
        document.title = `${payload.distribuidora?.nombreFantasia || "Catálogo"} | Portal Mayorista B2B`;
      } catch (err) {
        if (!active) return;
        setError(
          err.response?.data?.message || "Portal mayorista no disponible",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    cargarBootstrap();
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <h1 className="text-xl font-extrabold text-slate-900 mb-1">
          Portal no disponible
        </h1>
        <p className="text-xs text-slate-500">
          {error || "La distribuidora solicitada no existe."}
        </p>
      </div>
    );
  }

  const dist = config.distribuidora || {};
  const primary = config.theme?.primaryColor || "#0f172a";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header
        style={{ backgroundColor: primary }}
        className="text-white shadow-sm"
      >
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {config.theme?.logoUrl && (
              <img
                src={config.theme.logoUrl}
                alt={dist.nombreFantasia}
                className="h-9 w-9 rounded-xl bg-white p-1 object-contain shrink-0"
              />
            )}
            <div className="min-w-0">
              <h1 className="font-extrabold text-sm sm:text-base truncate">
                {dist.nombreFantasia}
              </h1>
              <p className="text-[11px] text-white/80 truncate">
                Portal de Pedidos Mayoristas y Comercios
              </p>
            </div>
          </div>

          <Link
            to="/login"
            className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold shrink-0 transition"
          >
            Acceso Staff
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Outlet context={{ bootstrap: config }} />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        {dist.nombreFantasia} • Plataforma B2B de Pedidos Mayoristas
      </footer>
    </div>
  );
}
