"use client";

import { useEffect } from "react";

export function useTheme() {
  return { theme: "dark" as const, toggle: () => {} };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return <>{children}</>;
}
