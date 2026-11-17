import { useState, useEffect } from "react";
import { Wallet, DollarSign, CheckCircle2, Pencil, X } from "lucide-react";
import api from "../../config/api";

export default function CuentasCorrientesPage() {
  const [resumen, setResumen] = useState({ total_a_cobrar: 0, detalle: [] });
  const [clienteId, setClienteId] = useState("");
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [monto, setMonto] = useState("");
  const [referencia, setReferencia] = useState("");
  const [recibo, setRecibo] = useState(null);
  const [movimientos, setMovimientos] = useState([]);

  // Estado modal editar tope
  const [editandoCliente, setEditandoCliente] = useState(null);
  const [nuevoTope, setNuevoTope] = useState(0);
  const [guardandoTope, setGuardandoTope] = useState(false);

  const cargarResumen = async () => {
    try {
      const { data } = await api.get("/internal/cuentas-corrientes/resumen");
      setResumen(data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    cargarResumen();
  }, []);

  const seleccionarComercio = async (id) => {
    setClienteId(id);
    setRecibo(null);
    if (!id) {
      setMovimientos([]);
      return;
    }
    try {
      const { data } = await api.get(`/internal/cuentas-corrientes/${id}`);
      setMovimientos(data.data.movimientos || []);
    } catch (err) {
      console.error(err);
    }
  };

  const registrarPago = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(
        "/internal/cuentas-corrientes/cobranzas",
        {
          cliente_comercio_id: Number(clienteId),
          metodo_pago: metodoPago,
          monto: Number(monto),
          referencia_comprobante: referencia || null,
        },
      );
      setRecibo(data.data);
      setMonto("");
      setReferencia("");
      cargarResumen();
      seleccionarComercio(clienteId);
    } catch (err) {
      alert(err.response?.data?.message || "Error al registrar cobranza");
    }
  };

  const abrirEditorTope = (e, comercio) => {
    e.stopPropagation();
    setEditandoCliente(comercio);
    setNuevoTope(Number(comercio.credit_limit || 0));
  };

  const guardarNuevoTope = async (e) => {
    e.preventDefault();
    if (!editandoCliente) return;
    setGuardandoTope(true);
    try {
      await api.patch(`/internal/clientes/${editandoCliente.id}`, {
        credit_limit: Number(nuevoTope),
      });
      setEditandoCliente(null);
      cargarResumen();
    } catch (err) {
      alert(err.response?.data?.message || "No se pudo actualizar el límite");
    } finally {
      setGuardandoTope(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase font-bold text-slate-500">
            Total en Calle a Cobrar
          </p>
          <p className="text-3xl font-extrabold text-red-600 mt-1">
            ${Number(resumen.total_a_cobrar || 0).toLocaleString("es-AR")}
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-red-50 text-red-600">
          <Wallet className="w-7 h-7" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Formulario Cobranza en Calle / Mostrador */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="font-bold text-slate-900 flex items-center gap-2 text-base">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Registrar Cobranza
          </h2>

          {recibo && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  Recibo #{recibo.recibo_id} emitido para {recibo.comercio}
                </span>
              </div>
              <p>
                Abonado:{" "}
                <strong>
                  ${Number(recibo.monto_abonado).toLocaleString("es-AR")}
                </strong>{" "}
                • Nuevo saldo:{" "}
                <strong>
                  ${Number(recibo.saldo_actual).toLocaleString("es-AR")}
                </strong>
              </p>
            </div>
          )}

          <form onSubmit={registrarPago} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Comercio Cliente
              </label>
              <select
                required
                value={clienteId}
                onChange={(e) => seleccionarComercio(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
              >
                <option value="">-- Seleccionar comercio --</option>
                {resumen.detalle.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre_fantasia} (Debe: $
                    {Number(c.current_balance).toLocaleString("es-AR")})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Medio de Pago
                </label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Monto Cobrado ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>
            </div>

            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="N° de transferencia / cheque / observación (opcional)"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm cursor-pointer"
            >
              Imputar Pago en Cuenta Corriente
            </button>
          </form>
        </div>

        {/* Saldos Deudores e Historial */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-base">
              {clienteId
                ? "Últimos Movimientos del Comercio"
                : "Estado de Cuentas por Comercio"}
            </h2>
            {clienteId && (
              <button
                onClick={() => seleccionarComercio("")}
                className="text-xs text-blue-700 hover:underline cursor-pointer"
              >
                Ver todos
              </button>
            )}
          </div>

          {!clienteId ? (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {resumen.detalle.map((c) => {
                const deuda = Number(c.current_balance || 0);
                const tope = Number(c.credit_limit || 0);
                const retenido = Number(c.pendiente_aprobacion || 0);
                const excedido = tope > 0 && deuda > tope;

                return (
                  <div
                    key={c.id}
                    onClick={() => seleccionarComercio(String(c.id))}
                    className="w-full py-3 flex items-center justify-between text-left hover:bg-slate-50 px-2 rounded-lg cursor-pointer"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold text-sm text-slate-900">
                          {c.nombre_fantasia}
                        </p>
                        {excedido && (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">
                            EXCEDIDO DE TOPE
                          </span>
                        )}
                        {retenido > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                            +${retenido.toLocaleString("es-AR")} pend.
                            aprobación
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {c.zona_reparto || "Sin zona"} • Tope:{" "}
                        <strong>
                          {tope > 0
                            ? `$${tope.toLocaleString("es-AR")}`
                            : "Sin tope"}
                        </strong>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold text-sm ${
                          deuda > 0 ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        ${deuda.toLocaleString("es-AR")}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => abrirEditorTope(e, c)}
                        title="Modificar límite de crédito"
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-200 text-slate-600 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto text-xs">
              {movimientos.map((m) => (
                <div
                  key={m.id}
                  className="py-2.5 flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-800">
                      {m.observaciones || m.tipo}
                    </p>
                    <p className="text-slate-400">
                      {new Date(m.created_at).toLocaleDateString("es-AR")} •{" "}
                      {m.metodo_pago || "Cta. Cte."}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-bold ${
                        m.tipo === "CREDITO_PAGO"
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {m.tipo === "CREDITO_PAGO" ? "-" : "+"}$
                      {Number(m.monto).toLocaleString("es-AR")}
                    </p>
                    <p className="text-slate-400">
                      Saldo: $
                      {Number(m.saldo_posterior).toLocaleString("es-AR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Editar Límite de Crédito */}
      {editandoCliente && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900 text-sm">
                Tope de Crédito — {editandoCliente.nombre_fantasia}
              </h3>
              <button
                onClick={() => setEditandoCliente(null)}
                className="cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={guardarNuevoTope} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Límite máximo permitido ($ ARS — 0 = Sin tope)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  required
                  value={nuevoTope}
                  onChange={(e) => setNuevoTope(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>
              <button
                type="submit"
                disabled={guardandoTope}
                className="w-full py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-sm cursor-pointer disabled:opacity-60"
              >
                {guardandoTope ? "Guardando..." : "Guardar Límite"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
