import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  ShoppingCart,
  Store,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  LogOut,
  X,
  Truck,
} from "lucide-react";
import api from "../../config/api";
import { TenantProvider, useTenant } from "../../context/TenantContext";

function PortalTiendaContent() {
  const { slug } = useParams();
  const { tenant, loading: loadingTenant, error: tenantError } = useTenant();

  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loadingCat, setLoadingCat] = useState(true);

  const [categoriaActiva, setCategoriaActiva] = useState("ALL");
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sesión B2B opcional de Comercio Mayorista
  const [comercioB2B, setComercioB2B] = useState(() => {
    try {
      const saved = localStorage.getItem(`portal_b2b_comercio_${slug}`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [showLoginB2B, setShowLoginB2B] = useState(false);
  const [identificador, setIdentificador] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");

  // Datos Checkout
  const [guestNombre, setGuestNombre] = useState("");
  const [guestTelefono, setGuestTelefono] = useState("");
  const [guestDireccion, setGuestDireccion] = useState("");
  const [condicionPago, setCondicionPago] = useState("CONTADO_ENTREGA");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedidoConfirmado, setPedidoConfirmado] = useState(null);

  useEffect(() => {
    if (!tenant) return;
    const fetchCatalogo = async () => {
      try {
        setLoadingCat(true);
        const { data } = await api.get(`/public/t/${slug}/catalogo`);
        setCategorias(data.data.categorias || []);
        setProductos(data.data.productos || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingCat(false);
      }
    };
    fetchCatalogo();
  }, [tenant, slug]);

  useEffect(() => {
    if (comercioB2B) {
      setCondicionPago("CUENTA_CORRIENTE");
    } else {
      setCondicionPago("CONTADO_ENTREGA");
    }
  }, [comercioB2B]);

  const listaActiva = comercioB2B?.listaPrecioDefault || "MINORISTA";

  const getPrecio = (prod) => {
    if (listaActiva === "ESPECIAL") return Number(prod.precio_especial);
    if (listaActiva === "MAYORISTA") return Number(prod.precio_mayorista);
    return Number(prod.precio_minorista);
  };

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const matchCat =
        categoriaActiva === "ALL" ||
        String(p.categoria_id) === String(categoriaActiva);
      const q = busqueda.toLowerCase().trim();
      const matchText =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        (p.marca && p.marca.toLowerCase().includes(q));
      return matchCat && matchText;
    });
  }, [productos, categoriaActiva, busqueda]);

  const modificarCarrito = (prod, delta) => {
    setPedidoConfirmado(null);
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.producto_id === prod.id);
      if (idx === -1) {
        if (delta <= 0) return prev;
        return [
          ...prev,
          {
            producto_id: prod.id,
            nombre: prod.nombre,
            unidad_venta: prod.unidad_venta,
            stock_actual: prod.stock_actual,
            cantidad: Math.min(delta, prod.stock_actual),
            prodRef: prod,
          },
        ];
      }
      const nextQty = prev[idx].cantidad + delta;
      if (nextQty <= 0) return prev.filter((i) => i.producto_id !== prod.id);
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        cantidad: Math.min(nextQty, prod.stock_actual),
      };
      return copy;
    });
  };

  const totalCarrito = useMemo(
    () =>
      carrito.reduce(
        (acc, item) => acc + getPrecio(item.prodRef) * item.cantidad,
        0,
      ),
    [carrito, listaActiva],
  );

  const handleLoginB2B = async (e) => {
    e.preventDefault();
    setLoginError("");
    try {
      const { data } = await api.post(`/public/t/${slug}/login-comercio`, {
        identificador,
        pin,
      });
      const { token, comercio } = data.data;
      localStorage.setItem("portal_b2b_token", token);
      localStorage.setItem(
        `portal_b2b_comercio_${slug}`,
        JSON.stringify(comercio),
      );
      setComercioB2B(comercio);
      setShowLoginB2B(false);
      setIdentificador("");
      setPin("");
    } catch (err) {
      setLoginError(
        err.response?.data?.message || "CUIT/Código o PIN incorrecto",
      );
    }
  };

  const handleLogoutB2B = () => {
    localStorage.removeItem("portal_b2b_token");
    localStorage.removeItem(`portal_b2b_comercio_${slug}`);
    setComercioB2B(null);
  };

  const handleEnviarPedido = async (e) => {
    e.preventDefault();
    if (carrito.length === 0) return;

    setEnviando(true);
    try {
      const payload = {
        lista_aplicada: listaActiva,
        condicion_pago: condicionPago,
        guest_nombre: comercioB2B ? undefined : guestNombre,
        guest_telefono: comercioB2B ? undefined : guestTelefono,
        guest_direccion: comercioB2B ? undefined : guestDireccion,
        notas: notas || null,
        items: carrito.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
        })),
      };

      const { data } = await api.post(`/public/t/${slug}/pedidos`, payload);
      setPedidoConfirmado(data.data);
      setCarrito([]);
      setNotas("");
    } catch (err) {
      alert(err.response?.data?.message || "Error al procesar el pedido");
    } finally {
      setEnviando(false);
    }
  };

  if (loadingTenant) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600 font-medium">
        Cargando tienda...
      </div>
    );
  }

  if (tenantError || !tenant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Tienda no disponible
        </h1>
        <p className="text-slate-500 text-sm">{tenantError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header Público Camaleón */}
      <header className="sticky top-0 z-30 bg-brand-primary text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {tenant.logo_url ? (
              <img
                src={tenant.logo_url}
                alt={tenant.nombre_fantasia}
                className="w-10 h-10 rounded-xl object-cover bg-white"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-base sm:text-lg truncate">
                {tenant.nombre_fantasia}
              </h1>
              <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-white/15 font-semibold">
                {comercioB2B
                  ? `Comercio: ${comercioB2B.nombreFantasia} (Lista ${listaActiva})`
                  : "Catálogo Minorista"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {comercioB2B ? (
              <button
                onClick={handleLogoutB2B}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Salir Mayorista</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLoginB2B(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold shadow-sm hover:bg-slate-100 cursor-pointer"
              >
                <Store className="w-4 h-4 text-brand-primary" />
                <span>Acceso Comercios</span>
              </button>
            )}

            <button
              onClick={() => setDrawerOpen(true)}
              className="relative inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-secondary text-white text-xs font-bold shadow cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>${totalCarrito.toLocaleString("es-AR")}</span>
              {carrito.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-brand-accent text-slate-950 text-[11px] font-extrabold">
                  {carrito.reduce((acc, i) => acc + i.cantidad, 0)}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Buscador y Categorías */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar productos o marcas..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-300 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCategoriaActiva("ALL")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
              categoriaActiva === "ALL"
                ? "bg-brand-primary text-white"
                : "bg-white border border-slate-200 text-slate-700"
            }`}
          >
            Todos
          </button>
          {categorias.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoriaActiva(c.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
                String(categoriaActiva) === String(c.id)
                  ? "bg-brand-primary text-white"
                  : "bg-white border border-slate-200 text-slate-700"
              }`}
            >
              {c.nombre}
            </button>
          ))}
        </div>

        {/* Grilla de Productos */}
        {loadingCat ? (
          <p className="text-center py-12 text-slate-400 text-sm">
            Cargando catálogo...
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {productosFiltrados.map((prod) => {
              const precio = getPrecio(prod);
              const enCarrito = carrito.find((i) => i.producto_id === prod.id);
              const sinStock = prod.stock_actual <= 0;

              return (
                <div
                  key={prod.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="aspect-square bg-slate-100 relative overflow-hidden">
                      {prod.image_url ? (
                        <img
                          src={prod.image_url}
                          alt={prod.nombre}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs font-bold uppercase p-4 text-center">
                          {prod.marca || tenant.nombre_fantasia}
                        </div>
                      )}
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-slate-900/80 text-white text-[10px] font-semibold">
                        {prod.unidad_venta}
                      </span>
                    </div>

                    <div className="p-3.5">
                      <p className="text-[11px] text-slate-400 font-medium">
                        {prod.categoria_nombre}
                      </p>
                      <h3 className="font-bold text-sm text-slate-900 line-clamp-2 mt-0.5">
                        {prod.nombre}
                      </h3>
                    </div>
                  </div>

                  <div className="p-3.5 pt-0 space-y-2.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-extrabold text-brand-primary">
                        ${precio.toLocaleString("es-AR")}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {sinStock ? "Sin stock" : `Disp: ${prod.stock_actual}`}
                      </span>
                    </div>

                    {sinStock ? (
                      <button
                        disabled
                        className="w-full py-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold"
                      >
                        Agotado
                      </button>
                    ) : enCarrito ? (
                      <div className="flex items-center justify-between bg-slate-100 rounded-xl p-1">
                        <button
                          onClick={() => modificarCarrito(prod, -1)}
                          className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-bold text-sm">
                          {enCarrito.cantidad}
                        </span>
                        <button
                          onClick={() => modificarCarrito(prod, 1)}
                          className="w-8 h-8 rounded-lg bg-brand-primary text-white flex items-center justify-center cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => modificarCarrito(prod, 1)}
                        className="w-full py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:opacity-95 transition cursor-pointer"
                      >
                        Agregar al Pedido
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Login Comercio B2B */}
      {showLoginB2B && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900">
                Acceso Comercios Mayoristas
              </h3>
              <button
                onClick={() => setShowLoginB2B(false)}
                className="cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Ingresá tu CUIT o código de cliente y PIN para desbloquear tu
              lista mayorista y cuenta corriente.
            </p>
            {loginError && (
              <div className="p-2.5 rounded-xl bg-red-50 text-red-700 text-xs">
                {loginError}
              </div>
            )}
            <form onSubmit={handleLoginB2B} className="space-y-3">
              <input
                required
                placeholder="CUIT o Código de Cliente"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
              />
              <input
                required
                type="password"
                placeholder="PIN de acceso"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-brand-primary text-white font-bold text-sm cursor-pointer"
              >
                Ingresar como Comercio
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Drawer Carrito y Checkout */}
      {drawerOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
          <div className="bg-white w-full max-w-md h-full flex flex-col justify-between p-5 overflow-y-auto shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h2 className="font-bold text-lg text-slate-900">Tu Pedido</h2>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="cursor-pointer"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {pedidoConfirmado ? (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-base">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    <span>
                      ¡Pedido {pedidoConfirmado.numeroPedido} enviado!
                    </span>
                  </div>
                  <p className="text-xs">
                    Ya ingresó al sistema de {tenant.nombre_fantasia} para su
                    preparación.
                  </p>
                </div>
              ) : carrito.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-12">
                  Tu carrito está vacío
                </p>
              ) : (
                <>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {carrito.map((item) => {
                      const unit = getPrecio(item.prodRef);
                      return (
                        <div
                          key={item.producto_id}
                          className="flex items-center justify-between text-xs border-b border-slate-100 pb-2"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-bold text-slate-900 truncate">
                              {item.nombre}
                            </p>
                            <p className="text-slate-500">
                              {item.cantidad} x ${unit.toLocaleString("es-AR")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold">
                              ${(unit * item.cantidad).toLocaleString("es-AR")}
                            </span>
                            <button
                              onClick={() =>
                                modificarCarrito(item.prodRef, -item.cantidad)
                              }
                              className="text-red-500 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <form
                    onSubmit={handleEnviarPedido}
                    className="space-y-3 pt-2"
                  >
                    {!comercioB2B && (
                      <>
                        <input
                          required
                          placeholder="Tu Nombre y Apellido *"
                          value={guestNombre}
                          onChange={(e) => setGuestNombre(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                        />
                        <input
                          required
                          placeholder="Teléfono / WhatsApp *"
                          value={guestTelefono}
                          onChange={(e) => setGuestTelefono(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                        />
                        <input
                          required
                          placeholder="Dirección de entrega *"
                          value={guestDireccion}
                          onChange={(e) => setGuestDireccion(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                        />
                      </>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Forma de Pago
                      </label>
                      <select
                        value={condicionPago}
                        onChange={(e) => setCondicionPago(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                      >
                        {comercioB2B && (
                          <option value="CUENTA_CORRIENTE">
                            Cargar a mi Cuenta Corriente
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

                    {condicionPago === "TRANSFERENCIA" && tenant.bank_alias && (
                      <div className="p-2.5 rounded-xl bg-slate-100 text-[11px] text-slate-700">
                        Alias para transferir:{" "}
                        <strong>{tenant.bank_alias}</strong>
                      </div>
                    )}

                    <input
                      placeholder="Notas adicionales (opcional)"
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />

                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="font-semibold text-sm">Total:</span>
                      <span className="text-xl font-extrabold text-brand-primary">
                        ${totalCarrito.toLocaleString("es-AR")}
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={enviando}
                      className="w-full py-3 rounded-xl bg-brand-primary text-white font-bold text-sm shadow cursor-pointer disabled:opacity-60"
                    >
                      {enviando ? "Enviando pedido..." : "Confirmar Pedido"}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortalTiendaPage() {
  const { slug } = useParams();
  return (
    <TenantProvider mode="public" slug={slug}>
      <PortalTiendaContent />
    </TenantProvider>
  );
}
