"use client";

import { useTheme } from "./theme-provider";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent transition-colors"
    >
      {theme === "dark" ? "☀ Light" : "◑ Dark"}
    </button>
  );
}
