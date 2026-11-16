import { useState, useEffect, useRef } from "react";
import {
  Search,
  Upload,
  Plus,
  Minus,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import api from "../../config/api";
import { useAuth } from "../../context/AuthContext";

export default function CatalogoPage() {
  const { user } = useAuth();
  const canEdit = ["SUPERADMIN", "ADMIN", "DEPOSITO"].includes(user?.role);

  const [productos, setProductos] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [importStatus, setImportStatus] = useState(null);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef(null);

  const fetchProductos = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/internal/productos", { params: { q } });
      setProductos(data.data || []);
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

  const handleDescargarPlantilla = async () => {
    const response = await api.get("/internal/productos/plantilla-excel", {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "plantilla_catalogo_distribuidora.xlsx");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Catálogo y Control de Stock
          </h1>
          <p className="text-xs text-slate-500">
            Precios por lista e inventario en tiempo real
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
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
              {uploading ? "Importando..." : "Importar / Actualizar Excel"}
            </button>
            <button
              onClick={handleDescargarPlantilla}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              Descargar Plantilla Excel
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
                    Sin productos. Subí tu plantilla Excel con columnas: SKU,
                    Nombre, Categoria, Unidad_Venta, Precio_Minorista,
                    Precio_Mayorista, Precio_Especial, Stock_Inicial.
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
    </div>
  );
}
