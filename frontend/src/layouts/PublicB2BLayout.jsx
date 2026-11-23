import { useEffect, useState } from "react";
import { Outlet, useParams, Link } from "react-router-dom";
import { Store, ArrowUpRight } from "lucide-react";
import api from "../config/api";

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
        document.title = `${payload.distribuidora?.nombreFantasia || "Tienda"} | Pedidos Online`;
      } catch (err) {
        if (!active) return;
        setError(err.response?.data?.message || "Portal no disponible");
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
    <div className="min-h-screen flex flex-col bg-slate-50/70 text-slate-900">
      {/* Header único, limpio y con identidad de la distribuidora */}
      <header className="bg-white border-b border-slate-200/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {config.theme?.logoUrl ? (
              <img
                src={config.theme.logoUrl}
                alt={dist.nombreFantasia}
                className="h-11 w-11 rounded-2xl border border-slate-200 bg-white p-1 object-contain shrink-0"
              />
            ) : (
              <div
                style={{ backgroundColor: primary }}
                className="h-11 w-11 rounded-2xl text-white flex items-center justify-center shrink-0 shadow-xs"
              >
                <Store className="w-5 h-5" />
              </div>
            )}

            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Catálogo Digital de Pedidos
              </p>
              <h2 className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight truncate">
                {dist.nombreFantasia}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline-block text-xs text-slate-500">
              Armá tu pedido y recibilo en tu comercio
            </span>
            <Link
              to="/login"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs font-semibold transition"
            >
              Staff <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Catálogo y acciones principales del comercio */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5">
        <Outlet context={{ bootstrap: config }} />
      </main>

      <footer className="border-t border-slate-200/80 bg-white py-4 mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <span className="font-medium text-slate-600">
            {dist.nombreFantasia}
          </span>
          <span>Precios y stock actualizados en tiempo real</span>
        </div>
      </footer>
    </div>
  );
}
