import React from "react";
import { ComplianceReportStatus } from "@/types/report";
import { CheckCircle2, Clock, AlertTriangle, Loader2 } from "lucide-react";

interface ReportStatusBadgeProps {
  status: ComplianceReportStatus | string;
  className?: string;
}

export const ReportStatusBadge: React.FC<ReportStatusBadgeProps> = ({
  status,
  className = "",
}) => {
  const normalizedStatus = (status || "").toUpperCase();

  switch (normalizedStatus) {
    case "COMPLETED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/60 ${className}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Completed
        </span>
      );
    case "PROCESSING":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800/60 ${className}`}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Processing
        </span>
      );
    case "FAILED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800/60 ${className}`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Failed
        </span>
      );
    case "PENDING":
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 ${className}`}
        >
          <Clock className="h-3.5 w-3.5" />
          {normalizedStatus || "Pending"}
        </span>
      );
  }
};

export default ReportStatusBadge;
