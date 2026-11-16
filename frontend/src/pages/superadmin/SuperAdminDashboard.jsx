import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Plus,
  ExternalLink,
  LogOut,
  ShieldCheck,
  Power,
  Globe,
  Users,
  ShoppingBag,
  Wrench,
  X,
} from "lucide-react";
import api from "../../config/api";
import { useAuth } from "../../context/AuthContext";

const INITIAL_FORM = {
  razon_social: "",
  nombre_fantasia: "",
  cuit: "",
  slug: "",
  plan_type: "FULL",
  has_web_portal: true,
  has_ai_addon: false,
  max_preventistas: 3,
  primary_color: "#1E3A8A",
  secondary_color: "#0F172A",
  accent_color: "#F59E0B",
  whatsapp_pedidos: "",
  admin_name: "",
  admin_email: "",
  admin_password: "",
};

export default function SuperAdminDashboard() {
  const { user, logout, impersonateDistribuidora } = useAuth();
  const navigate = useNavigate();

  const [distribuidoras, setDistribuidoras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const fetchDistribuidoras = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/superadmin/distribuidoras");
      setDistribuidoras(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    impersonateDistribuidora(null);
    fetchDistribuidoras();
  }, []);

  const handleNameChange = (value) => {
    const generatedSlug = value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    setForm((prev) => ({
      ...prev,
      nombre_fantasia: value,
      slug: generatedSlug,
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback("");

    try {
      await api.post("/superadmin/distribuidoras", {
        ...form,
        has_web_portal: form.plan_type === "FULL" ? true : form.has_web_portal,
      });
      setShowModal(false);
      setForm(INITIAL_FORM);
      fetchDistribuidoras();
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      if (Array.isArray(apiErrors)) {
        setFeedback(
          apiErrors.map((x) => `${x.field}: ${x.message}`).join(" | "),
        );
      } else {
        setFeedback(
          err.response?.data?.message || "Error al crear distribuidora",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (dist) => {
    try {
      await api.patch(`/superadmin/distribuidoras/${dist.id}`, {
        is_active: !dist.is_active,
      });
      fetchDistribuidoras();
    } catch (err) {
      alert(err.response?.data?.message || "No se pudo cambiar el estado");
    }
  };

  const toggleWebPortal = async (dist) => {
    try {
      const nextPortal = !dist.has_web_portal;
      await api.patch(`/superadmin/distribuidoras/${dist.id}`, {
        has_web_portal: nextPortal,
        plan_type: nextPortal ? "FULL" : "CORE",
      });
      fetchDistribuidoras();
    } catch (err) {
      alert(err.response?.data?.message || "Error al cambiar plan");
    }
  };

  const handleEntrarASoporte = (distId) => {
    impersonateDistribuidora(distId);
    navigate("/app/catalogo");
  };

  const totalPreventistas = distribuidoras.reduce(
    (acc, d) => acc + Number(d.preventistas_activos || 0),
    0,
  );
  const totalPedidos = distribuidoras.reduce(
    (acc, d) => acc + Number(d.total_pedidos || 0),
    0,
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Topbar */}
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-amber-400" />
          <div>
            <h1 className="font-bold text-lg leading-tight">
              Consola SuperAdmin SaaS
            </h1>
            <p className="text-xs text-slate-400">Operador: {user?.fullName}</p>
          </div>
        </div>

        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm transition cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Salir
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* KPIs Globales */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-700">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Distribuidoras Activas</p>
              <p className="text-2xl font-bold text-slate-900">
                {distribuidoras.filter((d) => d.is_active).length} /{" "}
                {distribuidoras.length}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Preventistas en Calle</p>
              <p className="text-2xl font-bold text-slate-900">
                {totalPreventistas}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-50 text-amber-700">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Pedidos Procesados</p>
              <p className="text-2xl font-bold text-slate-900">
                {totalPedidos}
              </p>
            </div>
          </div>
        </div>

        {/* Barra de acción */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-800">
            Tenants / Distribuidoras
          </h2>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-semibold shadow-sm transition cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            Nueva Distribuidora
          </button>
        </div>

        {/* Tabla de Distribuidoras */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-3.5 px-4">Distribuidora</th>
                  <th className="py-3.5 px-4">Plan / Canal Web</th>
                  <th className="py-3.5 px-4">Preventistas</th>
                  <th className="py-3.5 px-4">Pedidos</th>
                  <th className="py-3.5 px-4">Estado Abono</th>
                  <th className="py-3.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-400">
                      Cargando distribuidoras...
                    </td>
                  </tr>
                ) : distribuidoras.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-400">
                      Aún no hay distribuidoras creadas. Hacé clic en "Nueva
                      Distribuidora".
                    </td>
                  </tr>
                ) : (
                  distribuidoras.map((dist) => (
                    <tr key={dist.id} className="hover:bg-slate-50/70">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-900">
                          {dist.nombre_fantasia}
                        </div>
                        <div className="text-xs text-slate-500">
                          CUIT: {dist.cuit} • slug:{" "}
                          <span className="font-mono">/t/{dist.slug}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <button
                          onClick={() => toggleWebPortal(dist)}
                          title="Clic para alternar Plan Core / Plan Full"
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                            dist.has_web_portal
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          <Globe className="w-3.5 h-3.5" />
                          {dist.has_web_portal
                            ? "PLAN FULL (Con Web)"
                            : "PLAN CORE (Interno)"}
                        </button>
                      </td>

                      <td className="py-4 px-4 text-slate-700">
                        {dist.preventistas_activos} / {dist.max_preventistas}{" "}
                        cupos
                      </td>

                      <td className="py-4 px-4 font-medium text-slate-800">
                        {dist.total_pedidos}
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            dist.is_active
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {dist.is_active ? "ACTIVA" : "SUSPENDIDA"}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleEntrarASoporte(dist.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 font-medium text-xs cursor-pointer"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          Gestionar
                        </button>

                        {Boolean(dist.has_web_portal) && (
                          <a
                            href={`/t/${dist.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Tienda
                          </a>
                        )}

                        <button
                          onClick={() => toggleStatus(dist)}
                          title={
                            dist.is_active
                              ? "Suspender cuenta"
                              : "Reactivar cuenta"
                          }
                          className={`inline-flex items-center p-1.5 rounded-lg cursor-pointer ${
                            dist.is_active
                              ? "text-red-600 hover:bg-red-50"
                              : "text-emerald-600 hover:bg-emerald-50"
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal Alta Rápida de Distribuidora */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                Alta Rápida de Distribuidora (Onboarding)
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {feedback && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">
                {feedback}
              </div>
            )}

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre Fantasía *
                  </label>
                  <input
                    required
                    value={form.nombre_fantasia}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Ej: Distribuidora El Litoral"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Slug URL (/t/slug) *
                  </label>
                  <input
                    required
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    placeholder="distribuidora-el-litoral"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Razón Social *
                  </label>
                  <input
                    required
                    value={form.razon_social}
                    onChange={(e) =>
                      setForm({ ...form, razon_social: e.target.value })
                    }
                    placeholder="El Litoral SRL"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    CUIT *
                  </label>
                  <input
                    required
                    value={form.cuit}
                    onChange={(e) => setForm({ ...form, cuit: e.target.value })}
                    placeholder="30-71234567-9"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Plan Contratado
                  </label>
                  <select
                    value={form.plan_type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        plan_type: e.target.value,
                        has_web_portal: e.target.value === "FULL",
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  >
                    <option value="CORE">
                      Plan Core (Solo Operación Interna)
                    </option>
                    <option value="FULL">
                      Plan Full (Operación + Portal Web Público)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cupo Preventistas Incluidos
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.max_preventistas}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        max_preventistas: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              {/* Modo Camaleón */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-bold uppercase text-slate-500 mb-2">
                  Identidad Visual (Modo Camaleón)
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      Color Primario
                    </label>
                    <input
                      type="color"
                      value={form.primary_color}
                      onChange={(e) =>
                        setForm({ ...form, primary_color: e.target.value })
                      }
                      className="w-full h-10 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      Color Secundario
                    </label>
                    <input
                      type="color"
                      value={form.secondary_color}
                      onChange={(e) =>
                        setForm({ ...form, secondary_color: e.target.value })
                      }
                      className="w-full h-10 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      Color Acento
                    </label>
                    <input
                      type="color"
                      value={form.accent_color}
                      onChange={(e) =>
                        setForm({ ...form, accent_color: e.target.value })
                      }
                      className="w-full h-10 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Usuario Administrador Inicial */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-bold uppercase text-slate-500 mb-2">
                  Usuario Administrador del Cliente
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    required
                    placeholder="Nombre del Dueño"
                    value={form.admin_name}
                    onChange={(e) =>
                      setForm({ ...form, admin_name: e.target.value })
                    }
                    className="px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email de acceso"
                    value={form.admin_email}
                    onChange={(e) =>
                      setForm({ ...form, admin_email: e.target.value })
                    }
                    className="px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                  <input
                    required
                    placeholder="Clave inicial (mín 6)"
                    value={form.admin_password}
                    onChange={(e) =>
                      setForm({ ...form, admin_password: e.target.value })
                    }
                    className="px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  {submitting ? "Creando..." : "Crear Distribuidora"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
