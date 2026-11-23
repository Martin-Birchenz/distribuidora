import { useEffect, useState } from "react";
import { Outlet, useParams, Link } from "react-router-dom";
import { Store, ShieldCheck, Phone, Sparkles, Lock } from "lucide-react";
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
        document.title = `${payload.distribuidora?.nombreFantasia || "Tienda"} | Catálogo Mayorista B2B`;
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
  const accent = config.theme?.accentColor || "#f59e0b";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Barra superior informativa */}
      <div
        style={{ backgroundColor: primary }}
        className="text-white/90 text-[11px] font-medium"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 truncate">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: accent }}
              />
              Abastecimiento Directo a Comercios y Minoristas
            </span>
            {dist.telefono && (
              <span className="hidden sm:inline-flex items-center gap-1 text-white/75">
                <Phone className="w-3 h-3" /> {dist.telefono}
              </span>
            )}
          </div>

          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-white/75 hover:text-white transition shrink-0"
          >
            <Lock className="w-3 h-3" /> Panel Interno
          </Link>
        </div>
      </div>

      {/* Header Principal Blanco con acento de marca */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {config.theme?.logoUrl ? (
              <img
                src={config.theme.logoUrl}
                alt={dist.nombreFantasia}
                className="h-11 w-11 rounded-2xl border border-slate-200 bg-white p-1 object-contain shrink-0 shadow-2xs"
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
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight truncate">
                  {dist.nombreFantasia}
                </h1>
                <span
                  style={{ backgroundColor: `${primary}14`, color: primary }}
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                >
                  <Sparkles className="w-2.5 h-2.5" /> Tienda Oficial
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                {dist.direccion
                  ? `${dist.direccion} • Pedidos online con entrega programada`
                  : "Catálogo digital con precios mayoristas y minoristas actualizados"}
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-right shrink-0">
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200/70">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Modalidad
              </p>
              <p className="text-xs font-bold text-slate-800">
                Compra Directa / Cuenta Corriente
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido del Catálogo B2B */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <Outlet context={{ bootstrap: config }} />
      </main>

      {/* Footer limpio */}
      <footer className="border-t border-slate-200 bg-white py-5 mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <span className="font-semibold text-slate-600">
            {dist.nombreFantasia}
          </span>
          <span>
            Pedidos Mayoristas B2B • Precios sujetos a disponibilidad de stock
          </span>
        </div>
      </footer>
    </div>
  );
}
