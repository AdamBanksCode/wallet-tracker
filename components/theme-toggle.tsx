"use client";

import { useTheme } from "./theme-provider";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="rounded-md border border-border px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
