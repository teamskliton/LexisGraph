// LoadingDocuments — Skeleton loading components for Workspace Documents page

"use client";

import { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface LoadingDocumentsProps {
  viewMode?: "grid" | "list";
}

export const LoadingDocuments = memo(function LoadingDocuments({
  viewMode = "list",
}: LoadingDocumentsProps) {
  return (
    <div className="space-y-6">
      {/* Skeleton KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-4 rounded-xl border border-border/50 bg-card space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Skeleton Content */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="p-4 rounded-xl border border-border/50 bg-card space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5 flex-1">
                  <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
              <div className="flex gap-1">
                <Skeleton className="h-4 w-12 rounded" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
              <div className="pt-2 border-t border-border/30 flex justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-3 rounded-lg border border-border/50 bg-card flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <Skeleton className="h-8 w-8 rounded shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <Skeleton className="h-5 w-24 rounded-full hidden sm:block" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-20 rounded-md" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
