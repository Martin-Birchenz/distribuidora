import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  Package,
  ClipboardList,
  Wallet,
  LogOut,
  ArrowLeft,
  Truck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { TenantProvider, useTenant } from "../context/TenantContext";

function InternalShell() {
  const { user, logout, impersonateDistribuidora } = useAuth();
  const { tenant, loading, error } = useTenant();
  const navigate = useNavigate();

  const isSuperAdminSupport = user?.role === "SUPERADMIN";

  const navItems = [
    {
      to: "/app/preventa",
      label: "Toma Pedido",
      icon: ShoppingCart,
      roles: ["SUPERADMIN", "ADMIN", "PREVENTISTA"],
    },
    {
      to: "/app/pedidos",
      label: "Pedidos / Carga",
      icon: ClipboardList,
      roles: ["SUPERADMIN", "ADMIN", "DEPOSITO", "PREVENTISTA"],
    },
    {
      to: "/app/catalogo",
      label: "Catálogo / Stock",
      icon: Package,
      roles: ["SUPERADMIN", "ADMIN", "DEPOSITO", "PREVENTISTA"],
    },
    {
      to: "/app/cuentas-corrientes",
      label: "Ctas. Ctes.",
      icon: Wallet,
      roles: ["SUPERADMIN", "ADMIN", "PREVENTISTA"],
    },
  ].filter((item) => item.roles.includes(user?.role));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 font-medium">
        Cargando identidad de la distribuidora...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <p className="text-red-600 font-semibold mb-4">{error}</p>
        <button
          onClick={() =>
            navigate(isSuperAdminSupport ? "/superadmin" : "/login")
          }
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm cursor-pointer"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Banner Soporte SuperAdmin */}
      {isSuperAdminSupport && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-bold flex items-center justify-between shadow">
          <span>MODO SOPORTE SUPERADMIN: {tenant?.nombre_fantasia}</span>
          <button
            onClick={() => {
              impersonateDistribuidora(null);
              navigate("/superadmin");
            }}
            className="inline-flex items-center gap-1 underline cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a SuperAdmin
          </button>
        </div>
      )}

      {/* Sidebar Escritorio */}
      <aside
        className={`hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-brand-secondary text-white ${
          isSuperAdminSupport ? "pt-7" : ""
        }`}
      >
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          {tenant?.logo_url ? (
            <img
              src={tenant.logo_url}
              alt={tenant.nombre_fantasia}
              className="w-10 h-10 rounded-xl object-cover bg-white"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-brand-primary flex items-center justify-center font-bold">
              <Truck className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-bold text-sm truncate">
              {tenant?.nombre_fantasia}
            </h2>
            <p className="text-xs text-slate-300 truncate">{user?.fullName}</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-primary text-white shadow-sm"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm text-white transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Topbar Mobile */}
      <header
        className={`md:hidden sticky z-30 bg-brand-secondary text-white px-4 py-3 flex items-center justify-between shadow ${
          isSuperAdminSupport ? "top-7" : "top-0"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Truck className="w-5 h-5 text-brand-accent shrink-0" />
          <span className="font-bold text-sm truncate">
            {tenant?.nombre_fantasia}
          </span>
        </div>
        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="p-1.5 rounded-lg bg-white/10 text-white cursor-pointer"
          title="Salir"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Contenido Principal */}
      <main className={`flex-1 md:pl-64 ${isSuperAdminSupport ? "pt-7" : ""}`}>
        <div className="max-w-7xl mx-auto p-4 md:p-6">
          <Outlet />
        </div>
      </main>

      {/* Bottom Nav Mobile-First para Preventistas */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 grid grid-cols-4 py-1.5 shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1 text-[11px] font-semibold ${
                  isActive ? "text-brand-primary" : "text-slate-500"
                }`
              }
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

export default function InternalLayout() {
  return (
    <TenantProvider mode="internal">
      <InternalShell />
    </TenantProvider>
  );
}
