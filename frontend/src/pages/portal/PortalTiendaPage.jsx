import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useParams, Link } from "react-router-dom";
import {
  Search,
  ShoppingCart,
  Store,
  Plus,
  Minus,
  Trash2,
  X,
  CheckCircle2,
  Package,
  KeyRound,
  LogOut,
  Truck,
} from "lucide-react";
import api from "../../config/api";

export default function PublicB2BCatalog() {
  const { slug } = useParams();
  const { bootstrap } = useOutletContext();
  const dist = bootstrap?.distribuidora || {};
  const primary = bootstrap?.theme?.primaryColor || "#0F4C81";

  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("ALL");

  // Sesión Comercio B2B
  const [comercioAuth, setComercioAuth] = useState(() => {
    try {
      const saved = localStorage.getItem(`b2b_comercio_${slug}`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [modalLoginOpen, setModalLoginOpen] = useState(false);
  const [cuitOrTel, setCuitOrTel] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Carrito y Checkout
  const [carrito, setCarrito] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [guestNombre, setGuestNombre] = useState("");
  const [guestTelefono, setGuestTelefono] = useState("");
  const [guestDireccion, setGuestDireccion] = useState("");
  const [condicionPago, setCondicionPago] = useState("CONTADO_ENTREGA");
  const [notasPedido, setNotasPedido] = useState("");
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [pedidoConfirmado, setPedidoConfirmado] = useState(null);

  useEffect(() => {
    async function cargarCatalogo() {
      setLoading(true);
      try {
        const { data } = await api.get(`/public/t/${slug}/catalogo`);
        setCategorias(data.data?.categorias || []);
        setProductos(data.data?.productos || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    cargarCatalogo();
  }, [slug]);

  const listaActiva = comercioAuth?.lista_precio_default || "MINORISTA";

  const getPrecio = (prod) => {
    if (listaActiva === "ESPECIAL") return Number(prod.precio_especial);
    if (listaActiva === "MAYORISTA") return Number(prod.precio_mayorista);
    return Number(prod.precio_minorista);
  };

  const productosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return productos.filter((p) => {
      const matchCat =
        categoriaActiva === "ALL" ||
        String(p.categoria_id) === String(categoriaActiva);
      const matchQ =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.marca && p.marca.toLowerCase().includes(q));
      return matchCat && matchQ;
    });
  }, [productos, busqueda, categoriaActiva]);

  const cambiarCantidad = (prod, delta) => {
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.producto_id === prod.id);
      if (idx === -1) {
        if (delta <= 0 || prod.stock_actual <= 0) return prev;
        return [
          ...prev,
          {
            producto_id: prod.id,
            nombre: prod.nombre,
            unidad_venta: prod.unidad_venta,
            stock_max: prod.stock_actual,
            cantidad: 1,
            prodRef: prod,
          },
        ];
      }
      const nueva = prev[idx].cantidad + delta;
      if (nueva <= 0) return prev.filter((i) => i.producto_id !== prod.id);
      const copia = [...prev];
      copia[idx] = {
        ...copia[idx],
        cantidad: Math.min(nueva, prod.stock_actual),
      };
      return copia;
    });
  };

  const totalCarrito = useMemo(
    () =>
      carrito.reduce((acc, it) => acc + getPrecio(it.prodRef) * it.cantidad, 0),
    [carrito, listaActiva],
  );

  const totalBultos = useMemo(
    () => carrito.reduce((acc, it) => acc + it.cantidad, 0),
    [carrito],
  );

  const handleLoginComercio = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const { data } = await api.post(`/public/t/${slug}/comercio-login`, {
        identificador: cuitOrTel.trim(),
        pin: pin.trim(),
      });
      const authData = data.data;
      setComercioAuth(authData);
      localStorage.setItem(`b2b_comercio_${slug}`, JSON.stringify(authData));
      setCondicionPago("CUENTA_CORRIENTE");
      setModalLoginOpen(false);
      setCuitOrTel("");
      setPin("");
    } catch (err) {
      setLoginError(err.response?.data?.message || "Credenciales incorrectas");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogoutComercio = () => {
    setComercioAuth(null);
    localStorage.removeItem(`b2b_comercio_${slug}`);
    setCondicionPago("CONTADO_ENTREGA");
  };

  const handleEnviarPedido = async (e) => {
    e.preventDefault();
    if (carrito.length === 0) return;

    setEnviandoPedido(true);
    try {
      const headers = comercioAuth?.token
        ? { Authorization: `Bearer ${comercioAuth.token}` }
        : {};

      const payload = {
        lista_aplicada: listaActiva,
        condicion_pago: condicionPago,
        notas: notasPedido || null,
        guest_nombre: comercioAuth ? null : guestNombre,
        guest_telefono: comercioAuth ? null : guestTelefono,
        guest_direccion: comercioAuth ? null : guestDireccion,
        items: carrito.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
        })),
      };

      const { data } = await api.post(`/public/t/${slug}/pedidos`, payload, {
        headers,
      });
      setPedidoConfirmado(data.data);
      setCarrito([]);
      setNotasPedido("");
      setDrawerOpen(false);
    } catch (err) {
      alert(err.response?.data?.message || "No se pudo enviar el pedido");
    } finally {
      setEnviandoPedido(false);
    }
  };

  return (
    <>
      {/* Único Header Moderno, Limpio y Protagonista */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          {/* Identidad de Marca */}
          <div className="flex items-center gap-3 min-w-0">
            {bootstrap?.theme?.logoUrl ? (
              <img
                src={bootstrap.theme.logoUrl}
                alt={dist.nombreFantasia}
                className="h-11 w-11 rounded-2xl border border-slate-200 p-1 object-contain shrink-0"
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
              <h1 className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight truncate">
                {dist.nombreFantasia}
              </h1>
              <div className="flex items-center gap-2 text-xs">
                <span
                  style={{ backgroundColor: `${primary}15`, color: primary }}
                  className="px-2 py-0.5 rounded-md font-bold text-[11px]"
                >
                  Lista {listaActiva}
                </span>
                <span className="text-slate-400 hidden sm:inline">
                  • Pedidos online con entrega programada
                </span>
              </div>
            </div>
          </div>

          {/* Buscador central */}
          <div className="order-3 md:order-2 w-full md:w-80 lg:w-96 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar productos, marcas o códigos..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-100 focus:bg-white border border-transparent focus:border-slate-300 text-sm outline-none transition"
            />
          </div>

          {/* Acciones derecha */}
          <div className="order-2 md:order-3 flex items-center gap-2 shrink-0">
            {comercioAuth ? (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs">
                <span className="font-bold text-emerald-900 truncate max-w-[130px]">
                  {comercioAuth.nombre_fantasia}
                </span>
                <button
                  onClick={handleLogoutComercio}
                  title="Cerrar sesión comercio"
                  className="text-emerald-700 hover:text-rose-600 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setModalLoginOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold cursor-pointer transition"
              >
                <KeyRound className="w-3.5 h-3.5" style={{ color: primary }} />
                Acceso Comercios
              </button>
            )}

            <button
              onClick={() => setDrawerOpen(true)}
              style={{ backgroundColor: primary }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-extrabold shadow-sm hover:opacity-95 cursor-pointer transition"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>${totalCarrito.toLocaleString("es-AR")}</span>
              {totalBultos > 0 && (
                <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-[11px]">
                  {totalBultos}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Barra de Categorías */}
        <div className="border-t border-slate-100 bg-slate-50/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setCategoriaActiva("ALL")}
              style={
                categoriaActiva === "ALL"
                  ? { backgroundColor: primary, color: "#fff" }
                  : {}
              }
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition ${
                categoriaActiva === "ALL"
                  ? "shadow-2xs"
                  : "bg-white border border-slate-200 text-slate-600 hover:text-slate-900"
              }`}
            >
              Todos ({productos.length})
            </button>
            {categorias.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoriaActiva(cat.id)}
                style={
                  String(categoriaActiva) === String(cat.id)
                    ? { backgroundColor: primary, color: "#fff" }
                    : {}
                }
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition ${
                  String(categoriaActiva) === String(cat.id)
                    ? "shadow-2xs"
                    : "bg-white border border-slate-200 text-slate-600 hover:text-slate-900"
                }`}
              >
                {cat.nombre}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Banner de Pedido Confirmado */}
      {pedidoConfirmado && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-5">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <p className="font-extrabold text-sm text-emerald-950">
                  ¡Pedido {pedidoConfirmado.numeroPedido} recibido!
                </p>
                <p className="text-xs text-emerald-800">
                  Total: $
                  {Number(pedidoConfirmado.total).toLocaleString("es-AR")} • Ya
                  ingresó a preparación en depósito.
                </p>
              </div>
            </div>
            <button
              onClick={() => setPedidoConfirmado(null)}
              className="text-xs font-bold text-emerald-800 underline cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Grilla de Productos */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="text-center py-16 text-sm text-slate-400">
            Cargando catálogo disponible...
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-2">
            <Package className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-800 text-sm">
              No encontramos productos con ese filtro
            </p>
            <p className="text-xs text-slate-500">
              Probá limpiando el buscador o seleccionando otra categoría.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {productosFiltrados.map((prod) => {
              const precio = getPrecio(prod);
              const itemEnCarrito = carrito.find(
                (i) => i.producto_id === prod.id,
              );
              const sinStock = prod.stock_actual <= 0;

              return (
                <article
                  key={prod.id}
                  className="bg-white rounded-2xl border border-slate-200/90 p-4 flex flex-col justify-between gap-4 hover:shadow-md transition"
                >
                  <div className="space-y-2.5">
                    {/* Cabecera / Imagen o Ícono limpio de presentación */}
                    {prod.image_url ? (
                      <div className="relative h-36 rounded-xl bg-slate-50 overflow-hidden flex items-center justify-center">
                        <img
                          src={prod.image_url}
                          alt={prod.nombre}
                          className="h-full w-full object-contain p-2"
                        />
                        <span className="absolute top-2 left-2 px-2.5 py-0.5 rounded-lg bg-slate-900/85 text-white text-[11px] font-bold">
                          {prod.unidad_venta}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span
                          style={{
                            backgroundColor: `${primary}14`,
                            color: primary,
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold"
                        >
                          {prod.unidad_venta}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {prod.sku}
                        </span>
                      </div>
                    )}

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {prod.categoria_nombre || "General"}
                        {prod.marca ? ` • ${prod.marca}` : ""}
                      </p>
                      <h3 className="font-bold text-sm text-slate-900 leading-snug mt-0.5">
                        {prod.nombre}
                      </h3>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2.5">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400">
                          Precio {listaActiva}
                        </p>
                        <p className="text-lg font-extrabold text-slate-900">
                          ${precio.toLocaleString("es-AR")}
                        </p>
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          sinStock
                            ? "bg-rose-50 text-rose-600"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {sinStock ? "Sin stock" : `${prod.stock_actual} disp.`}
                      </span>
                    </div>

                    {itemEnCarrito ? (
                      <div className="flex items-center justify-between bg-slate-100 rounded-xl p-1">
                        <button
                          onClick={() => cambiarCantidad(prod, -1)}
                          className="w-8 h-8 rounded-lg bg-white shadow-2xs flex items-center justify-center text-slate-700 cursor-pointer"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-extrabold text-sm text-slate-900">
                          {itemEnCarrito.cantidad}{" "}
                          {itemEnCarrito.cantidad === 1 ? "bulto" : "bultos"}
                        </span>
                        <button
                          onClick={() => cambiarCantidad(prod, 1)}
                          style={{ backgroundColor: primary }}
                          className="w-8 h-8 rounded-lg text-white flex items-center justify-center cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => cambiarCantidad(prod, 1)}
                        disabled={sinStock}
                        style={!sinStock ? { backgroundColor: primary } : {}}
                        className="w-full py-2.5 rounded-xl text-white text-xs font-extrabold disabled:bg-slate-200 disabled:text-slate-400 hover:opacity-95 cursor-pointer transition"
                      >
                        {sinStock ? "Agotado" : "Agregar al Pedido"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer limpio con acceso discreto al sistema interno */}
      <footer className="border-t border-slate-200 bg-white py-5 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4" style={{ color: primary }} />
            <span className="font-semibold text-slate-600">
              {dist.nombreFantasia}
            </span>
            {dist.direccion && <span>• {dist.direccion}</span>}
          </div>
          <Link to="/login" className="hover:text-slate-700 underline">
            Acceso Equipo Interno
          </Link>
        </div>
      </footer>

      {/* Modal Acceso Comercios con PIN */}
      {modalLoginOpen && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleLoginComercio}
            className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">
                Acceso Comercios Registrados
              </h3>
              <button
                type="button"
                onClick={() => setModalLoginOpen(false)}
                className="text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Ingresá tu CUIT o teléfono registrado y tu PIN para ver precios
              mayoristas y operar con Cuenta Corriente.
            </p>
            {loginError && (
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold">
                {loginError}
              </div>
            )}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  CUIT o Teléfono
                </label>
                <input
                  required
                  value={cuitOrTel}
                  onChange={(e) => setCuitOrTel(e.target.value)}
                  placeholder="Ej: 20-28456123-7"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  PIN de Acceso
                </label>
                <input
                  type="password"
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loggingIn}
              style={{ backgroundColor: primary }}
              className="w-full py-3 rounded-xl text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
            >
              {loggingIn ? "Verificando..." : "Ingresar con Lista Mayorista"}
            </button>
          </form>
        </div>
      )}

      {/* Drawer Lateral de Carrito y Confirmación */}
      {drawerOpen && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex justify-end">
          <div className="bg-white w-full max-w-md h-full flex flex-col justify-between p-5 shadow-2xl overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <ShoppingCart
                    className="w-5 h-5"
                    style={{ color: primary }}
                  />
                  Tu Pedido ({totalBultos} bultos)
                </h3>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {carrito.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-12">
                  Todavía no agregaste productos al carrito.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {carrito.map((item) => {
                    const unit = getPrecio(item.prodRef);
                    return (
                      <div
                        key={item.producto_id}
                        className="py-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">
                            {item.nombre}
                          </p>
                          <p className="text-slate-500">
                            {item.cantidad} x ${unit.toLocaleString("es-AR")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-extrabold text-slate-900">
                            ${(unit * item.cantidad).toLocaleString("es-AR")}
                          </span>
                          <button
                            onClick={() =>
                              cambiarCantidad(item.prodRef, -item.cantidad)
                            }
                            className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {carrito.length > 0 && (
                <form
                  id="form-checkout-b2b"
                  onSubmit={handleEnviarPedido}
                  className="space-y-3 pt-3 border-t text-xs"
                >
                  {!comercioAuth && (
                    <>
                      <input
                        required
                        value={guestNombre}
                        onChange={(e) => setGuestNombre(e.target.value)}
                        placeholder="Tu Nombre o Nombre del Comercio *"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                      <input
                        required
                        value={guestTelefono}
                        onChange={(e) => setGuestTelefono(e.target.value)}
                        placeholder="Teléfono / WhatsApp *"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                      <input
                        required
                        value={guestDireccion}
                        onChange={(e) => setGuestDireccion(e.target.value)}
                        placeholder="Dirección de entrega *"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                    </>
                  )}

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Forma de Pago
                    </label>
                    <select
                      value={condicionPago}
                      onChange={(e) => setCondicionPago(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                    >
                      {comercioAuth && (
                        <option value="CUENTA_CORRIENTE">
                          Cuenta Corriente Comercial
                        </option>
                      )}
                      <option value="CONTADO_ENTREGA">
                        Efectivo contra entrega
                      </option>
                      <option value="TRANSFERENCIA">
                        Transferencia Bancaria
                      </option>
                    </select>
                  </div>

                  <input
                    value={notasPedido}
                    onChange={(e) => setNotasPedido(e.target.value)}
                    placeholder="Horario o aclaración de entrega (opcional)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </form>
              )}
            </div>

            {carrito.length > 0 && (
              <div className="pt-4 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">
                    Total Estimado:
                  </span>
                  <span className="text-2xl font-extrabold text-slate-900">
                    ${totalCarrito.toLocaleString("es-AR")}
                  </span>
                </div>
                <button
                  type="submit"
                  form="form-checkout-b2b"
                  disabled={enviandoPedido}
                  style={{ backgroundColor: primary }}
                  className="w-full py-3.5 rounded-xl text-white font-extrabold text-sm shadow-md hover:opacity-95 cursor-pointer disabled:opacity-50"
                >
                  {enviandoPedido ? "Enviando Pedido..." : "Confirmar Pedido"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
