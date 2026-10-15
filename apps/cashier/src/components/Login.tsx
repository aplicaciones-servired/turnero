import { FormEvent, useState } from "react";
import { useAuth } from "../auth";

export function Login() {
  const login = useAuth((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      const status = e.response?.status;
      if (status === 429) setError("Demasiados intentos. Espera 1 minuto e intenta de nuevo.");
      else if (status === 401) setError("Usuario o contrasena incorrectos.");
      else if (status) setError(`Error ${status}: ${e.response?.data?.message ?? ""}`);
      else setError("No se pudo conectar con el API (revisa que este en http://localhost:3001).");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-slate-900 p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl"
      >
        <h1 className="text-center text-2xl font-bold text-slate-800">Turnero</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Acceso a caja</p>

        <label className="mt-6 block text-sm font-medium text-slate-600">Usuario</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
        />

        <label className="mt-4 block text-sm font-medium text-slate-600">Contrasena</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
        />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
