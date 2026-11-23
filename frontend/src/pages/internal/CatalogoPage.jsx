import { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  Minus,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  PackagePlus,
  X,
} from "lucide-react";
import api from "../../config/api";
import { useAuth } from "../../context/AuthContext";

const INITIAL_PRODUCTO = {
  sku: "",
  nombre: "",
  marca: "",
  categoria_id: "",
  unidad_venta: "Bulto x10",
  costo_reposicion: 0,
  precio_mayorista: 0,
  precio_minorista: 0,
  precio_especial: 0,
  stock_actual: 0,
  stock_minimo: 5,
  visible_en_web: true,
};

export default function CatalogoPage() {
  const { user } = useAuth();
  const canEdit = ["SUPERADMIN", "ADMIN", "DEPOSITO"].includes(user?.role);

  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [importStatus, setImportStatus] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [modalNuevoOpen, setModalNuevoOpen] = useState(false);
  const [nuevoProd, setNuevoProd] = useState(INITIAL_PRODUCTO);
  const [guardandoProd, setGuardandoProd] = useState(false);

  const fileInputRef = useRef(null);

  const fetchProductos = async () => {
    try {
      setLoading(true);
      const [resProd, resCat] = await Promise.all([
        api.get("/internal/productos", { params: { q } }),
        api.get("/internal/categorias"),
      ]);
      setProductos(resProd.data.data || []);
      setCategorias(resCat.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(fetchProductos, 250);
    return () => clearTimeout(t);
  }, [q]);

  const handleAjustarStock = async (id, cantidad) => {
    try {
      await api.post(`/internal/productos/${id}/stock`, { cantidad });
      fetchProductos();
    } catch (err) {
      alert(err.response?.data?.message || "No se pudo ajustar stock");
    }
  };

  const handleCrearProductoManual = async (e) => {
    e.preventDefault();
    setGuardandoProd(true);
    try {
      await api.post("/internal/productos", {
        ...nuevoProd,
        categoria_id: nuevoProd.categoria_id
          ? Number(nuevoProd.categoria_id)
          : null,
        costo_reposicion: Number(nuevoProd.costo_reposicion || 0),
        precio_mayorista: Number(nuevoProd.precio_mayorista),
        precio_minorista: Number(
          nuevoProd.precio_minorista || nuevoProd.precio_mayorista,
        ),
        precio_especial: Number(
          nuevoProd.precio_especial || nuevoProd.precio_mayorista,
        ),
        stock_actual: Number(nuevoProd.stock_actual || 0),
        stock_minimo: Number(nuevoProd.stock_minimo || 5),
      });
      setModalNuevoOpen(false);
      setNuevoProd(INITIAL_PRODUCTO);
      fetchProductos();
    } catch (err) {
      alert(err.response?.data?.message || "Error al crear producto");
    } finally {
      setGuardandoProd(false);
    }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    setImportStatus(null);
    try {
      const { data } = await api.post(
        "/internal/productos/import-excel",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      setImportStatus({ ok: true, message: data.message });
      fetchProductos();
    } catch (err) {
      setImportStatus({
        ok: false,
        message: err.response?.data?.message || "Error al importar Excel",
        errors: err.response?.data?.errors || [],
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Catálogo y Control de Stock
          </h1>
          <p className="text-xs text-slate-500">
            Carga manual, importación inteligente de Excel e inventario en
            tiempo real
          </p>
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setModalNuevoOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm cursor-pointer"
            >
              <PackagePlus className="w-4 h-4" />
              Nuevo Producto
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-60"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {uploading ? "Importando..." : "Importar Excel"}
            </button>
          </div>
        )}
      </div>

      {importStatus && (
        <div
          className={`p-3.5 rounded-xl border text-xs space-y-1 ${
            importStatus.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            {importStatus.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{importStatus.message}</span>
          </div>
          {importStatus.errors?.length > 0 && (
            <ul className="list-disc pl-5 space-y-0.5">
              {importStatus.errors.slice(0, 8).map((er, idx) => (
                <li key={idx}>
                  Fila {er.fila}: {er.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, SKU o marca..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-300 text-sm"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-3 px-4">SKU / Producto</th>
                <th className="py-3 px-4">Mayorista</th>
                <th className="py-3 px-4">Minorista</th>
                <th className="py-3 px-4">Especial</th>
                <th className="py-3 px-4">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-400">
                    Cargando productos...
                  </td>
                </tr>
              ) : productos.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-400">
                    Sin productos cargados. Usá "Nuevo Producto" o subí tu Excel
                    (.xlsx / .csv).
                  </td>
                </tr>
              ) : (
                productos.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {p.nombre}
                      </div>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono">{p.sku}</span> •{" "}
                        {p.unidad_venta}
                        {p.categoria_nombre ? ` • ${p.categoria_nombre}` : ""}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      ${Number(p.precio_mayorista).toLocaleString("es-AR")}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      ${Number(p.precio_minorista).toLocaleString("es-AR")}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      ${Number(p.precio_especial).toLocaleString("es-AR")}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {canEdit && (
                          <button
                            onClick={() => handleAjustarStock(p.id, -1)}
                            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-xs ${
                            p.stock_actual <= 0
                              ? "bg-red-100 text-red-700"
                              : p.stock_actual <= p.stock_minimo
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {p.stock_actual}
                        </span>
                        {canEdit && (
                          <button
                            onClick={() => handleAjustarStock(p.id, 1)}
                            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Alta Manual de Producto */}
      {modalNuevoOpen && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleCrearProductoManual}
            className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">
                Alta Manual de Producto
              </h3>
              <button
                type="button"
                onClick={() => setModalNuevoOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Código / SKU *
                </label>
                <input
                  required
                  value={nuevoProd.sku}
                  onChange={(e) =>
                    setNuevoProd({ ...nuevoProd, sku: e.target.value })
                  }
                  placeholder="Ej: BEB-010"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Presentación *
                </label>
                <input
                  required
                  value={nuevoProd.unidad_venta}
                  onChange={(e) =>
                    setNuevoProd({ ...nuevoProd, unidad_venta: e.target.value })
                  }
                  placeholder="Ej: Pack x6 / Bulto x10"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Nombre del Producto *
                </label>
                <input
                  required
                  value={nuevoProd.nombre}
                  onChange={(e) =>
                    setNuevoProd({ ...nuevoProd, nombre: e.target.value })
                  }
                  placeholder="Ej: Gaseosa Cola 2.25L"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Marca
                </label>
                <input
                  value={nuevoProd.marca}
                  onChange={(e) =>
                    setNuevoProd({ ...nuevoProd, marca: e.target.value })
                  }
                  placeholder="Ej: Coca-Cola"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Categoría
                </label>
                <select
                  value={nuevoProd.categoria_id}
                  onChange={(e) =>
                    setNuevoProd({ ...nuevoProd, categoria_id: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="">General</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Costo ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nuevoProd.costo_reposicion}
                  onChange={(e) =>
                    setNuevoProd({
                      ...nuevoProd,
                      costo_reposicion: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mayorista ($) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={nuevoProd.precio_mayorista}
                  onChange={(e) =>
                    setNuevoProd({
                      ...nuevoProd,
                      precio_mayorista: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Minorista ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nuevoProd.precio_minorista}
                  onChange={(e) =>
                    setNuevoProd({
                      ...nuevoProd,
                      precio_minorista: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Especial ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nuevoProd.precio_especial}
                  onChange={(e) =>
                    setNuevoProd({
                      ...nuevoProd,
                      precio_especial: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Stock Inicial
                </label>
                <input
                  type="number"
                  min="0"
                  value={nuevoProd.stock_actual}
                  onChange={(e) =>
                    setNuevoProd({ ...nuevoProd, stock_actual: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Alerta Stock Mínimo
                </label>
                <input
                  type="number"
                  min="0"
                  value={nuevoProd.stock_minimo}
                  onChange={(e) =>
                    setNuevoProd({ ...nuevoProd, stock_minimo: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={nuevoProd.visible_en_web}
                onChange={(e) =>
                  setNuevoProd({
                    ...nuevoProd,
                    visible_en_web: e.target.checked,
                  })
                }
              />
              Visible en el Portal Web de pedidos
            </label>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setModalNuevoOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoProd}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                {guardandoProd ? "Guardando..." : "Guardar Producto"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
