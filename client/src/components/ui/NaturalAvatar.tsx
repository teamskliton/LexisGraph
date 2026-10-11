"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  getNaturalAvatarColor,
  getAvatarInitials,
  isValidImageUrl,
} from "@/utils/avatar-utils";

export interface NaturalAvatarProps {
  /** Name of the user or organization (used for initials and deterministic color) */
  name: string;
  /** Image URL or data URI if a profile photo / logo was uploaded */
  src?: string | null;
  /** Image alt text */
  alt?: string;
  /** Shape: circle (standard for users, Gmail style), rounded (standard for orgs/workspaces), or square */
  shape?: "circle" | "rounded" | "square";
  /** Maximum initial characters: 1 (Gmail style single letter) or 2 (org style) */
  maxInitials?: number;
  /** Custom seed string for deterministic color calculation (defaults to name) */
  seed?: string;
  /** Custom CSS classes for the container */
  className?: string;
  /** Custom CSS classes for the fallback initials text */
  textClassName?: string;
}

/**
 * NaturalAvatar — Gmail / Google Workspace style avatar.
 * 
 * - If an image URL is provided (user uploaded a profile photo or org uploaded a logo),
 *   it displays the image.
 * - Otherwise (or if the image fails to load), it renders a clean, solid, natural color
 *   from the Gmail palette with bold white initials centered.
 * - Absolutely NO artificial gradients. Pure, clean, natural aesthetic.
 */
export function NaturalAvatar({
  name,
  src,
  alt,
  shape = "circle",
  maxInitials = 1,
  seed,
  className,
  textClassName,
}: NaturalAvatarProps) {
  const [imageError, setImageError] = useState(false);

  // Reset error when src changes
  useEffect(() => {
    setImageError(false);
  }, [src]);

  const hasValidImage = Boolean(src && isValidImageUrl(src) && !imageError);
  const initials = getAvatarInitials(name, maxInitials);
  const bgColor = getNaturalAvatarColor(seed || name);

  const shapeClasses =
    shape === "circle"
      ? "rounded-full"
      : shape === "rounded"
      ? "rounded-md"
      : "rounded-none";

  if (hasValidImage && src) {
    return (
      <div
        className={cn(
          "relative overflow-hidden select-none shrink-0 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center",
          shapeClasses,
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt || name}
          onError={() => setImageError(true)}
          className={cn("w-full h-full object-cover", shapeClasses)}
        />
      </div>
    );
  }

  return (
    <div
      style={{ backgroundColor: bgColor }}
      className={cn(
        "relative select-none shrink-0 flex items-center justify-center font-bold text-white shadow-2xs leading-none",
        shapeClasses,
        className
      )}
      aria-label={alt || name}
    >
      <span className={cn("uppercase tracking-normal", textClassName)}>
        {initials}
      </span>
    </div>
  );
}
