import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ServiceDTO, ServiceTreeDTO } from "@turnero/shared";
import { api } from "../api";

function PrefixBadge({ service }: { service: ServiceDTO }) {
  return (
    <span
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-bold text-white"
      style={{ backgroundColor: service.color }}
    >
      {service.prefix}
    </span>
  );
}

export function AdminServices() {
  const { data, isLoading } = useQuery({
    queryKey: ["services-all"],
    queryFn: async () => (await api.get<ServiceTreeDTO[]>("/services")).data,
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Servicios</h2>
        <p className="text-sm text-slate-500">
          Se leen en vivo desde la base MagisoftV1 (tablas servicio y relacionservicios). Para
          modificarlos, use el sistema administrativo de MagisoftV1.
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Prefijo</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Prioridad</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Cargando...
                </td>
              </tr>
            )}
            {data?.map((parent) => (
              <Fragment key={parent.id}>
                <tr className="border-t border-slate-100 bg-slate-50/60">
                  <td className="px-4 py-3">
                    <PrefixBadge service={parent} />
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{parent.name}</td>
                  <td className="px-4 py-3 text-slate-500">{parent.order}</td>
                  <td className="px-4 py-3">
                    {parent.active ? (
                      <span className="text-emerald-600">Activo</span>
                    ) : (
                      <span className="text-slate-400">Inactivo</span>
                    )}
                  </td>
                </tr>
                {parent.children.map((child) => (
                  <tr key={child.id} className="border-t border-slate-100">
                    <td className="py-3 pl-10 pr-4">
                      <PrefixBadge service={child} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{child.name}</td>
                    <td className="px-4 py-3 text-slate-500">{child.order}</td>
                    <td className="px-4 py-3">
                      {child.active ? (
                        <span className="text-emerald-600">Activo</span>
                      ) : (
                        <span className="text-slate-400">Inactivo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
