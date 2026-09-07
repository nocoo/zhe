"use client";

import { LinkProvider, TooltipProvider } from "@nocoo/basalt";
import { AccentProvider } from "@nocoo/basalt/providers/accent";
import { ThemeProvider } from "@nocoo/basalt/providers/theme";
import NextLink from "next/link";
import type { ReactNode } from "react";

/** Zhe brand purple — applied as Basalt's default primary accent. */
const ZHE_ACCENT = {
  primary: { light: "262 83% 58%", dark: "262 83% 63%" },
} as const;

function AppLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children?: ReactNode;
}) {
  if (/^(https?:|mailto:|tel:)/.test(href)) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <NextLink href={href} className={className}>
      {children}
    </NextLink>
  );
}

export function BasaltProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system">
      <AccentProvider
        defaultAccent="primary"
        persist={false}
        applyToDocument={false}
        paletteOverrides={ZHE_ACCENT}
      >
        <LinkProvider render={AppLink}>
          <TooltipProvider>{children}</TooltipProvider>
        </LinkProvider>
      </AccentProvider>
    </ThemeProvider>
  );
}
