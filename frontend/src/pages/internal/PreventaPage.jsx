import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Store,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  ShoppingBag,
  X,
  Pencil,
} from "lucide-react";
import api from "../../config/api";

const INITIAL_NUEVO_CLIENTE = {
  nombre_fantasia: "",
  cuit: "",
  direccion: "",
  zona_reparto: "",
  telefono: "",
  lista_precio_default: "MAYORISTA",
  credit_limit: 0,
  saldo_inicial: 0,
  web_access_enabled: false,
  web_pin: "",
};

export default function PreventaPage() {
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [clienteId, setClienteId] = useState("");
  const [listaPrecio, setListaPrecio] = useState("MAYORISTA");
  const [condicionPago, setCondicionPago] = useState("CUENTA_CORRIENTE");
  const [notas, setNotas] = useState("");
  const [busquedaProd, setBusquedaProd] = useState("");
  const [carrito, setCarrito] = useState([]);

  const [enviando, setEnviando] = useState(false);
  const [resultadoPedido, setResultadoPedido] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Modal alta rápida comercio
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState(INITIAL_NUEVO_CLIENTE);

  // Modal edición rápida de límite de crédito
  const [showEditarTope, setShowEditarTope] = useState(false);
  const [nuevoTopeValor, setNuevoTopeValor] = useState(0);
  const [guardandoTope, setGuardandoTope] = useState(false);

  const [waTexto, setWaTexto] = useState("");
  const [waAudio, setWaAudio] = useState(null);
  const [procesandoIA, setProcesandoIA] = useState(false);
  const [ambiguosIA, setAmbiguosIA] = useState([]);

  const handleProcesarWhatsAppIA = async () => {
    if (!waTexto.trim() && !waAudio) return;
    setProcesandoIA(true);
    setAmbiguosIA([]);
    try {
      const formData = new FormData();
      if (waTexto.trim()) formData.append("texto", waTexto);
      if (waAudio) formData.append("audio", waAudio);

      const { data } = await api.post(
        "/internal/pedidos/parse-whatsapp",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      const { items_listos, items_ambiguos } = data.data;
      setAmbiguosIA(items_ambiguos || []);

      items_listos.forEach((it) => {
        const prodObj = productos.find((p) => p.id === it.producto_id);
        if (prodObj && prodObj.stock_actual > 0) {
          agregarAlCarrito(prodObj, it.cantidad);
        }
      });

      setWaTexto("");
      setWaAudio(null);
    } catch (err) {
      alert(err.response?.data?.message || "No se pudo interpretar el mensaje");
    } finally {
      setProcesandoIA(false);
    }
  };

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const [resCli, resProd] = await Promise.all([
        api.get("/internal/clientes"),
        api.get("/internal/productos?solo_con_stock=true"),
      ]);
      setClientes(resCli.data.data || []);
      setProductos(resProd.data.data || []);
    } catch (err) {
      setErrorMsg("Error al cargar clientes o catálogo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const clienteSeleccionado = useMemo(
    () => clientes.find((c) => String(c.id) === String(clienteId)) || null,
    [clientes, clienteId],
  );

  const handleSeleccionarCliente = (id) => {
    setClienteId(id);
    setResultadoPedido(null);
    const encontrado = clientes.find((c) => String(c.id) === String(id));
    if (encontrado) {
      setListaPrecio(encontrado.lista_precio_default || "MAYORISTA");
    }
  };

  const getPrecioProducto = (prod) => {
    if (listaPrecio === "MINORISTA") return Number(prod.precio_minorista);
    if (listaPrecio === "ESPECIAL") return Number(prod.precio_especial);
    return Number(prod.precio_mayorista);
  };

  const productosFiltrados = useMemo(() => {
    const q = busquedaProd.toLowerCase().trim();
    if (!q) return productos.slice(0, 40);
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.marca && p.marca.toLowerCase().includes(q)),
    );
  }, [productos, busquedaProd]);

  const agregarAlCarrito = (prod, delta = 1) => {
    setResultadoPedido(null);
    setCarrito((prev) => {
      const idx = prev.findIndex((item) => item.producto_id === prod.id);
      if (idx === -1) {
        if (delta <= 0) return prev;
        return [
          ...prev,
          {
            producto_id: prod.id,
            nombre: prod.nombre,
            unidad_venta: prod.unidad_venta,
            stock_max: prod.stock_actual,
            cantidad: Math.min(delta, prod.stock_actual),
            prodRef: prod,
          },
        ];
      }
      const nuevaCant = prev[idx].cantidad + delta;
      if (nuevaCant <= 0) {
        return prev.filter((item) => item.producto_id !== prod.id);
      }
      const copia = [...prev];
      copia[idx] = {
        ...copia[idx],
        cantidad: Math.min(nuevaCant, prod.stock_actual),
      };
      return copia;
    });
  };

  const totalPedido = useMemo(() => {
    return carrito.reduce(
      (acc, item) => acc + getPrecioProducto(item.prodRef) * item.cantidad,
      0,
    );
  }, [carrito, listaPrecio]);

  const excedeCredito = useMemo(() => {
    if (!clienteSeleccionado || condicionPago !== "CUENTA_CORRIENTE")
      return false;
    const limite = Number(clienteSeleccionado.credit_limit || 0);
    if (limite <= 0) return false;
    const deudaActual = Number(clienteSeleccionado.current_balance || 0);
    const retenidoActual = Number(
      clienteSeleccionado.deuda_pendiente_aprobacion || 0,
    );
    return deudaActual + retenidoActual + totalPedido > limite;
  }, [clienteSeleccionado, condicionPago, totalPedido]);

  const confirmarPedido = async () => {
    if (!clienteId) {
      setErrorMsg("Seleccioná un comercio cliente primero");
      return;
    }
    if (carrito.length === 0) {
      setErrorMsg("Agregá al menos un producto al pedido");
      return;
    }

    setEnviando(true);
    setErrorMsg("");
    try {
      const payload = {
        cliente_comercio_id: Number(clienteId),
        lista_aplicada: listaPrecio,
        condicion_pago: condicionPago,
        notas: notas || null,
        items: carrito.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
        })),
      };

      const { data } = await api.post("/internal/pedidos", payload);
      setResultadoPedido(data.data);
      setCarrito([]);
      setNotas("");
      cargarDatos();
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "No se pudo confirmar el pedido",
      );
    } finally {
      setEnviando(false);
    }
  };

  const handleCrearClienteRapido = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/internal/clientes", nuevoCliente);
      await cargarDatos();
      setClienteId(String(data.data.id));
      setShowNuevoCliente(false);
      setNuevoCliente(INITIAL_NUEVO_CLIENTE);
    } catch (err) {
      alert(err.response?.data?.message || "Error al crear comercio");
    }
  };

  const abrirModalTope = () => {
    if (!clienteSeleccionado) return;
    setNuevoTopeValor(Number(clienteSeleccionado.credit_limit || 0));
    setShowEditarTope(true);
  };

  const handleGuardarTope = async (e) => {
    e.preventDefault();
    if (!clienteSeleccionado) return;
    setGuardandoTope(true);
    try {
      await api.patch(`/internal/clientes/${clienteSeleccionado.id}`, {
        credit_limit: Number(nuevoTopeValor),
      });
      await cargarDatos();
      setShowEditarTope(false);
    } catch (err) {
      alert(err.response?.data?.message || "No se pudo actualizar el límite");
    } finally {
      setGuardandoTope(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Toma de Pedido en Calle
          </h1>
          <p className="text-xs text-slate-500">
            Stock real y cuenta corriente en vivo
          </p>
        </div>
        <button
          onClick={() => setShowNuevoCliente(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Nuevo Comercio
        </button>
      </div>

      {/* Confirmación exitosa */}
      {resultadoPedido && (
        <div
          className={`p-4 rounded-2xl border space-y-1 ${
            resultadoPedido.requiereAprobacionCredito
              ? "bg-amber-50 border-amber-300 text-amber-950"
              : "bg-emerald-50 border-emerald-200 text-emerald-900"
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            {resultadoPedido.requiereAprobacionCredito ? (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            )}
            <span>Pedido {resultadoPedido.numeroPedido} registrado</span>
          </div>
          <p className="text-sm">
            Total:{" "}
            <strong>
              ${Number(resultadoPedido.total).toLocaleString("es-AR")}
            </strong>{" "}
            • Estado: <strong>{resultadoPedido.estado}</strong>
          </p>
          {resultadoPedido.requiereAprobacionCredito && (
            <p className="text-xs text-amber-800 font-semibold">
              Retenido por superar el límite de crédito: no descuenta stock ni
              se despacha hasta que Administración lo apruebe.
            </p>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Columna Izquierda: Comercio + Catálogo Rápido */}
        <div className="lg:col-span-2 space-y-4">
          {/* Selector de Comercio */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
            <label className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
              <Store className="w-4 h-4 text-brand-primary" />
              1. Seleccionar Comercio Cliente
            </label>
            <select
              value={clienteId}
              onChange={(e) => handleSeleccionarCliente(e.target.value)}
              className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-sm font-medium bg-white"
            >
              <option value="">
                -- Elegí un almacén / kiosco / autoservicio --
              </option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_fantasia}{" "}
                  {c.zona_reparto ? `(${c.zona_reparto})` : ""}
                </option>
              ))}
            </select>

            {clienteSeleccionado && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-500">Deuda Confirmada: </span>
                  <strong
                    className={
                      Number(clienteSeleccionado.current_balance) > 0
                        ? "text-red-600"
                        : "text-emerald-700"
                    }
                  >
                    $
                    {Number(clienteSeleccionado.current_balance).toLocaleString(
                      "es-AR",
                    )}
                  </strong>
                  {Number(clienteSeleccionado.deuda_pendiente_aprobacion) >
                    0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                      + $
                      {Number(
                        clienteSeleccionado.deuda_pendiente_aprobacion,
                      ).toLocaleString("es-AR")}{" "}
                      retenido por tope
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Límite Crédito: </span>
                  <strong>
                    {Number(clienteSeleccionado.credit_limit) > 0
                      ? `$${Number(clienteSeleccionado.credit_limit).toLocaleString("es-AR")}`
                      : "Sin tope"}
                  </strong>
                  <button
                    type="button"
                    onClick={abrirModalTope}
                    title="Configurar límite de crédito"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    Editar tope
                  </button>
                </div>

                <div>
                  <span className="text-slate-500">Dir: </span>
                  <span>{clienteSeleccionado.direccion}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Lista de Precios
                </label>
                <select
                  value={listaPrecio}
                  onChange={(e) => setListaPrecio(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                >
                  <option value="MAYORISTA">Lista Mayorista</option>
                  <option value="MINORISTA">Lista Minorista</option>
                  <option value="ESPECIAL">Lista Especial</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Condición de Pago
                </label>
                <select
                  value={condicionPago}
                  onChange={(e) => setCondicionPago(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                >
                  <option value="CUENTA_CORRIENTE">Cuenta Corriente</option>
                  <option value="CONTADO_ENTREGA">
                    Contado contra entrega
                  </option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-200 space-y-2.5">
            <p className="text-xs font-bold text-indigo-950">
              Asistente IA WhatsApp (Pegá mensaje o subí audio .ogg/.mp3)
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={waTexto}
                onChange={(e) => setWaTexto(e.target.value)}
                placeholder='Ej: "Mandame 3 packs de cola 2.25 y 2 cajones de cerveza"'
                className="flex-1 px-3 py-2 rounded-xl bg-white border border-indigo-200 text-xs"
              />
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setWaAudio(e.target.files?.[0] || null)}
                className="text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-white file:text-indigo-900 file:font-semibold"
              />
              <button
                type="button"
                onClick={handleProcesarWhatsAppIA}
                disabled={procesandoIA}
                className="px-4 py-2 rounded-xl bg-indigo-900 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {procesandoIA ? "Analizando..." : "Armar Carrito IA"}
              </button>
            </div>
            {ambiguosIA.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-900 text-xs">
                <strong>Revisar manualmente:</strong> {ambiguosIA.join(" • ")}
              </div>
            )}
          </div>

          {/* Buscador y Lista de Productos */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busquedaProd}
                onChange={(e) => setBusquedaProd(e.target.value)}
                placeholder="Buscar producto por nombre, marca o SKU..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            {loading ? (
              <p className="text-center py-6 text-sm text-slate-400">
                Cargando catálogo...
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
                {productosFiltrados.map((prod) => {
                  const precio = getPrecioProducto(prod);
                  const enCarrito = carrito.find(
                    (i) => i.producto_id === prod.id,
                  );
                  return (
                    <div
                      key={prod.id}
                      className="py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900 truncate">
                          {prod.nombre}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 font-medium">
                            {prod.unidad_venta}
                          </span>
                          <span
                            className={
                              prod.stock_actual <= prod.stock_minimo
                                ? "text-amber-600 font-semibold"
                                : "text-emerald-700"
                            }
                          >
                            Stock: {prod.stock_actual}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-sm text-slate-900 mr-1">
                          ${precio.toLocaleString("es-AR")}
                        </span>

                        {enCarrito ? (
                          <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
                            <button
                              onClick={() => agregarAlCarrito(prod, -1)}
                              className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center text-slate-700 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center font-bold text-sm">
                              {enCarrito.cantidad}
                            </span>
                            <button
                              onClick={() => agregarAlCarrito(prod, 1)}
                              className="w-7 h-7 rounded-lg bg-brand-primary text-white flex items-center justify-center cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => agregarAlCarrito(prod, 1)}
                              className="px-3 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-bold cursor-pointer"
                            >
                              +1
                            </button>
                            {prod.stock_actual >= 5 && (
                              <button
                                onClick={() => agregarAlCarrito(prod, 5)}
                                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
                              >
                                +5
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Resumen y Cierre del Pedido */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between h-fit sticky top-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h2 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <ShoppingBag className="w-4 h-4 text-brand-primary" />
                Resumen del Pedido ({carrito.length})
              </h2>
              {carrito.length > 0 && (
                <button
                  onClick={() => setCarrito([])}
                  className="text-xs text-red-600 hover:underline cursor-pointer"
                >
                  Vaciar
                </button>
              )}
            </div>

            {carrito.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                Tocá +1 o +5 en los productos para armar el pedido
              </p>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto">
                {carrito.map((item) => {
                  const unit = getPrecioProducto(item.prodRef);
                  return (
                    <div
                      key={item.producto_id}
                      className="flex items-center justify-between text-xs gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">
                          {item.nombre}
                        </p>
                        <p className="text-slate-500">
                          {item.cantidad} x ${unit.toLocaleString("es-AR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-slate-900">
                          ${(unit * item.cantidad).toLocaleString("es-AR")}
                        </span>
                        <button
                          onClick={() =>
                            agregarAlCarrito(item.prodRef, -item.cantidad)
                          }
                          className="text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observación para reparto (ej: entregar antes de 12hs)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
            />
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-200">
            {excedeCredito && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Supera el límite de crédito. Entrará retenido como{" "}
                  <strong>Pendiente de Aprobación</strong> hasta que
                  Administración lo autorice.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">
                Total Pedido:
              </span>
              <span className="text-2xl font-extrabold text-slate-900">
                ${totalPedido.toLocaleString("es-AR")}
              </span>
            </div>

            <button
              onClick={confirmarPedido}
              disabled={enviando || carrito.length === 0 || !clienteId}
              className="w-full py-3.5 rounded-xl bg-brand-primary text-white font-bold text-sm shadow-md hover:opacity-95 disabled:opacity-50 transition cursor-pointer"
            >
              {enviando ? "Confirmando..." : "Confirmar Pedido"}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Editar Límite de Crédito del Comercio Seleccionado */}
      {showEditarTope && clienteSeleccionado && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900 text-sm">
                Límite de Crédito — {clienteSeleccionado.nombre_fantasia}
              </h3>
              <button
                onClick={() => setShowEditarTope(false)}
                className="cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleGuardarTope} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Tope máximo adeudado ($ ARS — poner 0 para Sin Tope)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  required
                  value={nuevoTopeValor}
                  onChange={(e) => setNuevoTopeValor(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>
              <button
                type="submit"
                disabled={guardandoTope}
                className="w-full py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-sm cursor-pointer disabled:opacity-60"
              >
                {guardandoTope ? "Guardando..." : "Actualizar Tope"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Alta Rápida Comercio */}
      {showNuevoCliente && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900">
                Alta Rápida de Comercio
              </h3>
              <button
                onClick={() => setShowNuevoCliente(false)}
                className="cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCrearClienteRapido} className="space-y-3">
              <input
                required
                placeholder="Nombre Fantasía (ej: Kiosco El Cruce)"
                value={nuevoCliente.nombre_fantasia}
                onChange={(e) =>
                  setNuevoCliente({
                    ...nuevoCliente,
                    nombre_fantasia: e.target.value,
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <input
                required
                placeholder="Dirección de entrega"
                value={nuevoCliente.direccion}
                onChange={(e) =>
                  setNuevoCliente({
                    ...nuevoCliente,
                    direccion: e.target.value,
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Zona / Ruta (ej: Centro)"
                  value={nuevoCliente.zona_reparto}
                  onChange={(e) =>
                    setNuevoCliente({
                      ...nuevoCliente,
                      zona_reparto: e.target.value,
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <input
                  placeholder="Teléfono WhatsApp"
                  value={nuevoCliente.telefono}
                  onChange={(e) =>
                    setNuevoCliente({
                      ...nuevoCliente,
                      telefono: e.target.value,
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Límite Crédito ($ 0 = Sin tope)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={nuevoCliente.credit_limit ?? 0}
                    onChange={(e) =>
                      setNuevoCliente({
                        ...nuevoCliente,
                        credit_limit: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Saldo Inicial Adeudado ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={nuevoCliente.saldo_inicial ?? 0}
                    onChange={(e) =>
                      setNuevoCliente({
                        ...nuevoCliente,
                        saldo_inicial: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="CUIT (opcional)"
                  value={nuevoCliente.cuit || ""}
                  onChange={(e) =>
                    setNuevoCliente({
                      ...nuevoCliente,
                      cuit: e.target.value,
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <select
                  value={nuevoCliente.lista_precio_default}
                  onChange={(e) =>
                    setNuevoCliente({
                      ...nuevoCliente,
                      lista_precio_default: e.target.value,
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm"
                >
                  <option value="MAYORISTA">Lista Mayorista</option>
                  <option value="ESPECIAL">Lista Especial</option>
                  <option value="MINORISTA">Lista Minorista</option>
                </select>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(nuevoCliente.web_access_enabled)}
                    onChange={(e) =>
                      setNuevoCliente({
                        ...nuevoCliente,
                        web_access_enabled: e.target.checked,
                      })
                    }
                  />
                  Habilitar compra en Portal Web Mayorista
                </label>
                {nuevoCliente.web_access_enabled && (
                  <input
                    required
                    placeholder="PIN de acceso web (ej: 1234)"
                    value={nuevoCliente.web_pin || ""}
                    onChange={(e) =>
                      setNuevoCliente({
                        ...nuevoCliente,
                        web_pin: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                  />
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-sm cursor-pointer"
              >
                Guardar y Seleccionar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
