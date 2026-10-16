import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api, API_URL, CAJA_KEY } from "../api";

export function Login() {
  const login = useAuth((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [caja, setCaja] = useState(() => localStorage.getItem(CAJA_KEY) ?? "");
  const [modulos, setModulos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get<string[]>("/modulos")
      .then((res) => setModulos(res.data))
      .catch(() => setModulos([]));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password, caja.trim() || undefined);
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      const status = e.response?.status;
      if (status === 429) setError("Demasiados intentos. Espera 1 minuto e intenta de nuevo.");
      else if (status === 401) setError("Usuario o contrasena incorrectos.");
      else if (status) setError(`Error ${status}: ${e.response?.data?.message ?? ""}`);
      else setError(`No se pudo conectar con el API (${API_URL}).`);
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

        <label className="mt-6 block text-sm font-medium text-slate-600">Cédula</label>
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

        <label className="mt-4 block text-sm font-medium text-slate-600">Caja / Módulo</label>
        <input
          value={caja}
          onChange={(e) => setCaja(e.target.value)}
          list="modulos-lista"
          placeholder="Ej: 3"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
        />
        <datalist id="modulos-lista">
          {modulos.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <p className="mt-1 text-xs text-slate-400">
          Es el número que se anunciará en la pantalla al llamar al cliente.
        </p>

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
