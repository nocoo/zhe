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

type LinkAdapterProps = {
  href: string;
  className?: string;
  children?: ReactNode;
} & Record<string, unknown>;

function AppLink({ href, className, children, ...props }: LinkAdapterProps) {
  if (/^(https?:|mailto:|tel:)/.test(href)) {
    const anchorProps = props as unknown as Omit<
      React.AnchorHTMLAttributes<HTMLAnchorElement>,
      "href" | "className" | "children"
    >;
    return (
      <a href={href} className={className} {...anchorProps}>
        {children}
      </a>
    );
  }
  const nextLinkProps = props as unknown as Omit<
    React.ComponentProps<typeof NextLink>,
    "href" | "className" | "children"
  >;
  return (
    <NextLink href={href} className={className} {...nextLinkProps}>
      {children}
    </NextLink>
  );
}

export function BasaltProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system">
      <AccentProvider defaultAccent="primary" persist={false} paletteOverrides={ZHE_ACCENT}>
        <LinkProvider render={AppLink}>
          <TooltipProvider>{children}</TooltipProvider>
        </LinkProvider>
      </AccentProvider>
    </ThemeProvider>
  );
}
