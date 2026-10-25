"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Basalt `SidebarItem` row geometry (NAV_ROW_CLASS + SIDEBAR_ROW_CLASS) for
 * link-based rows: 38px row, 8px insets, 8px gap, 8px radius, 14/22 type,
 * 16px icon. Basalt 3.2.1 does not export those constants, so the row is
 * rebuilt from the public `basalt-*` tokens; keep it in sync with the library.
 */
export const NAV_ROW_CLASS =
  "basalt-ui basalt-nav-item flex w-full min-w-0 shrink-0 items-center gap-basalt-row-gap rounded-basalt-md px-basalt-row-x py-basalt-space-lg text-left text-basalt-base font-normal leading-basalt-row min-h-[calc(var(--basalt-line-row)+2*var(--basalt-space-lg))] [&>svg]:size-basalt-icon-lg [&>svg]:shrink-0 basalt-focus basalt-focus-inset";

export function NavRowLink({
  href,
  active,
  children,
  className,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-basalt-hover-item=""
      data-hover-selected={active ? "true" : undefined}
      className={cn(NAV_ROW_CLASS, className)}
    >
      {children}
    </Link>
  );
}

export function NavRowCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 text-basalt-sm tabular-nums text-basalt-muted-foreground">
      {children}
    </span>
  );
}
