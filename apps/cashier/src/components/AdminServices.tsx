import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ServiceDTO, ServiceTreeDTO } from "@turnero/shared";
import { api } from "../api";
import { Alert, Badge, Button, Card, Field, Modal, PageHeader, Toggle, errorMessage } from "./ui";

type FormState = {
  name: string;
  prefix: string;
  color: string;
  order: number;
  active: boolean;
  parentId: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  prefix: "",
  color: "#2563eb",
  order: 0,
  active: true,
  parentId: "",
};

function PrefixBadge({ service }: { service: ServiceDTO }) {
  return (
    <span
      className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-sm font-bold text-white shadow-sm"
      style={{ backgroundColor: service.color }}
    >
      {service.prefix}
    </span>
  );
}

export function AdminServices() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["services-all"],
    queryFn: async () => (await api.get<ServiceTreeDTO[]>("/services?active=false")).data,
  });

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ServiceDTO | null>(null);
  const [toDelete, setToDelete] = useState<ServiceDTO | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["services-all"] });

  const saveMutation = useMutation({
    mutationFn: async (values: FormState) => {
      const body: Record<string, unknown> = {
        name: values.name.trim(),
        prefix: values.prefix.trim().toUpperCase(),
        color: values.color,
        order: Number(values.order) || 0,
        active: values.active,
      };
      if (editing) return api.patch(`/services/${editing.id}`, body);
      if (values.parentId) body.parentId = Number(values.parentId);
      return api.post("/services", body);
    },
    onSuccess: async () => {
      await invalidate();
      setNotice({ tone: "success", text: editing ? "Servicio actualizado." : "Servicio creado." });
      closeForm();
    },
    onError: (e) =>
      setFormError(errorMessage(e, "No se pudo guardar el servicio. Revisa los datos.")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/services/${id}`),
    onSuccess: async () => {
      await invalidate();
      setNotice({ tone: "success", text: "Servicio eliminado." });
      setToDelete(null);
    },
    onError: (e) => {
      setNotice({ tone: "error", text: errorMessage(e, "No se pudo eliminar el servicio.") });
      setToDelete(null);
    },
  });

  const parents = data ?? [];

  const tree = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parents;
    const match = (s: ServiceDTO) =>
      s.name.toLowerCase().includes(q) || s.prefix.toLowerCase().includes(q);
    return parents
      .map((p) => {
        if (match(p)) return p;
        const children = p.children.filter(match);
        return children.length ? { ...p, children } : null;
      })
      .filter((p): p is ServiceTreeDTO => p !== null);
  }, [parents, search]);

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

  const openEdit = (s: ServiceDTO, parentId = "") => {
    setForm({
      name: s.name,
      prefix: s.prefix,
      color: s.color,
      order: s.order,
      active: s.active,
      parentId,
    });
    setFormError(null);
    setEditing(s);
    setCreating(false);
  };

  const submit = () => {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    if (!form.prefix.trim()) {
      setFormError("El prefijo es obligatorio.");
      return;
    }
    saveMutation.mutate(form);
  };

  const open = creating || editing !== null;
  const total = parents.reduce((acc, p) => acc + p.children.length, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <PageHeader
        title="Servicios"
        subtitle="Se leen y guardan en vivo en la base MagisoftV1 (tablas servicio y relacionservicios). El prefijo aparece en el turno (ej. A-001)."
        actions={
          <Button onClick={openCreate}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 3a.75.75 0 0 1 .75.75v5.5h5.5a.75.75 0 0 1 0 1.5h-5.5v5.5a.75.75 0 0 1-1.5 0v-5.5h-5.5a.75.75 0 0 1 0-1.5h5.5v-5.5A.75.75 0 0 1 10 3Z" />
            </svg>
            Nuevo servicio
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
            placeholder="Buscar por nombre o prefijo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-sm text-slate-500">
          {parents.length} categorias · {total} subservicios
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Cargando servicios...</p>}
      {error && <Alert tone="error">No se pudieron cargar los servicios.</Alert>}

      <Card>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Prefijo</th>
              <th className="px-5 py-3 font-semibold">Nombre</th>
              <th className="px-5 py-3 font-semibold">Prioridad</th>
              <th className="px-5 py-3 font-semibold">Estado</th>
              <th className="px-5 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tree.map((parent) => (
              <Fragment key={parent.id}>
                <tr className="bg-slate-50/70">
                  <td className="px-5 py-3">
                    <PrefixBadge service={parent} />
                  </td>
                  <td className="px-5 py-3 font-semibold text-slate-800">{parent.name}</td>
                  <td className="px-5 py-3 text-slate-500">{parent.order}</td>
                  <td className="px-5 py-3">
                    {parent.active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Inactivo</Badge>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => openEdit(parent)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setNotice(null);
                          setToDelete(parent);
                        }}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
                {parent.children.map((child) => (
                  <tr key={`${parent.id}-${child.id}`} className="hover:bg-slate-50/70">
                    <td className="py-3 pl-12 pr-5">
                      <PrefixBadge service={child} />
                    </td>
                    <td className="px-5 py-3 text-slate-700">{child.name}</td>
                    <td className="px-5 py-3 text-slate-500">{child.order}</td>
                    <td className="px-5 py-3">
                      {child.active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Inactivo</Badge>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => openEdit(child, parent.id)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => {
                            setNotice(null);
                            setToDelete(child);
                          }}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {!isLoading && tree.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                  {search ? "Sin resultados para la busqueda." : "No hay servicios."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={open}
        title={editing ? "Editar servicio" : "Nuevo servicio"}
        subtitle={
          editing
            ? `Modificando "${editing.name}"`
            : "El servicio se agrega al catalogo del kiosco"
        }
        onClose={closeForm}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : editing ? "Guardar cambios" : "Crear servicio"}
            </Button>
          </>
        }
      >
        {formError && <Alert tone="error">{formError}</Alert>}

        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Nombre">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label="Prefijo" hint="Ej. A, SOA">
            <input
              className="input uppercase"
              maxLength={10}
              value={form.prefix}
              onChange={(e) => setForm({ ...form, prefix: e.target.value })}
            />
          </Field>
        </div>

        {!editing && (
          <Field
            label="Servicio padre (opcional)"
            hint="Dejalo vacio para crear un servicio independiente."
          >
            <select
              className="input"
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
            >
              <option value="">(Servicio independiente)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prioridad" hint="Menor numero se muestra primero.">
            <input
              className="input"
              type="number"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
            />
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-14 cursor-pointer rounded border border-slate-300"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
              <input
                className="input"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
          </Field>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <Toggle
            label="Servicio activo (visible en el kiosco)"
            checked={form.active}
            onChange={(v) => setForm({ ...form, active: v })}
          />
        </div>
      </Modal>

      <Modal
        open={toDelete !== null}
        title="Eliminar servicio"
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
          ¿Seguro que deseas eliminar{" "}
          <strong className="text-slate-800">
            {toDelete?.name} ({toDelete?.prefix})
          </strong>
          ? Dejara de aparecer en el kiosco y en la pantalla.
        </p>
      </Modal>
    </div>
  );
}
