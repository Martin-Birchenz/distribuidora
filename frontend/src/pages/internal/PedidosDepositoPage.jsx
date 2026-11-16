import { useState, useEffect } from "react";
import {
  Truck,
  CheckCircle,
  XCircle,
  Printer,
  ClipboardList,
} from "lucide-react";
import api from "../../config/api";

export default function PedidosDepositoPage() {
  const [pedidos, setPedidos] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [hojaCarga, setHojaCarga] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargarPedidos = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/internal/pedidos", {
        params: { estado: filtroEstado },
      });
      setPedidos(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarPedidos();
  }, [filtroEstado]);

  const cambiarEstado = async (id, estado) => {
    try {
      await api.patch(`/internal/pedidos/${id}/estado`, { estado });
      cargarPedidos();
    } catch (err) {
      alert(err.response?.data?.message || "No se pudo cambiar el estado");
    }
  };

  const abrirHojaCarga = async () => {
    try {
      const { data } = await api.get("/internal/pedidos/hoja-carga");
      setHojaCarga(data.data);
    } catch (err) {
      alert("Error al generar la comanda consolidada");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Pedidos y Carga de Camión
          </h1>
          <p className="text-xs text-slate-500">
            Consolidación automática de bultos para despacho
          </p>
        </div>

        <button
          onClick={abrirHojaCarga}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow cursor-pointer"
        >
          <Truck className="w-4 h-4" />
          Generar Hoja de Carga Camión
        </button>
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap gap-2">
        {[
          { val: "", label: "Todos" },
          { val: "PENDIENTE_APROBACION", label: "Pend. Crédito" },
          { val: "CONFIRMADO", label: "Confirmados" },
          { val: "DESPACHADO", label: "Despachados" },
          { val: "ENTREGADO", label: "Entregados" },
        ].map((f) => (
          <button
            key={f.val}
            onClick={() => setFiltroEstado(f.val)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
              filtroEstado === f.val
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Comanda Consolidada de Carga por Camión */}
      {hojaCarga && (
        <div className="bg-white p-5 rounded-2xl border-2 border-brand-primary shadow-md space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-brand-primary" />
                Comanda Consolidada de Depósito
              </h2>
              <p className="text-xs text-slate-500">
                {hojaCarga.resumen.total_remitos} remitos •{" "}
                {hojaCarga.resumen.total_bultos_fisicos} bultos totales • Total
                reparto: $
                {Number(hojaCarga.resumen.monto_total_reparto).toLocaleString(
                  "es-AR",
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir
              </button>
              <button
                onClick={() => setHojaCarga(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 uppercase">
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3">Producto a Bajar</th>
                  <th className="py-2 px-3">Presentación</th>
                  <th className="py-2 px-3 text-right">Cantidad Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {hojaCarga.consolidado_deposito.map((item) => (
                  <tr key={item.producto_id}>
                    <td className="py-2 px-3 font-mono">{item.sku}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">
                      {item.nombre}
                    </td>
                    <td className="py-2 px-3">{item.unidad_venta}</td>
                    <td className="py-2 px-3 text-right font-extrabold text-sm text-brand-primary">
                      {item.total_bultos}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Listado de Pedidos */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-3 px-4">Pedido / Origen</th>
                <th className="py-3 px-4">Comercio / Dirección</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-400">
                    Cargando pedidos...
                  </td>
                </tr>
              ) : (
                pedidos.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">
                        {p.numero_pedido}
                      </div>
                      <div className="text-xs text-slate-500">{p.origen}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">
                        {p.cliente_nombre}
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.cliente_direccion}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      ${Number(p.total).toLocaleString("es-AR")}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          p.estado === "PENDIENTE_APROBACION"
                            ? "bg-amber-100 text-amber-800"
                            : p.estado === "CONFIRMADO"
                              ? "bg-blue-100 text-blue-800"
                              : p.estado === "ENTREGADO"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {p.estado}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5">
                      {p.estado === "PENDIENTE_APROBACION" && (
                        <button
                          onClick={() => cambiarEstado(p.id, "CONFIRMADO")}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Aprobar
                        </button>
                      )}
                      {p.estado === "CONFIRMADO" && (
                        <button
                          onClick={() => cambiarEstado(p.id, "DESPACHADO")}
                          className="px-2.5 py-1 rounded-lg bg-brand-primary text-white text-xs font-semibold cursor-pointer"
                        >
                          Despachar
                        </button>
                      )}
                      {p.estado === "DESPACHADO" && (
                        <button
                          onClick={() => cambiarEstado(p.id, "ENTREGADO")}
                          className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          Entregado
                        </button>
                      )}
                      {!["ENTREGADO", "CANCELADO"].includes(p.estado) && (
                        <button
                          onClick={() => cambiarEstado(p.id, "CANCELADO")}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                          title="Cancelar pedido"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
