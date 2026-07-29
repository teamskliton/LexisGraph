"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, ShieldAlert, AlertTriangle, AlertOctagon } from "lucide-react";

interface ComplianceScoreCardProps {
  score: number | null | undefined;
}

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

interface RiskConfig {
  level: RiskLevel;
  badgeClass: string;
  strokeColor: string;
  textColor: string;
  icon: React.ReactNode;
  description: string;
}

export function getRiskLevelConfig(score: number | null | undefined): RiskConfig {
  if (score === null || score === undefined) {
    return {
      level: "High",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
      strokeColor: "#64748b",
      textColor: "text-slate-600 dark:text-slate-400",
      icon: <AlertTriangle className="h-4 w-4" />,
      description: "Compliance score pending evaluation.",
    };
  }

  const s = score <= 1.0 && score > 0 ? score * 100 : score;

  if (s >= 85) {
    return {
      level: "Low",
      badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800",
      strokeColor: "#10b981", // emerald-500
      textColor: "text-emerald-600 dark:text-emerald-400",
      icon: <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
      description: "Low risk. High policy alignment with regulatory mandates.",
    };
  }

  if (s >= 70) {
    return {
      level: "Medium",
      badgeClass: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800",
      strokeColor: "#f59e0b", // amber-500
      textColor: "text-amber-600 dark:text-amber-400",
      icon: <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
      description: "Medium risk. Partial gaps found requiring policy adjustments.",
    };
  }

  if (s >= 50) {
    return {
      level: "High",
      badgeClass: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/60 dark:text-orange-400 dark:border-orange-800",
      strokeColor: "#f97316", // orange-500
      textColor: "text-orange-600 dark:text-orange-400",
      icon: <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />,
      description: "High risk. Significant compliance deficiencies identified.",
    };
  }

  return {
    level: "Critical",
    badgeClass: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800",
    strokeColor: "#ef4444", // red-500
    textColor: "text-red-600 dark:text-red-400",
    icon: <AlertOctagon className="h-4 w-4 text-red-600 dark:text-red-400" />,
    description: "Critical risk! Severe regulatory gaps demanding immediate action.",
  };
}

export const ComplianceScoreCard: React.FC<ComplianceScoreCardProps> = ({ score }) => {
  const numericScore = score !== null && score !== undefined
    ? Math.round(score <= 1.0 && score > 0 ? score * 100 : score)
    : 0;

  const riskConfig = getRiskLevelConfig(score);

  // SVG Circular Ring Calculation
  const radius = 58;
  const circumference = 2 * Math.PI * radius; // ~364.42
  const strokeDashoffset = circumference - (numericScore / 100) * circumference;

  return (
    <Card className="border-border/60 shadow-sm flex flex-col justify-between">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold text-foreground">
          Compliance Score
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col items-center justify-center space-y-4 py-4">
        {/* Large Circular Gauge */}
        <div className="relative flex items-center justify-center">
          <svg className="w-36 h-36 transform -rotate-90">
            {/* Background track circle */}
            <circle
              cx="72"
              cy="72"
              r={radius}
              stroke="currentColor"
              strokeWidth="10"
              className="text-muted/30"
              fill="transparent"
            />
            {/* Animated progress circle */}
            <circle
              cx="72"
              cy="72"
              r={radius}
              stroke={riskConfig.strokeColor}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-1000 ease-out"
            />
          </svg>

          {/* Centered Score Display */}
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono">
              {score !== null && score !== undefined ? `${numericScore}%` : "N/A"}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Overall Score
            </span>
          </div>
        </div>

        {/* Risk Level Badge */}
        <div className="space-y-1.5 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">Risk Level:</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs font-bold ${riskConfig.badgeClass}`}
            >
              {riskConfig.icon}
              {riskConfig.level} Risk
            </span>
          </div>
          <p className="text-xs text-muted-foreground max-w-[220px] mx-auto">
            {riskConfig.description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default ComplianceScoreCard;
