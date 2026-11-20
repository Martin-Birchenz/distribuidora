import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/internal/dashboard/resumen")
      .then((res) => setData(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <p className="text-xs text-slate-500">Cargando tablero ejecutivo...</p>
    );
  if (!data)
    return (
      <p className="text-xs text-slate-500">
        Vista operativa disponible desde el menú lateral.
      </p>
    );

  const { kpis, top_deudores, stock_critico, ultimos_logs } = data;
  const fmt = (n) => `$${Number(n || 0).toLocaleString("es-AR")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-extrabold text-slate-900">
          Tablero Ejecutivo
        </h1>
        <p className="text-xs text-slate-500">
          Resumen financiero, cartera en calle y alertas de depósito
        </p>
      </div>

      {/* KPIs Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase text-slate-400">
            Facturado Hoy
          </p>
          <p className="text-xl font-extrabold text-slate-900 mt-1">
            {fmt(kpis.ventas_hoy)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {kpis.pedidos_hoy} pedidos ingresados
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase text-slate-400">
            Acumulado del Mes
          </p>
          <p className="text-xl font-extrabold text-emerald-700 mt-1">
            {fmt(kpis.ventas_mes)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Pedidos confirmados/entregados
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase text-slate-400">
            Dinero en la Calle
          </p>
          <p className="text-xl font-extrabold text-rose-600 mt-1">
            {fmt(kpis.total_en_calle)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {kpis.comercios_excedidos} comercios excedidos de tope
          </p>
        </div>

        <Link
          to="/app/pedidos"
          className="bg-amber-50 p-4 rounded-2xl border border-amber-200 hover:bg-amber-100 transition block"
        >
          <p className="text-[11px] font-bold uppercase text-amber-800">
            Por Aprobar Crédito
          </p>
          <p className="text-xl font-extrabold text-amber-950 mt-1">
            {kpis.pendientes_aprobacion}
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            Ver pedidos retenidos →
          </p>
        </Link>
      </div>

      {/* Grilla Deudores + Stock Crítico */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-extrabold uppercase text-slate-800">
              Mayores Saldos en Cuenta Corriente
            </h2>
            <Link
              to="/app/cuentas-corrientes"
              className="text-xs font-semibold text-indigo-700"
            >
              Ver todos →
            </Link>
          </div>
          {top_deudores.length === 0 ? (
            <p className="text-xs text-slate-400">
              Sin saldos pendientes de cobro.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {top_deudores.map((c) => (
                <div
                  key={c.id}
                  className="py-2 flex justify-between items-center text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900">
                      {c.nombre_fantasia}
                    </p>
                    <p className="text-slate-500">
                      {c.zona_reparto || "Sin zona"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-rose-600">
                      {fmt(c.saldo_actual)}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Límite: {fmt(c.credit_limit)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-extrabold uppercase text-slate-800">
              Alerta de Stock Crítico (≤ 10 bultos)
            </h2>
            <Link
              to="/app/catalogo"
              className="text-xs font-semibold text-indigo-700"
            >
              Reponer →
            </Link>
          </div>
          {stock_critico.length === 0 ? (
            <p className="text-xs text-slate-400">
              Todo el catálogo tiene stock saludable.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {stock_critico.map((p) => (
                <div
                  key={p.id}
                  className="py-2 flex justify-between items-center text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900">{p.nombre}</p>
                    <p className="text-slate-500">
                      {p.sku} • {p.unidad_venta}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full font-extrabold text-[11px] ${
                      p.stock_actual === 0
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {p.stock_actual} disp.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Auditoría */}
      {ultimos_logs.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2">
          <h2 className="text-xs font-extrabold uppercase text-slate-800">
            Actividad Reciente Auditada
          </h2>
          <div className="divide-y divide-slate-100 text-xs">
            {ultimos_logs.map((l) => (
              <div key={l.id} className="py-2 flex justify-between gap-4">
                <span className="text-slate-700">
                  <strong>{l.usuario_nombre || "Sistema"}:</strong> {l.detalle}
                </span>
                <span className="text-slate-400 shrink-0">
                  {new Date(l.created_at).toLocaleString("es-AR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
