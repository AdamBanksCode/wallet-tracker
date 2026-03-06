"use client";

import { useTheme } from "./theme-provider";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded transition-colors"
    >
      {theme === "dark" ? "LIGHT" : "DARK"}
    </button>
  );
}
