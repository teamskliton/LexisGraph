"use client";

import React, { useState } from "react";
import { ComplianceTrendPoint } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, LineChart as ChartIcon, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComplianceTrendChartProps {
  data?: ComplianceTrendPoint[];
  isLoading: boolean;
}

export const ComplianceTrendChart: React.FC<ComplianceTrendChartProps> = ({
  data = [],
  isLoading,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (isLoading) {
    return (
      <Card className="border border-border/50 bg-card shadow-2xs">
        <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        </CardHeader>
        <CardContent className="py-6 px-5 space-y-3">
          <Skeleton className="h-44 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const hasSufficientData = data.length >= 2;

  // Chart dimensions
  const width = 500;
  const height = 180;
  const paddingX = 45;
  const paddingY = 25;

  const minScore = 0;
  const maxScore = 100;

  // Compute point coordinates
  const points = data.map((d, i) => {
    const x = paddingX + (i / Math.max(data.length - 1, 1)) * (width - 2 * paddingX);
    const y = height - paddingY - ((d.score - minScore) / (maxScore - minScore)) * (height - 2 * paddingY);
    return { x, y, ...d };
  });

  // SVG path data
  const linePath = points.length > 0
    ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
    : "";

  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`
    : "";

  // Average score
  const avg = data.length > 0
    ? Math.round((data.reduce((acc, curr) => acc + curr.score, 0) / data.length) * 10) / 10
    : 0;

  return (
    <Card className="border border-border/50 bg-card shadow-2xs flex flex-col justify-between">
      {/* ── Card Header ── */}
      <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Compliance Trend
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Historical score progression for this organization
              </p>
            </div>
          </div>
          {data.length > 0 && (
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block leading-tight">
                Avg Score
              </span>
              <span className="text-sm font-bold tabular-nums text-foreground">
                {avg}%
              </span>
            </div>
          )}
        </div>
      </CardHeader>

      {/* ── Card Content ── */}
      <CardContent className="p-5 flex-1 flex flex-col justify-center">
        {!hasSufficientData ? (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2.5">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60">
              <ChartIcon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">
                Insufficient Historical Analyses
              </p>
              <p className="text-[11px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Run multiple compliance evaluations over time to observe statutory alignment trends and historical score deltas.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-44 overflow-visible"
            >
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[25, 50, 75, 100].map((val) => {
                const yPos = height - paddingY - ((val - minScore) / (maxScore - minScore)) * (height - 2 * paddingY);
                return (
                  <g key={val}>
                    <line
                      x1={paddingX}
                      y1={yPos}
                      x2={width - paddingX}
                      y2={yPos}
                      stroke="currentColor"
                      strokeDasharray="3 3"
                      className="text-border/40"
                    />
                    <text
                      x={paddingX - 8}
                      y={yPos + 3}
                      textAnchor="end"
                      className="text-[9px] fill-muted-foreground font-mono"
                    >
                      {val}%
                    </text>
                  </g>
                );
              })}

              {/* Shaded Area */}
              <path d={areaPath} fill="url(#trendGradient)" />

              {/* Line */}
              <path
                d={linePath}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data Points */}
              {points.map((p, idx) => {
                const isHovered = hoveredIdx === idx;
                const pointColor =
                  p.score >= 85 ? "#34D399" : p.score >= 70 ? "#FBBF24" : "#F87171";

                return (
                  <g key={p.report_id} className="cursor-pointer">
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isHovered ? 6 : 4}
                      fill={pointColor}
                      stroke="var(--card)"
                      strokeWidth="2"
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                    {/* Date label at bottom */}
                    <text
                      x={p.x}
                      y={height - 6}
                      textAnchor="middle"
                      className="text-[8px] fill-muted-foreground font-mono"
                    >
                      {p.date}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Tooltip Overlay */}
            {hoveredIdx !== null && points[hoveredIdx] && (
              <div
                className="absolute z-10 pointer-events-none rounded-lg border border-border bg-popover/95 backdrop-blur-md px-3 py-1.5 shadow-md text-xs space-y-0.5"
                style={{
                  left: `${(points[hoveredIdx].x / width) * 100}%`,
                  top: `${Math.max(10, (points[hoveredIdx].y / height) * 100 - 30)}%`,
                  transform: "translate(-50%, -100%)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground tabular-nums">
                    {points[hoveredIdx].score}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {points[hoveredIdx].date}
                  </span>
                </div>
                {points[hoveredIdx].report_name && (
                  <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                    {points[hoveredIdx].report_name}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ComplianceTrendChart;
