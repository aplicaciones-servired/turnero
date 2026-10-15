import { useQuery } from "@tanstack/react-query";
import type { UserDTO } from "@turnero/shared";
import { api } from "../api";

export function AdminUsers() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<UserDTO[]>("/users")).data,
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Usuarios</h2>
        <p className="text-sm text-slate-500">
          Usuarios de MagisoftV1. Los administradores ven todo; los asesores solo el panel
          de llamados.
        </p>
      </div>

      {isLoading && <p className="mt-4 text-sm text-slate-500">Cargando usuarios...</p>}
      {error && (
        <p className="mt-3 text-sm text-red-600">No se pudieron cargar los usuarios.</p>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-700">{u.username}</td>
                <td className="px-4 py-3 text-slate-600">{u.displayName}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      u.role === "admin"
                        ? "rounded bg-blue-100 px-2 py-0.5 text-blue-700"
                        : "rounded bg-slate-100 px-2 py-0.5 text-slate-600"
                    }
                  >
                    {u.role === "admin" ? "Administrador" : "Asesor"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.active ? (
                    <span className="text-emerald-600">Activo</span>
                  ) : (
                    <span className="text-slate-400">Inactivo</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
