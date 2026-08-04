import React, { useId } from "react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./SectionHeader";

export interface DashboardSectionProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  headingLevel?: "h1" | "h2" | "h3" | "h4";
  asCard?: boolean;
  headerClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

export const DashboardSection = React.memo<DashboardSectionProps>(
  ({
    title,
    subtitle,
    action,
    headingLevel = "h2",
    asCard = true,
    className,
    headerClassName,
    contentClassName,
    children,
    id,
    "aria-labelledby": ariaLabelledBy,
    ...props
  }) => {
    const generatedTitleId = useId();
    const titleId = title ? (ariaLabelledBy || `section-title-${id || generatedTitleId}`) : undefined;

    const hasHeader = Boolean(title || subtitle || action);

    return (
      <section
        id={id}
        aria-labelledby={titleId}
        className={cn(
          "w-full space-y-4",
          asCard && "rounded-xl border border-(--card-border,var(--border)) bg-card p-4 shadow-(--shadow-card) sm:p-6 text-card-foreground transition-all duration-200",
          className
        )}
        {...props}
      >
        {hasHeader && (
          <SectionHeader
            title={title}
            description={subtitle}
            action={action}
            headingLevel={headingLevel}
            titleId={titleId}
            className={headerClassName}
          />
        )}
        <div className={cn("w-full", contentClassName)}>
          {children}
        </div>
      </section>
    );
  }
);

DashboardSection.displayName = "DashboardSection";

export default DashboardSection;
