"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  ShieldAlert,
  AlertTriangle,
  Clock,
  UserCheck,
  CheckCircle,
  Building2,
  ArrowLeft,
  RefreshCw,
  FileText,
  User,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import {
  complianceService,
  ComplianceCalendarData,
  ComplianceDeadlineItem,
} from "@/services/api/compliance";
import { OrganizationSwitcher } from "@/components/layout/OrganizationSwitcher";
import { Organization } from "@/services/api/organizations";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FindingDetailDrawer, FindingItem } from "./FindingDetailDrawer";

export function ComplianceCalendarWorkspace() {
  const router = useRouter();
  const { user } = useAuth();

  const [activeOrgId, setActiveOrgId] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected_organization_id") || undefined;
    }
    return undefined;
  });

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarData, setCalendarData] = useState<ComplianceCalendarData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [assignedToMe, setAssignedToMe] = useState<boolean>(false);
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");

  // Drawer state
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Synchronize Active Organization on event
  useEffect(() => {
    const handleOrgChange = () => {
      if (typeof window !== "undefined") {
        const storedId = localStorage.getItem("selected_organization_id");
        if (storedId) {
          setActiveOrgId(storedId);
        }
      }
    };
    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, []);

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [monthStart, monthEnd]);

  // Day padding for standard Sunday-Saturday calendar grid
  const startDayOfWeek = monthStart.getDay(); // 0 = Sunday

  const fetchCalendar = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const start_date = monthStart.toISOString();
      const end_date = monthEnd.toISOString();

      const data = await complianceService.getComplianceCalendar({
        organization_id: activeOrgId,
        start_date,
        end_date,
        assigned_to_me: assignedToMe,
        overdue_only: overdueOnly,
        severity: severityFilter !== "ALL" ? severityFilter : undefined,
      });

      setCalendarData(data);
    } catch (err: any) {
      console.error("Failed to fetch compliance calendar:", err);
      const rawDetail = err?.response?.data?.detail;
      let errMsg = "Unable to load compliance deadlines.";
      if (typeof rawDetail === "string") {
        errMsg = rawDetail;
      } else if (Array.isArray(rawDetail)) {
        errMsg = rawDetail.map((d: any) => d?.msg || d?.detail || (typeof d === "string" ? d : JSON.stringify(d))).join("; ");
      } else if (rawDetail && typeof rawDetail === "object") {
        errMsg = rawDetail?.msg || rawDetail?.detail || JSON.stringify(rawDetail);
      } else if (err?.message) {
        errMsg = err.message;
      }
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, monthStart, monthEnd, assignedToMe, overdueOnly, severityFilter]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => subMonths(prev, 1));
    setSelectedDate(null);
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1));
    setSelectedDate(null);
  };

  const handleToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(new Date());
  };

  const handleOpenDrawer = (item: ComplianceDeadlineItem) => {
    const drawerItem: FindingItem = {
      id: item.finding_id,
      report_id: item.report_id,
      policy_clause_id: item.policy_clause_id,
      regulation_clause_id: item.regulation_clause_id,
      status: item.status,
      lifecycle_status: item.lifecycle_status,
      severity: item.severity,
      reasoning: item.reasoning,
      citation: item.citation,
      assigned_to: item.assigned_to,
      assignee: item.assignee,
      remediation_due_date: item.remediation_due_date,
      is_overdue: item.is_overdue,
    };
    setSelectedFinding(drawerItem);
    setIsDrawerOpen(true);
  };

  const handleFindingUpdated = () => {
    fetchCalendar();
  };

  // Group deadlines by day for calendar grid
  const deadlinesByDay = useMemo(() => {
    if (!calendarData?.deadlines) return new Map<string, ComplianceDeadlineItem[]>();

    const map = new Map<string, ComplianceDeadlineItem[]>();
    for (const item of calendarData.deadlines) {
      const dayKey = format(parseISO(item.remediation_due_date), "yyyy-MM-dd");
      const existing = map.get(dayKey) || [];
      existing.push(item);
      map.set(dayKey, existing);
    }
    return map;
  }, [calendarData]);

  // Deadlines filtered by selected date if clicked
  const displayedDeadlines = useMemo(() => {
    if (!calendarData?.deadlines) return [];
    if (!selectedDate) return calendarData.deadlines;

    return calendarData.deadlines.filter((item) => {
      const dt = parseISO(item.remediation_due_date);
      return isSameDay(dt, selectedDate);
    });
  }, [calendarData, selectedDate]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Top Header ── */}
      <header className="border-b border-border/60 bg-card px-4 sm:px-6 py-4 shadow-2xs sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => router.push("/compliance/overview")}
              className="h-8 w-8 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-indigo-500" /> Compliance Remediation Calendar
                </h1>
                <Badge variant="outline" className="text-[10px] font-mono uppercase bg-indigo-500/10 text-indigo-600 border-indigo-500/30">
                  {calendarData?.organization_name || "Active Org"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Track compliance remediation due dates, upcoming deadlines, and overdue action items.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <OrganizationSwitcher onOrganizationChanged={(org) => setActiveOrgId(org.id)} />
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCalendar}
              disabled={isLoading}
              className="text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {error && (
          <Card className="border border-rose-500/40 bg-rose-500/5 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
            </div>
            <Button size="xs" onClick={fetchCalendar} className="text-xs font-semibold bg-rose-600 text-white">
              Retry
            </Button>
          </Card>
        )}

        {/* ── 1. Compact Deadline Summary Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border border-border/60 bg-card p-4 shadow-2xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-500">
                Overdue Deadlines
              </span>
              <div className="text-2xl font-bold tabular-nums text-rose-500">
                {calendarData?.summary.overdue_count || 0}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </Card>

          <Card className="border border-border/60 bg-card p-4 shadow-2xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
                Due This Week
              </span>
              <div className="text-2xl font-bold tabular-nums text-amber-500">
                {calendarData?.summary.this_week_count || 0}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Clock className="h-5 w-5" />
            </div>
          </Card>

          <Card className="border border-border/60 bg-card p-4 shadow-2xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">
                Next 30 Days
              </span>
              <div className="text-2xl font-bold tabular-nums text-indigo-500">
                {calendarData?.summary.next_30_days_count || 0}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <CalendarIcon className="h-5 w-5" />
            </div>
          </Card>
        </div>

        {/* ── 2. Filters & Navigation Bar ── */}
        <Card className="border border-border/60 bg-card p-4 shadow-2xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Month Navigator */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handlePrevMonth}
                className="h-8 w-8 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-base font-extrabold text-foreground font-mono w-40 text-center">
                {format(currentMonth, "MMMM yyyy")}
              </h2>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handleNextMonth}
                className="h-8 w-8 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToday}
                className="text-xs font-semibold text-indigo-500 cursor-pointer ml-1"
              >
                Today
              </Button>
            </div>

            {/* Filter Toggle Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={!assignedToMe && !overdueOnly ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setAssignedToMe(false);
                  setOverdueOnly(false);
                }}
                className={cn("text-xs font-semibold cursor-pointer h-8", !assignedToMe && !overdueOnly && "bg-indigo-600 text-white")}
              >
                All Deadlines
              </Button>

              <Button
                variant={assignedToMe ? "default" : "outline"}
                size="sm"
                onClick={() => setAssignedToMe((prev) => !prev)}
                className={cn("text-xs font-semibold gap-1.5 cursor-pointer h-8", assignedToMe && "bg-indigo-600 text-white")}
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Assigned to Me</span>
              </Button>

              <Button
                variant={overdueOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setOverdueOnly((prev) => !prev)}
                className={cn("text-xs font-semibold gap-1.5 cursor-pointer h-8", overdueOnly && "bg-rose-600 text-white border-rose-600")}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Overdue Only</span>
              </Button>

              {/* Severity Dropdown */}
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="h-8 px-2.5 rounded-lg border border-border/60 bg-muted/20 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="ALL">Severity: All</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>
        </Card>

        {/* ── 3. Desktop Calendar Grid View ── */}
        <Card className="border border-border/60 bg-card p-4 sm:p-6 shadow-xs space-y-3 hidden md:block">
          <div className="grid grid-cols-7 gap-1 text-center border-b border-border/40 pb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-7 gap-2">
              {[...Array(35)].map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {/* Empty padding cells for start of month */}
              {[...Array(startDayOfWeek)].map((_, i) => (
                <div key={`pad-${i}`} className="h-24 rounded-xl bg-muted/5 border border-transparent" />
              ))}

              {/* Month Day Cells */}
              {daysInMonth.map((day) => {
                const dayStr = format(day, "yyyy-MM-dd");
                const dayDeadlines = deadlinesByDay.get(dayStr) || [];
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isCurrent = isToday(day);

                const hasCritical = dayDeadlines.some((d) => d.severity.toUpperCase() === "CRITICAL");
                const hasOverdue = dayDeadlines.some((d) => d.is_overdue);

                return (
                  <div
                    key={dayStr}
                    onClick={() => setSelectedDate(isSelected ? null : day)}
                    className={cn(
                      "h-24 p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group",
                      isSelected
                        ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500"
                        : isCurrent
                        ? "border-indigo-500/50 bg-indigo-500/5"
                        : "border-border/60 bg-card hover:bg-muted/30",
                      hasOverdue && !isSelected && "border-rose-500/40 bg-rose-500/5"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-xs font-mono font-bold h-6 w-6 rounded-full flex items-center justify-center",
                          isCurrent
                            ? "bg-indigo-600 text-white"
                            : isSelected
                            ? "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                            : "text-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </span>

                      {dayDeadlines.length > 0 && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] font-bold px-1.5 py-0.2",
                            hasOverdue
                              ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              : hasCritical
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                              : "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
                          )}
                        >
                          {dayDeadlines.length} due
                        </Badge>
                      )}
                    </div>

                    {/* Indicator dots/preview */}
                    <div className="space-y-1 overflow-hidden">
                      {dayDeadlines.slice(0, 2).map((item) => (
                        <div
                          key={item.finding_id}
                          className={cn(
                            "text-[9px] font-semibold truncate px-1.5 py-0.5 rounded border",
                            item.is_overdue
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                              : item.severity.toUpperCase() === "CRITICAL"
                              ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              : item.severity.toUpperCase() === "HIGH"
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                              : "bg-muted/40 text-muted-foreground border-border/30"
                          )}
                        >
                          {item.policy_clause_id || item.severity}
                        </div>
                      ))}
                      {dayDeadlines.length > 2 && (
                        <span className="text-[9px] text-muted-foreground block font-mono pl-1">
                          +{dayDeadlines.length - 2} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── 4. Deadline List Section ── */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <CalendarIcon className="h-4 w-4 text-indigo-500" />
              {selectedDate
                ? `Remediation Deadlines for ${format(selectedDate, "dd MMMM yyyy")}`
                : `Remediation Deadlines (${format(currentMonth, "MMMM yyyy")})`}
            </span>
            <div className="flex items-center gap-2">
              {selectedDate && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setSelectedDate(null)}
                  className="text-xs text-indigo-500 font-semibold cursor-pointer"
                >
                  Show All Month
                </Button>
              )}
              <span className="text-[10px] font-mono text-muted-foreground">
                {displayedDeadlines.length} Items
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : displayedDeadlines.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto opacity-70" />
              <h4 className="text-xs font-bold text-foreground">No remediation deadlines scheduled</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {selectedDate
                  ? `No findings are scheduled for remediation on ${format(selectedDate, "dd MMMM yyyy")}.`
                  : assignedToMe
                  ? "No findings are currently assigned to you with remediation deadlines."
                  : overdueOnly
                  ? "No remediation deadlines are overdue."
                  : `No active compliance remediation deadlines found for ${format(currentMonth, "MMMM yyyy")}.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedDeadlines.map((item) => {
                const dueDt = parseISO(item.remediation_due_date);

                return (
                  <div
                    key={item.finding_id}
                    onClick={() => handleOpenDrawer(item)}
                    className={cn(
                      "p-4 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer space-y-3 group shadow-2xs",
                      item.is_overdue && "border-rose-500/40 bg-rose-500/5"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs font-bold uppercase",
                            item.severity.toUpperCase() === "CRITICAL"
                              ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              : item.severity.toUpperCase() === "HIGH"
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                              : "bg-blue-500/10 text-blue-600 border-blue-500/30"
                          )}
                        >
                          {item.severity}
                        </Badge>
                        <Badge variant="outline" className="text-xs font-bold uppercase">
                          {item.lifecycle_status}
                        </Badge>
                        {item.is_overdue && (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 gap-1 font-bold text-[10px]">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{item.days_overdue} DAYS OVERDUE</span>
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <CalendarIcon className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Due: {format(dueDt, "dd MMM yyyy")}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        {item.policy_clause_id && <Badge variant="secondary" className="text-[10px]">{item.policy_clause_id}</Badge>}
                        {item.regulation_clause_id && <Badge variant="outline" className="text-[10px]">{item.regulation_clause_id}</Badge>}
                      </div>
                      <p className="text-xs text-foreground font-medium line-clamp-2">
                        {item.citation || item.reasoning || "Compliance gap remediation deadline."}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/30">
                      <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3 text-indigo-500" />
                          <span>Assignee: <strong className="text-foreground">{item.assignee?.full_name || "Unassigned"}</strong></span>
                        </span>
                        {item.regulation_title && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-[200px]">{item.regulation_title}</span>
                          </span>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDrawer(item);
                        }}
                        className="h-6 text-xs font-semibold text-indigo-600 dark:text-indigo-400 gap-1 cursor-pointer"
                      >
                        <span>Open Finding</span>
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </main>

      {/* ── Slide-over Finding Detail Drawer ── */}
      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onFindingUpdated={handleFindingUpdated}
        reportName={selectedFinding ? `Report #${selectedFinding.report_id.slice(0, 8)}` : undefined}
        organizationId={activeOrgId}
      />
    </div>
  );
}
