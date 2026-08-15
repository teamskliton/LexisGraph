"use client";

import { useEffect, useRef } from "react";

let activeLockCount = 0;
let originalOverflow = "";
let originalPaddingRight = "";

/**
 * Calculates current browser vertical scrollbar width.
 */
export function getScrollbarWidth(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  return window.innerWidth - document.documentElement.clientWidth;
}

/**
 * Locks document.body scroll while compensating for scrollbar width
 * to eliminate horizontal layout shift / page shaking.
 */
export function lockBodyScroll(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (activeLockCount === 0) {
    const scrollbarWidth = getScrollbarWidth();
    const body = document.body;

    originalOverflow = body.style.overflow;
    originalPaddingRight = body.style.paddingRight;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  activeLockCount++;
}

/**
 * Restores document.body scroll once all active locks are released.
 */
export function unlockBodyScroll(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  activeLockCount = Math.max(0, activeLockCount - 1);
  if (activeLockCount === 0) {
    document.body.style.overflow = originalOverflow;
    document.body.style.paddingRight = originalPaddingRight;
  }
}

/**
 * React hook to lock body scrolling while a modal/drawer is open.
 */
export function useScrollLock(isLocked: boolean): void {
  const isLockedRef = useRef(false);

  useEffect(() => {
    if (isLocked && !isLockedRef.current) {
      lockBodyScroll();
      isLockedRef.current = true;
    } else if (!isLocked && isLockedRef.current) {
      unlockBodyScroll();
      isLockedRef.current = false;
    }

    return () => {
      if (isLockedRef.current) {
        unlockBodyScroll();
        isLockedRef.current = false;
      }
    };
  }, [isLocked]);
}
