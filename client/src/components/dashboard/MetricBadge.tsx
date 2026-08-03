import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const metricBadgeVariants = cva(
  "inline-flex items-center gap-1.5 font-medium border transition-colors rounded-full whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        success:
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 dark:border-emerald-500/30",
        warning:
          "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 dark:border-amber-500/30",
        error:
          "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 dark:border-rose-500/30",
        info:
          "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20 dark:border-sky-500/30",
        neutral:
          "bg-secondary/60 text-secondary-foreground border-border/60 dark:bg-secondary/40",
      },
      size: {
        sm: "px-2 py-0.5 text-xs [&_svg]:size-3",
        md: "px-2.5 py-1 text-sm [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "sm",
    },
  }
);

const dotVariants: Record<string, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
  info: "bg-sky-500",
  neutral: "bg-muted-foreground/70",
};

export interface MetricBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof metricBadgeVariants> {
  icon?: React.ReactNode;
  showDot?: boolean;
}

export const MetricBadge = React.memo<MetricBadgeProps>(
  ({
    variant = "neutral",
    size = "sm",
    icon,
    showDot = false,
    className,
    children,
    ...props
  }) => {
    const activeVariant = variant || "neutral";

    return (
      <span
        className={cn(metricBadgeVariants({ variant, size }), className)}
        {...props}
      >
        {showDot && (
          <span
            className={cn(
              "size-1.5 rounded-full shrink-0",
              dotVariants[activeVariant] || dotVariants.neutral
            )}
            aria-hidden="true"
          />
        )}
        {icon && <span className="shrink-0 flex items-center">{icon}</span>}
        <span>{children}</span>
      </span>
    );
  }
);

MetricBadge.displayName = "MetricBadge";

export default MetricBadge;
