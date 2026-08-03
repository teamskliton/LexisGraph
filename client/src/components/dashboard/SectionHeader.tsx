import React from "react";
import { cn } from "@/lib/utils";

export interface SectionHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  headingLevel?: "h1" | "h2" | "h3" | "h4";
  titleId?: string;
}

export const SectionHeader = React.memo<SectionHeaderProps>(
  ({
    title,
    description,
    action,
    headingLevel: Heading = "h2",
    titleId,
    className,
    ...props
  }) => {
    return (
      <div
        className={cn(
          "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
          className
        )}
        {...props}
      >
        <div className="space-y-0.5">
          <Heading
            id={titleId}
            className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
          >
            {title}
          </Heading>
          {description && (
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action && (
          <div className="flex items-center gap-2 shrink-0 sm:self-center">
            {action}
          </div>
        )}
      </div>
    );
  }
);

SectionHeader.displayName = "SectionHeader";

export default SectionHeader;
