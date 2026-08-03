import React from "react";
import { cn } from "@/lib/utils";

export type GridColumns = 1 | 2 | 3 | 4 | 5 | 6;

export interface DashboardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: GridColumns;
  colsTablet?: 1 | 2 | 3 | 4;
  colsMobile?: 1 | 2;
  gap?: "none" | "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
}

const mobileColsMap: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
};

const tabletColsMap: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

const desktopColsMap: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

const gapMap: Record<NonNullable<DashboardGridProps["gap"]>, string> = {
  none: "gap-0",
  sm: "gap-3",
  md: "gap-4 sm:gap-6",
  lg: "gap-6 sm:gap-8",
  xl: "gap-8 sm:gap-10",
};

export const DashboardGrid = React.memo<DashboardGridProps>(
  ({
    cols = 4,
    colsTablet = 2,
    colsMobile = 1,
    gap = "md",
    className,
    children,
    ...props
  }) => {
    return (
      <div
        className={cn(
          "grid w-full",
          mobileColsMap[colsMobile] || "grid-cols-1",
          tabletColsMap[colsTablet] || "md:grid-cols-2",
          desktopColsMap[cols] || "lg:grid-cols-4",
          gapMap[gap] || gapMap.md,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

DashboardGrid.displayName = "DashboardGrid";

export default DashboardGrid;
