import type { ReactNode } from "react";
import { vi } from "vitest";

type ThemeState = {
  theme: string;
  setTheme: ReturnType<typeof vi.fn>;
};

declare global {
  var __basaltThemeState: ThemeState | undefined;
}

vi.mock("@nocoo/basalt/providers/theme", () => ({
  useTheme: () => {
    globalThis.__basaltThemeState ??= {
      theme: "system",
      setTheme: vi.fn(),
    };
    const state = globalThis.__basaltThemeState;
    return { theme: state.theme, setTheme: state.setTheme };
  },
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

export function getBasaltThemeState(): ThemeState {
  globalThis.__basaltThemeState ??= {
    theme: "system",
    setTheme: vi.fn(),
  };
  return globalThis.__basaltThemeState;
}
