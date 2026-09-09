"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps = {}) {
  const { setTheme, resolvedTheme } = useTheme();

  const toggle = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      className={cn("relative rounded-lg hover:bg-muted dark:hover:bg-zinc-800 transition-colors", className)}
      aria-label="Toggle theme"
    >
      {/* Render both icons; visibility is driven by the resolved theme via CSS.
          suppressHydrationWarning avoids mismatch between server (no theme) and client. */}
      <Sun
        className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
        suppressHydrationWarning
      />
      <Moon
        className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
        suppressHydrationWarning
      />
    </Button>
  );
}
