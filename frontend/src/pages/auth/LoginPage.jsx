import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, PackageCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../config/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      const { token, user } = data.data;
      login(token, user);

      if (user.role === "SUPERADMIN") {
        navigate("/superadmin");
      } else {
        navigate("/app");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Credenciales inválidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-800">
        <div className="bg-slate-900 px-6 py-7 text-center border-b border-slate-800">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center mb-3 shadow-md">
            <PackageCheck className="w-6 h-6" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
            Plataforma B2B Multi-Tenant
          </p>
          <h1 className="text-xl font-extrabold text-white mt-1">
            Gestión de Distribuidoras
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Ingresá con tu cuenta de administración, preventa o depósito
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@distribuidora.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm cursor-pointer transition disabled:opacity-50 shadow-sm"
          >
            {loading ? "Ingresando..." : "Iniciar Sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
