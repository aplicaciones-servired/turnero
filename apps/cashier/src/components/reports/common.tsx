import { useState } from "react";
import type { ReportExportType } from "@turnero/shared";
import { Button, errorMessage } from "../ui";
import { downloadReport } from "./api";
import type { ReportFilters } from "./utils";

export function ExportButton({
  report,
  filters,
  label = "Exportar CSV",
}: {
  report: ReportExportType;
  filters: ReportFilters;
  label?: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setExporting(true);
    setError(null);
    try {
      await downloadReport(report, filters);
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo exportar el reporte."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={onClick} disabled={exporting}>
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M10 2a1 1 0 0 1 1 1v7.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V3a1 1 0 0 1 1-1Zm-6 13a1 1 0 0 1 1 1v1h10v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
        </svg>
        {exporting ? "Generando..." : label}
      </Button>
      {error && <span className="text-xs font-medium text-red-600">{error}</span>}
    </div>
  );
}
