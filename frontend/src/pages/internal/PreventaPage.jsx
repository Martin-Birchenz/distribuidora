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
  Sparkles,
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

  // Solo texto de WhatsApp (sin audio)
  const [waTexto, setWaTexto] = useState("");
  const [procesandoIA, setProcesandoIA] = useState(false);
  const [ambiguosIA, setAmbiguosIA] = useState([]);

  // Modal alta rápida comercio
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState(INITIAL_NUEVO_CLIENTE);
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  // Modal edición rápida de límite de crédito
  const [showEditarTope, setShowEditarTope] = useState(false);
  const [nuevoTopeValor, setNuevoTopeValor] = useState(0);
  const [guardandoTope, setGuardandoTope] = useState(false);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const [resCli, resProd] = await Promise.all([
        api.get("/internal/clientes"),
        api.get("/internal/productos?solo_con_stock=true"),
      ]);
      setClientes(resCli.data.data || []);
      setProductos(resProd.data.data || []);
    } catch {
      setErrorMsg("No pudimos cargar los clientes o el catálogo.");
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

  const handleProcesarWhatsAppIA = async () => {
    if (!waTexto.trim()) return;
    setProcesandoIA(true);
    setAmbiguosIA([]);
    setErrorMsg("");
    try {
      const { data } = await api.post("/internal/pedidos/parse-whatsapp", {
        texto: waTexto,
      });

      const { items_listos = [], items_ambiguos = [] } = data.data || {};
      setAmbiguosIA(items_ambiguos);

      items_listos.forEach((it) => {
        const prodObj = productos.find((p) => p.id === it.producto_id);
        if (prodObj && prodObj.stock_actual > 0) {
          agregarAlCarrito(prodObj, it.cantidad);
        }
      });

      setWaTexto("");
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message ||
          "No pudimos interpretar el mensaje. Podés cargarlo manualmente.",
      );
    } finally {
      setProcesandoIA(false);
    }
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

  const handleCrearPedido = async (e) => {
    e.preventDefault();
    if (!clienteId || carrito.length === 0) return;
    setEnviando(true);
    setErrorMsg("");
    try {
      const { data } = await api.post("/internal/pedidos", {
        cliente_id: Number(clienteId),
        lista_precio: listaPrecio,
        condicion_pago: condicionPago,
        notas: notas.trim() || undefined,
        items: carrito.map((c) => ({
          producto_id: c.producto_id,
          cantidad: c.cantidad,
        })),
      });
      setResultadoPedido(data.data);
      setCarrito([]);
      setNotas("");
      setAmbiguosIA([]);
      await cargarDatos();
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "No se pudo registrar el pedido.",
      );
    } finally {
      setEnviando(false);
    }
  };

  const handleCrearClienteRapido = async (e) => {
    e.preventDefault();
    setGuardandoCliente(true);
    try {
      const { data } = await api.post("/internal/clientes", {
        ...nuevoCliente,
        credit_limit: Number(nuevoCliente.credit_limit || 0),
        saldo_inicial: Number(nuevoCliente.saldo_inicial || 0),
      });
      const creado = data.data;
      await cargarDatos();
      if (creado?.id) {
        setClienteId(String(creado.id));
        setListaPrecio(creado.lista_precio_default || "MAYORISTA");
      }
      setShowNuevoCliente(false);
      setNuevoCliente(INITIAL_NUEVO_CLIENTE);
    } catch (err) {
      alert(err.response?.data?.message || "No se pudo crear el cliente.");
    } finally {
      setGuardandoCliente(false);
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
        credit_limit: Number(nuevoTopeValor || 0),
      });
      await cargarDatos();
      setShowEditarTope(false);
    } catch (err) {
      alert(err.response?.data?.message || "No se pudo actualizar el tope.");
    } finally {
      setGuardandoTope(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Preventa y Toma de Pedidos
          </h1>
          <p className="text-xs text-slate-500">
            Cargá pedidos por cliente, lista de precios o pegando el mensaje de
            WhatsApp
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNuevoCliente(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Nuevo Comercio
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg("")}
            className="p-1 hover:bg-red-100 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {resultadoPedido && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              Pedido #{resultadoPedido.numero_pedido || resultadoPedido.id}{" "}
              registrado correctamente.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setResultadoPedido(null)}
            className="p-1 hover:bg-emerald-100 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Columna Izquierda: Cliente + Texto WhatsApp IA + Catálogo */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Comercio / Cliente *
                </label>
                <select
                  value={clienteId}
                  onChange={(e) => handleSeleccionarCliente(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                >
                  <option value="">Seleccionar comercio...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre_fantasia}{" "}
                      {c.zona_reparto ? `(${c.zona_reparto})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Lista de Precios
                </label>
                <select
                  value={listaPrecio}
                  onChange={(e) => setListaPrecio(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                >
                  <option value="MAYORISTA">Mayorista</option>
                  <option value="MINORISTA">Minorista</option>
                  <option value="ESPECIAL">Especial</option>
                </select>
              </div>
            </div>

            {clienteSeleccionado && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-slate-600" />
                  <span className="font-bold text-slate-800">
                    Saldo actual: $
                    {Number(
                      clienteSeleccionado.current_balance || 0,
                    ).toLocaleString("es-AR")}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-700">
                    Tope crédito:{" "}
                    <strong>
                      $
                      {Number(
                        clienteSeleccionado.credit_limit || 0,
                      ).toLocaleString("es-AR")}
                    </strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={abrirModalTope}
                  className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 font-semibold cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar tope
                </button>
              </div>
            )}
          </div>

          {/* Pegar texto de WhatsApp (solo texto) */}
          <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-200 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
              <Sparkles className="w-4 h-4 text-indigo-700" />
              <span>Pegar texto de WhatsApp para armar el carrito</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={waTexto}
                onChange={(e) => setWaTexto(e.target.value)}
                placeholder='Ej: "Mandame 3 packs de cola 2.25 y 2 cajones de cerveza"'
                className="flex-1 px-3 py-2 rounded-xl bg-white border border-indigo-200 text-xs"
              />
              <button
                type="button"
                onClick={handleProcesarWhatsAppIA}
                disabled={procesandoIA || !waTexto.trim()}
                className="px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {procesandoIA ? "Analizando..." : "Armar Carrito IA"}
              </button>
            </div>
            {ambiguosIA.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-900 text-xs flex items-start justify-between gap-2">
                <div>
                  <strong>Revisar manualmente:</strong> {ambiguosIA.join(" • ")}
                </div>
                <button
                  type="button"
                  onClick={() => setAmbiguosIA([])}
                  className="p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Buscador y listado de productos */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busquedaProd}
                onChange={(e) => setBusquedaProd(e.target.value)}
                placeholder="Buscar producto por nombre, SKU o marca..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            {loading ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Cargando productos...
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                {productosFiltrados.map((prod) => (
                  <div
                    key={prod.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {prod.nombre}
                      </div>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono">{prod.sku}</span> •{" "}
                        {prod.unidad_venta} • Stock:{" "}
                        <strong>{prod.stock_actual}</strong>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-900">
                        ${getPrecioProducto(prod).toLocaleString("es-AR")}
                      </span>
                      <button
                        type="button"
                        onClick={() => agregarAlCarrito(prod, 1)}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                      >
                        + Agregar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Carrito y Confirmación */}
        <div className="lg:col-span-5">
          <form
            onSubmit={handleCrearPedido}
            className="bg-white p-4 rounded-2xl border border-slate-200 space-y-4 sticky top-4"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <ShoppingBag className="w-4 h-4" />
                <span>Detalle del Pedido ({carrito.length})</span>
              </div>
              {carrito.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCarrito([])}
                  className="text-xs text-red-600 hover:underline cursor-pointer"
                >
                  Vaciar
                </button>
              )}
            </div>

            {carrito.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                Agregá productos desde el catálogo o pegá un pedido de WhatsApp.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto">
                {carrito.map((item) => {
                  const unitPrice = getPrecioProducto(item.prodRef);
                  return (
                    <div
                      key={item.producto_id}
                      className="p-2.5 rounded-xl bg-slate-50 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">
                          {item.nombre}
                        </div>
                        <div className="text-slate-500">
                          ${unitPrice.toLocaleString("es-AR")} x {item.cantidad}{" "}
                          ={" "}
                          <strong className="text-slate-800">
                            $
                            {(unitPrice * item.cantidad).toLocaleString(
                              "es-AR",
                            )}
                          </strong>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => agregarAlCarrito(item.prodRef, -1)}
                          className="w-6 h-6 rounded-lg border border-slate-300 bg-white flex items-center justify-center cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold w-6 text-center">
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => agregarAlCarrito(item.prodRef, 1)}
                          className="w-6 h-6 rounded-lg border border-slate-300 bg-white flex items-center justify-center cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCarrito((prev) =>
                              prev.filter(
                                (x) => x.producto_id !== item.producto_id,
                              ),
                            )
                          }
                          className="p-1 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2.5 pt-2 border-t text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Condición de Pago
                </label>
                <select
                  value={condicionPago}
                  onChange={(e) => setCondicionPago(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                >
                  <option value="CUENTA_CORRIENTE">Cuenta Corriente</option>
                  <option value="CONTADO">Contado / Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Notas para reparto
                </label>
                <input
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej: Entregar por la mañana..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>

            {excedeCredito && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Este pedido supera el límite de crédito disponible del
                  cliente.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-semibold text-slate-600">
                Total Estimado
              </span>
              <span className="text-xl font-extrabold text-slate-900">
                ${totalPedido.toLocaleString("es-AR")}
              </span>
            </div>

            <button
              type="submit"
              disabled={!clienteId || carrito.length === 0 || enviando}
              className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold cursor-pointer disabled:opacity-50"
            >
              {enviando ? "Registrando..." : "Confirmar Pedido"}
            </button>
          </form>
        </div>
      </div>

      {/* Modal Nuevo Comercio */}
      {showNuevoCliente && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCrearClienteRapido}
            className="bg-white rounded-3xl max-w-md w-full p-5 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900 text-sm">
                Alta Rápida de Comercio
              </h3>
              <button
                type="button"
                onClick={() => setShowNuevoCliente(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nombre o Razón Social *
                </label>
                <input
                  required
                  value={nuevoCliente.nombre_fantasia}
                  onChange={(e) =>
                    setNuevoCliente({
                      ...nuevoCliente,
                      nombre_fantasia: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Zona
                  </label>
                  <input
                    value={nuevoCliente.zona_reparto}
                    onChange={(e) =>
                      setNuevoCliente({
                        ...nuevoCliente,
                        zona_reparto: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tope Crédito ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={nuevoCliente.credit_limit}
                    onChange={(e) =>
                      setNuevoCliente({
                        ...nuevoCliente,
                        credit_limit: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowNuevoCliente(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoCliente}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                {guardandoCliente ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Editar Tope */}
      {showEditarTope && clienteSeleccionado && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleGuardarTope}
            className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-3 shadow-2xl"
          >
            <h3 className="font-bold text-slate-900 text-sm">
              Tope de Crédito — {clienteSeleccionado.nombre_fantasia}
            </h3>
            <input
              type="number"
              min="0"
              value={nuevoTopeValor}
              onChange={(e) => setNuevoTopeValor(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEditarTope(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoTope}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                {guardandoTope ? "Guardando..." : "Actualizar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
