import React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface BrandLogoProps {
  size?: number;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  alt?: string;
  rounded?: string;
}

/**
 * Canonical LexisGraph Brand Logo Component
 * Renders the brand mark from /logoL.jpg in a crisp, high-contrast badge.
 */
export function BrandLogo({
  size = 32,
  className,
  imageClassName,
  priority = false,
  alt = "LexisGraph Logo",
  rounded = "rounded-lg",
}: BrandLogoProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center shrink-0 overflow-hidden bg-white shadow-xs border border-border/40 select-none transition-transform duration-150 hover:scale-[1.02]",
        rounded,
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logoL.jpg"
        alt={alt}
        width={size * 2}
        height={size * 2}
        className={cn("h-full w-full object-contain p-0.5", imageClassName)}
        priority={priority}
      />
    </div>
  );
}

export interface BrandLockupProps {
  href?: string;
  logoSize?: number;
  className?: string;
  logoClassName?: string;
  textClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
  text?: string;
  priority?: boolean;
}

/**
 * Combined Brand Logo + Wordmark lockup with optional navigation link.
 */
export function BrandLockup({
  href,
  logoSize = 32,
  className,
  logoClassName,
  textClassName,
  subtitle,
  subtitleClassName,
  text = "LexisGraph",
  priority = false,
}: BrandLockupProps) {
  const content = (
    <div className={cn("flex items-center gap-2.5 select-none group", className)}>
      <BrandLogo size={logoSize} className={logoClassName} priority={priority} />
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            "font-bold tracking-tight text-foreground transition-colors group-hover:text-primary",
            textClassName
          )}
        >
          {text}
        </span>
        {subtitle && (
          <span
            className={cn(
              "text-[10px] text-muted-foreground mt-0.5",
              subtitleClassName
            )}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} aria-label={`${text} home`} className="inline-flex items-center">
        {content}
      </Link>
    );
  }

  return content;
}
