import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

// Layouts
import InternalLayout from "./layouts/InternalLayout";
import PublicB2BLayout from "./layouts/PublicB2BLayout";

// Páginas Públicas B2B (Portal Mayorista /t/:slug)
import PublicB2BCatalog from "./pages/public/PublicB2BCatalog";

// Páginas Internas & SuperAdmin
import Login from "./pages/internal/Login";
import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard";
import PreventaPage from "./pages/internal/PreventaPage";
import PedidosDepositoPage from "./pages/internal/PedidosDepositoPage";
import HojaRutaPage from "./pages/internal/HojaRutaPage";
import CatalogoPage from "./pages/internal/CatalogoPage";
import CuentasCorrientesPage from "./pages/internal/CuentasCorrientesPage";
import DashboardPage from "./pages/internal/DashboardPage";

function RequireSuperAdmin({ children }) {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "SUPERADMIN") return <Navigate to="/app" replace />;
  return children;
}

function RequireStaff({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Portal Público B2B Multi-Tenant (Modo Camaleón) */}
          <Route path="/t/:slug" element={<PublicB2BLayout />}>
            <Route index element={<PublicB2BCatalog />} />
          </Route>

          {/* Login Unificado */}
          <Route path="/login" element={<Login />} />

          {/* Consola Comercial SuperAdmin */}
          <Route
            path="/superadmin"
            element={
              <RequireSuperAdmin>
                <SuperAdminDashboard />
              </RequireSuperAdmin>
            }
          />

          {/* Panel Operativo de la Distribuidora */}
          <Route
            path="/app"
            element={
              <RequireStaff>
                <InternalLayout />
              </RequireStaff>
            }
          >
            <Route index element={<Navigate to="preventa" replace />} />
            <Route path="preventa" element={<PreventaPage />} />
            <Route path="pedidos" element={<PedidosDepositoPage />} />
            <Route path="hoja-ruta" element={<HojaRutaPage />} />
            <Route path="catalogo" element={<CatalogoPage />} />
            <Route
              path="cuentas-corrientes"
              element={<CuentasCorrientesPage />}
            />
            <Route index element={<DashboardPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
