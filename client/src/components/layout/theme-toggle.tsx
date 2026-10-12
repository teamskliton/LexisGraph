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
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  const toggle = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  if (!hasMounted) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn("relative rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors opacity-70", className)}
        aria-label="Toggle theme"
        disabled
      >
        <span className="h-[1.125rem] w-[1.125rem] block" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      className={cn("relative rounded-lg hover:bg-surface-elevated text-foreground transition-colors", className)}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="h-[1.15rem] w-[1.15rem] text-warning transition-transform duration-200 hover:rotate-45" />
      ) : (
        <Moon className="h-[1.15rem] w-[1.15rem] text-foreground transition-transform duration-200 hover:-rotate-12" />
      )}
    </Button>
  );
}
