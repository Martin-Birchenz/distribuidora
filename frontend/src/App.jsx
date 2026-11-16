import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./pages/auth/LoginPage";
import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard";
import InternalLayout from "./layouts/InternalLayout";
import PreventaPage from "./pages/internal/PreventaPage";
import CatalogoPage from "./pages/internal/CatalogoPage";
import PedidosDepositoPage from "./pages/internal/PedidosDepositoPage";
import CuentasCorrientesPage from "./pages/internal/CuentasCorrientesPage";
import PortalTiendaPage from "./pages/portal/PortalTiendaPage";

function ProtectedRoute({ allowedRoles, children }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Acceso Unificado */}
          <Route path="/login" element={<LoginPage />} />

          {/* Consola SuperAdmin */}
          <Route
            path="/superadmin"
            element={
              <ProtectedRoute allowedRoles={["SUPERADMIN"]}>
                <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Operación Interna Multi-Tenant (Preventa, Depósito, Admin) */}
          <Route
            path="/app"
            element={
              <ProtectedRoute
                allowedRoles={[
                  "SUPERADMIN",
                  "ADMIN",
                  "PREVENTISTA",
                  "DEPOSITO",
                ]}
              >
                <InternalLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/app/preventa" replace />} />
            <Route path="preventa" element={<PreventaPage />} />
            <Route path="catalogo" element={<CatalogoPage />} />
            <Route path="pedidos" element={<PedidosDepositoPage />} />
            <Route
              path="cuentas-corrientes"
              element={<CuentasCorrientesPage />}
            />
          </Route>

          {/* Portal Web Público Opcional (Plan Full) */}
          <Route path="/t/:slug" element={<PortalTiendaPage />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
