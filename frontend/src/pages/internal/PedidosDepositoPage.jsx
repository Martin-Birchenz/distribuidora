import { useState, useEffect } from "react";
import {
  Truck,
  CheckCircle,
  XCircle,
  Printer,
  ClipboardList,
  FileCheck2,
} from "lucide-react";
import api from "../../config/api";

export default function PedidosDepositoPage() {
  const [pedidos, setPedidos] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [hojaCarga, setHojaCarga] = useState(null);
  const [loading, setLoading] = useState(true);

  const [seleccionados, setSeleccionados] = useState([]);
  const [facturandoLote, setFacturandoLote] = useState(false);
  const [resultadoLoteArca, setResultadoLoteArca] = useState(null);

  const [pedidoDev, setPedidoDev] = useState(null);
  const [motivoDev, setMotivoDev] = useState("");
  const [cantidadesDev, setCantidadesDev] = useState({});
  const [guardandoDev, setGuardandoDev] = useState(false);

  const cargarPedidos = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/internal/pedidos", {
        params: { estado: filtroEstado },
      });
      setPedidos(data.data || []);
      setSeleccionados([]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarPedidos();
  }, [filtroEstado]);

  const toggleSeleccion = (id) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleTodos = () => {
    if (seleccionados.length === pedidos.length) {
      setSeleccionados([]);
    } else {
      setSeleccionados(pedidos.map((p) => p.id));
    }
  };

  const handleFacturarLoteArca = async () => {
    if (seleccionados.length === 0) return;
    setFacturandoLote(true);
    try {
      const { data } = await api.post("/internal/facturacion/lote", {
        pedido_ids: seleccionados,
        punto_venta: 1,
      });
      setResultadoLoteArca(data.data);
      setSeleccionados([]);
    } catch (err) {
      alert(err.response?.data?.message || "Error al emitir lote ARCA");
    } finally {
      setFacturandoLote(false);
    }
  };

  const handleAsignarCamionLote = async () => {
    if (seleccionados.length === 0) return;
    const camion = window.prompt(
      "Ingresá nombre del camión o chofer (ej: Camión 1 - Juan):",
    );
    if (!camion || !camion.trim()) return;
    try {
      await api.post("/internal/reparto/asignar-camion", {
        pedido_ids: seleccionados,
        camion_asignado: camion.trim(),
      });
      alert(`Asignados ${seleccionados.length} pedidos a ${camion.trim()}`);
      cargarPedidos();
    } catch (err) {
      alert(err.response?.data?.message || "Error al asignar camión");
    }
  };

  const cambiarEstado = async (id, estado) => {
    try {
      await api.patch(`/internal/pedidos/${id}/estado`, { estado });
      cargarPedidos();
    } catch (err) {
      alert(err.response?.data?.message || "No se pudo cambiar el estado");
    }
  };

  const abrirModalDevolucion = async (pedidoId) => {
    try {
      const { data } = await api.get(`/internal/pedidos/${pedidoId}`);
      setPedidoDev(data.data);
      setMotivoDev("");
      setCantidadesDev({});
    } catch {
      alert("No se pudo cargar el detalle del pedido");
    }
  };

  const handleConfirmarDevolucion = async (e) => {
    e.preventDefault();
    const items = Object.entries(cantidadesDev)
      .map(([producto_id, cantidad_devuelta]) => ({
        producto_id: Number(producto_id),
        cantidad_devuelta: Number(cantidad_devuelta),
      }))
      .filter((it) => it.cantidad_devuelta > 0);

    if (items.length === 0) return alert("Indicá al menos 1 bulto devuelto");

    setGuardandoDev(true);
    try {
      const { data } = await api.post(
        `/internal/pedidos/${pedidoDev.id}/devoluciones`,
        {
          motivo: motivoDev,
          items,
        },
      );
      alert(
        `Devolución procesada. Crédito aplicado: $${data.data.monto_acreditado.toLocaleString("es-AR")}`,
      );
      setPedidoDev(null);
      cargarPedidos();
    } catch (err) {
      alert(err.response?.data?.message || "Error al procesar devolución");
    } finally {
      setGuardandoDev(false);
    }
  };

  const abrirHojaCarga = async () => {
    try {
      const { data } = await api.get("/internal/pedidos/hoja-carga");
      setHojaCarga(data.data);
    } catch {
      alert("Error al generar la comanda consolidada");
    }
  };

  const abrirRemitoPdf = async (pedidoId, formato = "a4") => {
    try {
      const response = await api.get(
        `/internal/pedidos/${pedidoId}/remito-pdf`,
        {
          params: { formato },
          responseType: "blob",
        },
      );
      const pdfBlob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(pdfBlob);
      window.open(url, "_blank");
    } catch {
      alert("No se pudo generar el remito PDF");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Pedidos, Carga y Facturación ARCA
          </h1>
          <p className="text-xs text-slate-500">
            Consolidación de despacho, asignación de camiones y facturación
            electrónica en lote
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {seleccionados.length > 0 && (
            <>
              <button
                onClick={handleAsignarCamionLote}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold shadow cursor-pointer"
              >
                <Truck className="w-4 h-4" />
                Asignar Camión ({seleccionados.length})
              </button>
              <button
                onClick={handleFacturarLoteArca}
                disabled={facturandoLote}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-extrabold shadow cursor-pointer disabled:opacity-50"
              >
                <FileCheck2 className="w-4 h-4" />
                {facturandoLote
                  ? "Emitiendo CAE..."
                  : `Facturar ARCA (${seleccionados.length})`}
              </button>
            </>
          )}

          <button
            onClick={abrirHojaCarga}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow cursor-pointer"
          >
            <Truck className="w-4 h-4" />
            Hoja de Carga Camión
          </button>
        </div>
      </div>

      {/* Resultado de Lote ARCA */}
      {resultadoLoteArca && (
        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <h3 className="font-extrabold text-indigo-950 text-sm">
              Lote ARCA/AFIP Procesado ({resultadoLoteArca.total_emitidos} CAE
              autorizados)
            </h3>
            <button
              onClick={() => setResultadoLoteArca(null)}
              className="text-indigo-700 font-bold underline cursor-pointer"
            >
              Cerrar
            </button>
          </div>
          {resultadoLoteArca.emitidos.map((f) => (
            <div
              key={f.cae}
              className="bg-white p-2 rounded-xl border border-indigo-100 flex justify-between"
            >
              <span>
                <strong>
                  {f.tipo_comprobante.replace("_", " ")}{" "}
                  {f.comprobante_formateado}
                </strong>{" "}
                • {f.receptor} ({f.numero_pedido})
              </span>
              <span className="font-mono text-emerald-700 font-bold">
                CAE: {f.cae} (Vto: {f.cae_vencimiento})
              </span>
            </div>
          ))}
          {resultadoLoteArca.errores.map((e, idx) => (
            <p key={idx} className="text-rose-700 font-semibold">
              • Pedido #{e.pedido_id}: {e.motivo}
            </p>
          ))}
        </div>
      )}

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

      {/* Comanda Consolidada */}
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
                <th className="py-3 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={
                      pedidos.length > 0 &&
                      seleccionados.length === pedidos.length
                    }
                    onChange={toggleTodos}
                  />
                </th>
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
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    Cargando pedidos...
                  </td>
                </tr>
              ) : (
                pedidos.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-3">
                      <input
                        type="checkbox"
                        checked={seleccionados.includes(p.id)}
                        onChange={() => toggleSeleccion(p.id)}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">
                        {p.numero_pedido}
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.origen}{" "}
                        {p.camion_asignado ? `• 🚚 ${p.camion_asignado}` : ""}
                      </div>
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
                      <button
                        onClick={() => abrirRemitoPdf(p.id, "a4")}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold cursor-pointer"
                      >
                        PDF A4
                      </button>
                      <button
                        onClick={() => abrirRemitoPdf(p.id, "ticket")}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold cursor-pointer"
                      >
                        Ticket
                      </button>
                      {p.estado !== "CANCELADO" &&
                        p.estado !== "PENDIENTE_APROBACION" && (
                          <button
                            onClick={() => abrirModalDevolucion(p.id)}
                            className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer"
                          >
                            Devolución
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

      {/* Modal Devolución */}
      {pedidoDev && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleConfirmarDevolucion}
            className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl"
          >
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-900 text-sm">
                Devolución / Nota de Crédito — {pedidoDev.numero_pedido}
              </h3>
              <button
                type="button"
                onClick={() => setPedidoDev(null)}
                className="text-slate-400 text-sm"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Motivo de devolución
              </label>
              <input
                type="text"
                required
                value={motivoDev}
                onChange={(e) => setMotivoDev(e.target.value)}
                placeholder="Ej: Cajón roto en entrega / Rechazo parcial"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(pedidoDev.items || []).map((it) => (
                <div
                  key={it.producto_id}
                  className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-800">
                      {it.nombre_snapshot}
                    </p>
                    <p className="text-slate-500">
                      Entregado: {it.cantidad} • $
                      {Number(it.precio_unitario).toLocaleString("es-AR")} c/u
                    </p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={it.cantidad}
                    placeholder="0"
                    value={cantidadesDev[it.producto_id] || ""}
                    onChange={(e) =>
                      setCantidadesDev((prev) => ({
                        ...prev,
                        [it.producto_id]: e.target.value,
                      }))
                    }
                    className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 text-right font-bold"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setPedidoDev(null)}
                className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoDev}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {guardandoDev ? "Procesando..." : "Confirmar Devolución"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
