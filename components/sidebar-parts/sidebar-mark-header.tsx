"use client";

import { Button } from "@nocoo/basalt/components/button";
import { SidebarHeader } from "@nocoo/basalt/components/sidebar";
import { PanelLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

const SIDEBAR_MARK_SLOT_CLASS = "flex w-full items-center";

export function SidebarMarkHeader({
  collapsed,
  onToggle,
  isMobile,
}: {
  collapsed: boolean;
  onToggle: () => void;
  isMobile: boolean;
}) {
  return (
    <SidebarHeader>
      <div
        className={cn(
          SIDEBAR_MARK_SLOT_CLASS,
          collapsed ? "justify-center" : "justify-between pl-basalt-layout-sm",
        )}
      >
        <Link
          href="/dashboard/overview"
          aria-label="Zhe"
          className="flex min-w-0 items-center gap-basalt-space-lg text-basalt-foreground no-underline hover:no-underline"
        >
          <img
            src="/logo-24.png"
            alt=""
            width={28}
            height={28}
            data-testid="sidebar-logo"
            className="h-7 w-7 shrink-0 object-contain"
          />
          {collapsed ? null : (
            <>
              <span className="truncate text-basalt-xl font-semibold text-basalt-foreground">
                ZHE.TO
              </span>
              <span className="shrink-0 rounded-basalt-md bg-basalt-secondary px-basalt-space-md py-basalt-space-xs text-basalt-sm font-medium leading-basalt-tight text-basalt-muted-foreground">
                v{APP_VERSION}
              </span>
            </>
          )}
        </Link>
        {collapsed || isMobile ? null : (
          <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Collapse sidebar">
            <PanelLeft aria-hidden />
          </Button>
        )}
      </div>
    </SidebarHeader>
  );
}
