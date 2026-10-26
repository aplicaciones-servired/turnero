import { useQuery } from "@tanstack/react-query";
import type { ReportExportType } from "@turnero/shared";
import { api } from "../../api";
import { cleanParams, type ReportFilters } from "./utils";

export function useReport<T>(
  path: string,
  filters: ReportFilters,
  enabled = true
) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: ["reports", path, params],
    queryFn: async () => (await api.get<T>(`/reports/${path}`, { params })).data,
    enabled,
    staleTime: 30_000,
  });
}

export async function downloadReport(
  report: ReportExportType,
  filters: ReportFilters
): Promise<void> {
  const params = cleanParams({ report, ...filters });
  const response = await api.get<Blob>("/reports/export", {
    params,
    responseType: "blob",
  });
  const disposition = response.headers["content-disposition"] as string | undefined;
  const match = disposition?.match(/filename="?([^";]+)"?/);
  const filename = match?.[1] ?? `reporte-${report}.csv`;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
