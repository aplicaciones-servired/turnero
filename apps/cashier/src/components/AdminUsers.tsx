import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserDTO, UserRole } from "@turnero/shared";
import { api } from "../api";
import { useAuth } from "../auth";
import { Alert, Badge, Button, Card, Field, Modal, PageHeader, Toggle, errorMessage } from "./ui";

type Role = UserRole;

type FormState = {
  username: string;
  displayName: string;
  email: string;
  password: string;
  role: Role;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  username: "",
  displayName: "",
  email: "",
  password: "",
  role: "cashier",
  active: true,
};

export function AdminUsers() {
  const queryClient = useQueryClient();
  const { user: current } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<UserDTO[]>("/users")).data,
  });

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UserDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<UserDTO | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["users"] });

  const saveMutation = useMutation({
    mutationFn: async (values: FormState) => {
      if (editing) {
        const body: Record<string, unknown> = {
          username: values.username.trim(),
          displayName: values.displayName.trim(),
          email: values.email.trim(),
          role: values.role,
          active: values.active,
        };
        if (values.password) body.password = values.password;
        return api.patch(`/users/${editing.id}`, body);
      }
      return api.post("/users", {
        username: values.username.trim(),
        displayName: values.displayName.trim(),
        email: values.email.trim(),
        password: values.password,
        role: values.role,
        active: values.active,
      });
    },
    onSuccess: async () => {
      await invalidate();
      setNotice({ tone: "success", text: editing ? "Usuario actualizado." : "Usuario creado." });
      closeForm();
    },
    onError: (e) =>
      setFormError(errorMessage(e, "No se pudo guardar el usuario. Revisa los datos.")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: async () => {
      await invalidate();
      setNotice({ tone: "success", text: "Usuario eliminado." });
      setToDelete(null);
    },
    onError: (e) => {
      setNotice({ tone: "error", text: errorMessage(e, "No se pudo eliminar el usuario.") });
      setToDelete(null);
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (u) =>
        u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)
    );
  }, [data, search]);

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (u: UserDTO) => {
    setForm({
      username: u.username,
      displayName: u.displayName,
      email: "",
      password: "",
      role: u.role,
      active: u.active,
    });
    setFormError(null);
    setEditing(u);
    setCreating(false);
  };

  const submit = () => {
    setFormError(null);
    if (!form.username.trim()) {
      setFormError("El usuario (cedula) es obligatorio.");
      return;
    }
    if (!form.displayName.trim()) {
      setFormError("El nombre completo es obligatorio.");
      return;
    }
    if (!editing && !form.password) {
      setFormError("La contraseña es obligatoria para un usuario nuevo.");
      return;
    }
    saveMutation.mutate(form);
  };

  const open = creating || editing !== null;
  const adminCount = (data ?? []).filter((u) => u.role === "admin" && u.active).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <PageHeader
        title="Usuarios"
        subtitle="Crea, edita o desactiva los usuarios del turnero (base MagisoftV1). Los administradores ven todo el panel; los asesores solo el modulo de llamados."
        actions={
          <Button onClick={openCreate}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 3a.75.75 0 0 1 .75.75v5.5h5.5a.75.75 0 0 1 0 1.5h-5.5v5.5a.75.75 0 0 1-1.5 0v-5.5h-5.5a.75.75 0 0 1 0-1.5h5.5v-5.5A.75.75 0 0 1 10 3Z" />
            </svg>
            Nuevo usuario
          </Button>
        }
      />

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.4 9.82l3.14 3.14a.75.75 0 1 0 1.06-1.06l-3.14-3.14A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            className="input pl-9"
            placeholder="Buscar por usuario o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-sm text-slate-500">
          {data?.length ?? 0} usuarios · {adminCount} administradores activos
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Cargando usuarios...</p>}
      {error && <Alert tone="error">No se pudieron cargar los usuarios.</Alert>}

      <Card>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Usuario</th>
              <th className="px-5 py-3 font-semibold">Nombre</th>
              <th className="px-5 py-3 font-semibold">Rol</th>
              <th className="px-5 py-3 font-semibold">Estado</th>
              <th className="px-5 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/70">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                      {(u.displayName || u.username).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-medium text-slate-800">{u.username}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-600">{u.displayName}</td>
                <td className="px-5 py-3">
                  <Badge tone={u.role === "admin" ? "blue" : "slate"}>
                    {u.role === "admin" ? "Administrador" : "Asesor"}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  {u.active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Inactivo</Badge>}
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => openEdit(u)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50"
                      disabled={u.id === current?.id}
                      onClick={() => {
                        setNotice(null);
                        setToDelete(u);
                      }}
                    >
                      Eliminar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                  {search ? "Sin resultados para la busqueda." : "No hay usuarios."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={open}
        title={editing ? "Editar usuario" : "Nuevo usuario"}
        subtitle={editing ? `Modificando a ${editing.displayName}` : "Crea un acceso al turnero"}
        onClose={closeForm}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : editing ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </>
        }
      >
        {formError && <Alert tone="error">{formError}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Usuario (cedula)" hint="Se usa para iniciar sesion.">
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label="Nombre completo">
            <input
              className="input"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </Field>
          <Field label={editing ? "Contraseña (opcional)" : "Contraseña"}>
            <input
              className="input"
              type="password"
              placeholder={editing ? "Dejar en blanco para no cambiar" : "••••••"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Field label="Correo (opcional)">
            <input
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <span className="mb-2 block text-sm font-medium text-slate-600">Rol</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <RoleOption
              title="Administrador"
              description="Ve todos los modulos y la configuracion."
              selected={form.role === "admin"}
              onClick={() => setForm({ ...form, role: "admin" })}
            />
            <RoleOption
              title="Asesor / Cajera"
              description="Solo el panel de llamados."
              selected={form.role === "cashier"}
              onClick={() => setForm({ ...form, role: "cashier" })}
            />
          </div>
          <div className="mt-3">
            <Toggle
              label="Usuario activo"
              checked={form.active}
              onChange={(v) => setForm({ ...form, active: v })}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={toDelete !== null}
        title="Eliminar usuario"
        onClose={() => setToDelete(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          ¿Seguro que deseas eliminar a{" "}
          <strong className="text-slate-800">{toDelete?.displayName}</strong>? El usuario quedara
          inactivo y no podra iniciar sesion.
        </p>
      </Modal>
    </div>
  );
}

function RoleOption({
  title,
  description,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition ${
        selected
          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className="block text-sm font-semibold text-slate-800">{title}</span>
      <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
    </button>
  );
}
