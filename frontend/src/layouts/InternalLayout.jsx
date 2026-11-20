import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ShoppingBag,
  ClipboardList,
  Truck,
  Package,
  Wallet,
  ExternalLink,
  LogOut,
  Menu,
  X,
  ArrowLeftRight,
  LayoutDashboard,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function InternalLayout() {
  const { user, logout, exitSupportMode } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { to: "/app", label: "Tablero", icon: LayoutDashboard },
    { to: "/app/preventa", label: "Toma Pedido", icon: ShoppingBag },
    { to: "/app/pedidos", label: "Pedidos y Carga", icon: ClipboardList },
    { to: "/app/hoja-ruta", label: "Hoja de Ruta", icon: Truck },
    { to: "/app/catalogo", label: "Catálogo / Stock", icon: Package },
    {
      to: "/app/cuentas-corrientes",
      label: "Cuentas Corrientes",
      icon: Wallet,
    },
  ];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleVolverSuperAdmin = () => {
    if (exitSupportMode) exitSupportMode();
    navigate("/superadmin");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-950 text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Gestión Mayorista
            </p>
            <h2 className="font-extrabold text-white truncate text-sm">
              {user?.distribuidoraNombre || "Distribuidora"}
            </h2>
            {user?.distribuidoraSlug && (
              <a
                href={`/t/${user.distribuidoraSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-300 hover:text-white"
              >
                Ver Portal B2B <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="md:hidden p-2 rounded-lg bg-slate-900 text-slate-200"
            aria-label="Abrir menú"
          >
            {menuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>

        <div
          className={`${menuOpen ? "flex" : "hidden"} md:flex flex-col flex-1 p-3 justify-between`}
        >
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                      isActive
                        ? "bg-amber-500 text-slate-950 font-bold"
                        : "text-slate-300 hover:bg-slate-900 hover:text-white"
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="pt-4 mt-4 border-t border-slate-800 space-y-2">
            {user?.isSupportMode && (
              <button
                onClick={handleVolverSuperAdmin}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> Volver a SuperAdmin
              </button>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-rose-950 text-rose-400 text-xs font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
