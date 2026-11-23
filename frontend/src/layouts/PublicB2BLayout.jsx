import { useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Outlet context={{ bootstrap: config }} />
    </div>
  );
}
