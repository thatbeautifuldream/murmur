import { useEffect, useState } from "react";

type TTheme = "light" | "dark" | "system";

const STORAGE_KEY = "app-theme";

function applyTheme(theme: TTheme): void {
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

export function useTheme() {
  const [theme, setThemeState] = useState<TTheme>(() => {
    return (localStorage.getItem(STORAGE_KEY) as TTheme) || "system";
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) as TTheme) === "system") {
        applyTheme("system");
      }
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return { theme, setTheme: setThemeState };
}
