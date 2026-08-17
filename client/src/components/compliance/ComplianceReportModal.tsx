"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  FileText,
  Download,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  RefreshCw,
  Layers,
  Calendar,
  Filter,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  ExternalLink,
  Info,
  Clock,
  Building2,
  FileCheck2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  findingsService,
  ComplianceManagementReportResponse,
  ComplianceManagementReportParams,
} from "@/services/api/findings";
import { documentsService, OrgDocumentItem } from "@/services/api/documents";
import { regulationsApi, GlobalRegulation } from "@/services/api/regulations";
import { useAuth } from "@/context/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ComplianceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId?: string;
  organizationName?: string;
  initialDateRange?: string;
}

export const ComplianceReportModal: React.FC<ComplianceReportModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  organizationName,
  initialDateRange = "30d",
}) => {
  const router = useRouter();
  const { user } = useAuth();

  // Filter State
  const [dateRange, setDateRange] = useState<string>(initialDateRange);
  const [customFromDate, setCustomFromDate] = useState<string>("");
  const [customToDate, setCustomToDate] = useState<string>("");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("ALL");
  const [selectedRegId, setSelectedRegId] = useState<string>("ALL");

  // Options State
  const [policyOptions, setPolicyOptions] = useState<OrgDocumentItem[]>([]);
  const [regOptions, setRegOptions] = useState<GlobalRegulation[]>([]);

  // Report Data State
  const [reportData, setReportData] = useState<ComplianceManagementReportResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load Policies and Regulations for filter dropdowns
  useEffect(() => {
    if (!isOpen) return;

    const loadFiltersData = async () => {
      try {
        const [docsRes, regsRes] = await Promise.allSettled([
          organizationId ? documentsService.listDocuments(organizationId) : Promise.resolve([]),
          regulationsApi.listRegulations(organizationId),
        ]);

        if (docsRes.status === "fulfilled") {
          setPolicyOptions(docsRes.value || []);
        }
        if (regsRes.status === "fulfilled") {
          setRegOptions(regsRes.value || []);
        }
      } catch (err) {
        console.error("Failed loading filter choices:", err);
      }
    };

    loadFiltersData();
  }, [isOpen, organizationId]);

  // Construct current params
  const buildReportParams = useCallback((): ComplianceManagementReportParams => {
    const params: ComplianceManagementReportParams = {
      organization_id: organizationId,
      date_range: dateRange,
    };
    if (dateRange === "custom") {
      if (customFromDate) params.from_date = new Date(customFromDate).toISOString();
      if (customToDate) params.to_date = new Date(customToDate).toISOString();
    }
    if (selectedSeverity !== "ALL") params.severity = selectedSeverity;
    if (selectedStatus !== "ALL") params.lifecycle_status = selectedStatus;
    if (selectedPolicyId !== "ALL") params.policy_document_id = selectedPolicyId;
    if (selectedRegId !== "ALL") params.regulation_id = selectedRegId;
    return params;
  }, [organizationId, dateRange, customFromDate, customToDate, selectedSeverity, selectedStatus, selectedPolicyId, selectedRegId]);

  // Fetch Report Preview Summary
  const fetchReportPreview = useCallback(async () => {
    if (!isOpen) return;
    setIsLoadingPreview(true);
    setError(null);

    try {
      const params = buildReportParams();
      const data = await findingsService.getComplianceReportSummary(params);
      setReportData(data);
    } catch (err: any) {
      console.error("Failed fetching report preview:", err);
      const detail = err?.response?.data?.detail || "Unable to generate compliance report preview.";
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setIsLoadingPreview(false);
    }
  }, [isOpen, buildReportParams]);

  useEffect(() => {
    if (isOpen) {
      fetchReportPreview();
    }
  }, [isOpen, fetchReportPreview]);

  // Handle PDF Download
  const handleDownloadPdf = async () => {
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);

    try {
      const params = buildReportParams();
      const blob = await findingsService.downloadComplianceReportPdf(params);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const orgSlug = (organizationName || "compliance").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const dateStamp = format(new Date(), "yyyyMMdd_HHmmss");
      a.download = `compliance_report_${orgSlug}_${dateStamp}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Compliance Report PDF downloaded successfully.");
    } catch (err: any) {
      console.error("Failed downloading PDF report:", err);
      toast.error(err?.response?.data?.detail || "Unable to generate compliance report PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Traceability navigation handler
  const handleNavigateToFindings = (filterParams: Record<string, string>) => {
    onClose();
    const query = new URLSearchParams(filterParams).toString();
    router.push(`/compliance/findings?${query}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Generate Compliance Report & Management Summary
                <Badge variant="outline" className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-300">
                  Sprint 7.14
                </Badge>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Deterministic executive summary of findings, policies, regulations, remediations, and audit history.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Filter Configuration Toolbar */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-blue-500" />
                Report Scope & Filters
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchReportPreview}
                disabled={isLoadingPreview}
                className="h-7 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
              >
                <RefreshCw className={cn("h-3 w-3 mr-1", isLoadingPreview && "animate-spin")} />
                Update Preview
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              
              {/* Date Range */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Reporting Period
                </label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="w-full text-xs h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="this_year">Year to Date</option>
                  <option value="all">All Time</option>
                  <option value="custom">Custom Date Range</option>
                </select>
              </div>

              {/* Severity */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Severity Scope
                </label>
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="w-full text-xs h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical Severity</option>
                  <option value="HIGH">High Severity</option>
                  <option value="MEDIUM">Medium Severity</option>
                  <option value="LOW">Low Severity</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Finding Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full text-xs h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_REVIEW">Under Review</option>
                  <option value="REMEDIATION">Remediation</option>
                  <option value="REASSESSMENT_REQUIRED">Needs Reassessment</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="REOPENED">Reopened</option>
                </select>
              </div>

              {/* Policy Document */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Policy Document
                </label>
                <select
                  value={selectedPolicyId}
                  onChange={(e) => setSelectedPolicyId(e.target.value)}
                  className="w-full text-xs h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500 truncate"
                >
                  <option value="ALL">All Policies</option>
                  {policyOptions.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.original_filename}
                    </option>
                  ))}
                </select>
              </div>

              {/* Regulation Framework */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Regulation / Act
                </label>
                <select
                  value={selectedRegId}
                  onChange={(e) => setSelectedRegId(e.target.value)}
                  className="w-full text-xs h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500 truncate"
                >
                  <option value="ALL">All Regulations</option>
                  {regOptions.map((reg) => (
                    <option key={reg.id} value={reg.id}>
                      {reg.title}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* Custom Date Pickers */}
            {dateRange === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 animate-in fade-in duration-150">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={customFromDate}
                    onChange={(e) => setCustomFromDate(e.target.value)}
                    className="w-full text-xs h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={customToDate}
                    onChange={(e) => setCustomToDate(e.target.value)}
                    className="w-full text-xs h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </span>
              <Button size="sm" variant="outline" onClick={fetchReportPreview} className="h-7 text-xs border-rose-500/30">
                Retry
              </Button>
            </div>
          )}

          {/* Loading Skeleton */}
          {isLoadingPreview && !reportData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-48 rounded-xl" />
            </div>
          )}

          {/* Report Data Preview */}
          {reportData && (
            <div className="space-y-6">
              
              {/* Executive Metrics Grid with Traceability Links */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-blue-500" />
                    Executive Compliance Snapshot ({reportData.reporting_period})
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Click any metric to view filtered findings
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  
                  {/* Total Findings */}
                  <div
                    onClick={() => handleNavigateToFindings({})}
                    className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 cursor-pointer transition-all hover:shadow-sm group"
                  >
                    <div className="text-xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors">
                      {reportData.executive_metrics.total_findings}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500 mt-0.5 flex items-center justify-between">
                      <span>Total Findings</span>
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  {/* Open / Unresolved */}
                  <div
                    onClick={() => handleNavigateToFindings({ status: "OPEN" })}
                    className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 cursor-pointer transition-all hover:shadow-sm group"
                  >
                    <div className="text-xl font-bold text-amber-600 dark:text-amber-400 group-hover:text-amber-500 transition-colors">
                      {reportData.executive_metrics.open_findings}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500 mt-0.5 flex items-center justify-between">
                      <span>Unresolved Gaps</span>
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  {/* Critical Severity */}
                  <div
                    onClick={() => handleNavigateToFindings({ severity: "CRITICAL" })}
                    className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-500 cursor-pointer transition-all hover:shadow-sm group"
                  >
                    <div className="text-xl font-bold text-rose-600 dark:text-rose-400 group-hover:text-rose-500 transition-colors">
                      {reportData.executive_metrics.critical_findings}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500 mt-0.5 flex items-center justify-between">
                      <span>Critical Severity</span>
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  {/* Resolved */}
                  <div
                    onClick={() => handleNavigateToFindings({ status: "RESOLVED" })}
                    className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 cursor-pointer transition-all hover:shadow-sm group"
                  >
                    <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-500 transition-colors">
                      {reportData.executive_metrics.resolved_findings}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500 mt-0.5 flex items-center justify-between">
                      <span>Resolved ({reportData.executive_metrics.resolution_rate_percentage}%)</span>
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>

                </div>
              </div>

              {/* High Risk Findings Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                    High-Risk Unresolved Findings ({reportData.high_risk_findings.length})
                  </h3>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => handleNavigateToFindings({ severity: "CRITICAL" })}
                    className="h-auto p-0 text-xs text-blue-600 dark:text-blue-400"
                  >
                    View in Findings Table →
                  </Button>
                </div>

                {reportData.high_risk_findings.length === 0 ? (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-center text-xs text-slate-500">
                    No critical or high-risk findings pending for the selected filter set.
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                        <tr>
                          <th className="p-2.5">Finding ID</th>
                          <th className="p-2.5">Title / Clause</th>
                          <th className="p-2.5">Severity</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Policy Document</th>
                          <th className="p-2.5">Cycle</th>
                          <th className="p-2.5">Age</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                        {reportData.high_risk_findings.slice(0, 5).map((f) => (
                          <tr
                            key={f.id}
                            onClick={() => handleNavigateToFindings({ finding_id: f.id })}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                          >
                            <td className="p-2.5 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                              #{f.id.slice(0, 8)}
                            </td>
                            <td className="p-2.5 font-medium text-slate-900 dark:text-slate-100 max-w-[200px] truncate">
                              {f.title}
                            </td>
                            <td className="p-2.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-bold",
                                  f.severity === "CRITICAL" && "bg-rose-500/10 text-rose-600 border-rose-500/30",
                                  f.severity === "HIGH" && "bg-orange-500/10 text-orange-600 border-orange-500/30",
                                  f.severity === "MEDIUM" && "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                )}
                              >
                                {f.severity}
                              </Badge>
                            </td>
                            <td className="p-2.5 text-slate-600 dark:text-slate-400">
                              {f.lifecycle_status}
                            </td>
                            <td className="p-2.5 text-slate-600 dark:text-slate-400 max-w-[150px] truncate">
                              {f.policy_name}
                            </td>
                            <td className="p-2.5 text-center font-mono">
                              {f.remediation_cycle}
                            </td>
                            <td className="p-2.5 text-slate-500">
                              {f.age_days}d
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Policy & Regulation Gap Summaries */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Policy Gaps */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <FileCheck2 className="h-3.5 w-3.5 text-indigo-500" />
                    Top Policy Gaps
                  </h4>
                  {reportData.policy_gaps.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center">No policy gaps recorded.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {reportData.policy_gaps.slice(0, 4).map((pg) => (
                        <div
                          key={pg.policy_document_id}
                          onClick={() => handleNavigateToFindings({ policy_document_id: pg.policy_document_id })}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition-colors text-xs"
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                            {pg.policy_name}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500">{pg.unresolved_count} open</span>
                            <Badge variant="secondary" className="text-[10px] font-bold">
                              {pg.total_findings} total
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Regulation Gaps */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-blue-500" />
                    Top Regulation Gaps
                  </h4>
                  {reportData.regulation_gaps.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center">No regulation gaps recorded.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {reportData.regulation_gaps.slice(0, 4).map((rg) => (
                        <div
                          key={rg.regulation_id}
                          onClick={() => handleNavigateToFindings({ regulation_id: rg.regulation_id })}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition-colors text-xs"
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                            {rg.regulation_title}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500">{rg.unresolved_count} open</span>
                            <Badge variant="secondary" className="text-[10px] font-bold">
                              {rg.total_findings} total
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Audit Summary Bar */}
              {reportData.audit_summary.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    <b>Sprint 7.13 Audit Events:</b> {reportData.audit_summary.map((a) => `${a.count} ${a.label}`).join(" • ")}
                  </span>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-slate-400" />
            PDF generation is audited under <code className="text-[10px] font-bold">COMPLIANCE_REPORT_GENERATED</code>.
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose} className="text-xs h-9">
              Close
            </Button>
            <Button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf || isLoadingPreview || !reportData}
              className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-sm"
            >
              {isDownloadingPdf ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Download PDF Report
                </>
              )}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
};
