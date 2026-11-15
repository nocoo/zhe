"use client";

import { SidebarBrand, SidebarHeader, SidebarToggle } from "@nocoo/basalt/components/sidebar";
import Link from "next/link";
import { APP_VERSION } from "@/lib/version";

export function SidebarMarkHeader({
  onToggle,
  isMobile,
}: {
  onToggle: () => void;
  isMobile: boolean;
}) {
  return (
    <SidebarHeader>
      <SidebarBrand
        logo={
          <Link href="/dashboard/overview" aria-label="Zhe">
            <img src="/logo-24.png" alt="" width={24} height={24} data-testid="sidebar-logo" />
          </Link>
        }
        name="ZHE.TO"
        version={`v${APP_VERSION}`}
        action={
          isMobile ? (
            <SidebarToggle mode="dismiss" onDismiss={onToggle} dismissLabel="关闭导航" />
          ) : (
            <SidebarToggle expandLabel="Expand sidebar" collapseLabel="Collapse sidebar" />
          )
        }
      />
    </SidebarHeader>
  );
}
