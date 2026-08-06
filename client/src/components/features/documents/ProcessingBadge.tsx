// ProcessingBadge — Processing status badge for documents
// Badges: Uploaded, Parsing, Indexed, Knowledge Graph Ready, Analysis Ready, Error

"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Loader2,
  CheckCircle2,
  Network,
  Zap,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProcessingStatus } from "./documents-types";

interface ProcessingBadgeProps {
  status: ProcessingStatus;
  className?: string;
}

export const ProcessingBadge = memo(function ProcessingBadge({
  status,
  className,
}: ProcessingBadgeProps) {
  switch (status) {
    case "Uploaded":
      return (
        <Badge
          variant="outline"
          className={cn("bg-muted text-muted-foreground border-border gap-1 text-[10px] font-medium", className)}
        >
          <Upload className="h-3 w-3" /> Uploaded
        </Badge>
      );
    case "Processing":
    case "Parsing":
      return (
        <Badge
          variant="outline"
          className={cn("bg-warning/10 text-warning border-warning/25 gap-1 text-[10px] font-medium", className)}
        >
          <Loader2 className="h-3 w-3 animate-spin" /> Processing
        </Badge>
      );
    case "Indexed":
      return (
        <Badge
          variant="outline"
          className={cn("bg-info/10 text-info border-info/25 gap-1 text-[10px] font-medium", className)}
        >
          <CheckCircle2 className="h-3 w-3" /> Indexed
        </Badge>
      );
    case "Knowledge Graph Ready":
      return (
        <Badge
          variant="outline"
          className={cn("bg-success/10 text-success border-success/25 gap-1 text-[10px] font-semibold", className)}
        >
          <Network className="h-3 w-3" /> Graph Ready
        </Badge>
      );
    case "Analysis Ready":
      return (
        <Badge
          variant="outline"
          className={cn("bg-primary/10 text-primary border-primary/25 gap-1 text-[10px] font-semibold", className)}
        >
          <Zap className="h-3 w-3" /> Analysis Ready
        </Badge>
      );
    case "Analysis Running":
      return (
        <Badge
          variant="outline"
          className={cn("bg-amber-500/10 text-amber-500 border-amber-500/25 gap-1 text-[10px] font-semibold", className)}
        >
          <Loader2 className="h-3 w-3 animate-spin" /> Analysis Running
        </Badge>
      );
    case "Error":
      return (
        <Badge
          variant="outline"
          className={cn("bg-danger/10 text-danger border-danger/25 gap-1 text-[10px] font-medium", className)}
        >
          <AlertCircle className="h-3 w-3" /> Error
        </Badge>
      );
  }
});
