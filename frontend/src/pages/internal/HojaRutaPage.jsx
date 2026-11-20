import { useEffect, useState } from "react";
import api from "../../services/api";

export default function HojaRutaPage() {
  const [zonas, setZonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cobroModal, setCobroModal] = useState(null);
  const [monto, setMonto] = useState("");
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargarHojaRuta = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/internal/reparto/hoja-ruta");
      setZonas(data.data || []);
    } catch {
      alert("Error al cargar hoja de ruta");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarHojaRuta();
  }, []);

  const marcarEntregado = async (pedidoId) => {
    try {
      await api.patch(`/internal/pedidos/${pedidoId}/estado`, {
        estado: "ENTREGADO",
      });
      cargarHojaRuta();
    } catch (err) {
      alert(err.response?.data?.message || "No se pudo actualizar el estado");
    }
  };

  const abrirModalCobro = (parada) => {
    setCobroModal(parada);
    setMonto(String(parada.total || ""));
    setMetodoPago("EFECTIVO");
    setNotas("");
  };

  const handleRegistrarCobro = async (e) => {
    e.preventDefault();
    if (!cobroModal?.cliente_comercio_id) return;
    setGuardando(true);
    try {
      const { data } = await api.post("/internal/reparto/cobros", {
        cliente_comercio_id: cobroModal.cliente_comercio_id,
        pedido_id: cobroModal.pedido_id,
        monto: Number(monto),
        metodo_pago: metodoPago,
        notas: notas || null,
      });
      alert(
        `Cobro registrado ($${Number(monto).toLocaleString("es-AR")}). Nuevo saldo de ${
          data.data.comercio_nombre
        }: $${Number(data.data.nuevo_saldo).toLocaleString("es-AR")}`,
      );
      setCobroModal(null);
      cargarHojaRuta();
    } catch (err) {
      alert(err.response?.data?.message || "Error al registrar el cobro");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">
            Hoja de Ruta y Cobranza
          </h1>
          <p className="text-xs text-slate-500">
            Paradas agrupadas por zona de reparto
          </p>
        </div>
        <button
          onClick={cargarHojaRuta}
          className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
        >
          Actualizar
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-500">Cargando recorrido...</p>
      ) : zonas.length === 0 ? (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
          No hay pedidos pendientes de entrega en ruta.
        </div>
      ) : (
        zonas.map((z) => (
          <div
            key={z.zona}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
          >
            <div className="bg-slate-900 text-white px-4 py-2.5 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wide">
                📍 Zona: {z.zona}
              </span>
              <span className="text-xs font-semibold text-amber-300">
                {z.cantidad_paradas} paradas • $
                {z.total_reparto_zona.toLocaleString("es-AR")}
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {z.paradas.map((p) => (
                <div
                  key={p.pedido_id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-900">
                        {p.comercio_nombre}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">
                        {p.numero_pedido}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{p.direccion}</p>
                    <p className="text-[11px] text-slate-500">
                      Pedido:{" "}
                      <strong>
                        ${Number(p.total).toLocaleString("es-AR")}
                      </strong>{" "}
                      ({p.condicion_pago.replace("_", " ")})
                      {p.cliente_comercio_id && (
                        <>
                          {" "}
                          • Saldo Cta. Cte.:{" "}
                          <strong
                            className={
                              Number(p.saldo_cuenta_corriente) > 0
                                ? "text-rose-600"
                                : "text-emerald-600"
                            }
                          >
                            $
                            {Number(p.saldo_cuenta_corriente).toLocaleString(
                              "es-AR",
                            )}
                          </strong>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {p.cliente_comercio_id && (
                      <button
                        onClick={() => abrirModalCobro(p)}
                        className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Registrar Cobro
                      </button>
                    )}
                    <button
                      onClick={() => marcarEntregado(p.pedido_id)}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Entregado ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {cobroModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleRegistrarCobro}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl"
          >
            <h3 className="font-bold text-slate-900 text-sm">
              Cobro en Calle — {cobroModal.comercio_nombre}
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monto recibido ($)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Medio de pago
              </label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Observación (opcional)
              </label>
              <input
                type="text"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej: Recibo #104 / Transferencia MP"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCobroModal(null)}
                className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Confirmar Cobro"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
