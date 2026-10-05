import { useCallback, useEffect, useState } from "react";

const KEY = "rdp-theme";

function initialTheme() {
  const set = document.documentElement.dataset.theme;
  if (set === "paper" || set === "blueprint") return set;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "paper" || saved === "blueprint") return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "blueprint" : "paper";
}

/** "paper" (light) or "blueprint" (dark), persisted across visits. */
export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "paper" ? "blueprint" : "paper")), []);
  return [theme, toggle];
}
