"use client";

import {
  SidebarProvider as BasaltSidebarProvider,
  Button,
  ContentIsland,
  SidebarDrawer,
  ThemeToggle,
} from "@nocoo/basalt";
import { AppHeader, AppHeaderMenuButton, ProjectLinks } from "@nocoo/basalt/components/app-header";
import {
  AppMain,
  AppSkipLink,
  AppShell as BasaltAppShell,
} from "@nocoo/basalt/components/app-shell";

import { Search } from "@nocoo/basalt/icons";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { getAppHeaderTrail } from "@/components/breadcrumbs";
import { EnvironmentControl } from "@/components/environment-control";

import { GlobalCreateAction } from "@/components/global-create-action";
import { SearchProvider, useOpenSearch } from "@/components/search-provider";
import { Sidebar } from "@/components/sidebar";
import {
  SidebarProvider as DashboardSidebarProvider,
  useSidebar,
} from "@/components/sidebar-context";
import { CreateActionProvider } from "@/contexts/create-action";
import { DashboardServiceProvider } from "@/contexts/dashboard-service";
import { EnrichmentProvider } from "@/contexts/enrichment";
import type { Folder } from "@/models/types";

export interface AppShellProps {
  children: React.ReactNode;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  signOutAction: () => Promise<void>;
  initialFolders?: Folder[];
}

export function AppShell({ children, user, signOutAction, initialFolders = [] }: AppShellProps) {
  return (
    <DashboardServiceProvider initialFolders={initialFolders}>
      <DashboardSidebarProvider>
        <SearchProvider>
          <EnrichmentProvider>
            <CreateActionProvider>
              <AppShellInner user={user} signOutAction={signOutAction}>
                {children}
              </AppShellInner>
            </CreateActionProvider>
          </EnrichmentProvider>
        </SearchProvider>
      </DashboardSidebarProvider>
    </DashboardServiceProvider>
  );
}

function AppShellInner({
  children,
  user,
  signOutAction,
}: {
  children: React.ReactNode;
  user?: AppShellProps["user"];
  signOutAction: () => Promise<void>;
}) {
  const openSearch = useOpenSearch();
  const { collapsed, setCollapsed, isMobile, mobileOpen, setMobileOpen, closeMobileSidebar } =
    useSidebar();
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileSheetId = useId();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = `${pathname}?${searchParams.toString()}`;
  const { breadcrumbs, title } = getAppHeaderTrail(pathname, searchParams.get("folder"));

  useEffect(() => {
    if (locationKey) closeMobileSidebar();
  }, [locationKey, closeMobileSidebar]);

  const sidebar = <Sidebar {...(user ? { user } : {})} signOutAction={signOutAction} />;

  return (
    <BasaltAppShell>
      <AppSkipLink>Skip to main content</AppSkipLink>
      {!isMobile ? (
        <BasaltSidebarProvider collapsed={collapsed} onCollapsedChange={setCollapsed}>
          {sidebar}
        </BasaltSidebarProvider>
      ) : null}
      {isMobile ? (
        <SidebarDrawer
          id={mobileSheetId}
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          returnFocusRef={mobileTriggerRef}
          title="导航"
          description="Zhe 导航链接与账户操作"
        >
          {sidebar}
        </SidebarDrawer>
      ) : null}
      <AppMain>
        {isMobile && (
          <EnvironmentControl className="flex items-center justify-end gap-1 px-3 pt-1" />
        )}
        <AppHeader
          leading={
            isMobile ? (
              <AppHeaderMenuButton
                ref={mobileTriggerRef}
                label="打开导航"
                aria-controls={mobileSheetId}
                onClick={() => setMobileOpen(true)}
              />
            ) : null
          }
          breadcrumbs={breadcrumbs}
          title={title}
          actions={
            <>
              {isMobile && (
                <Button variant="ghost" size="icon" aria-label="打开搜索" onClick={openSearch}>
                  <Search aria-hidden />
                </Button>
              )}
              {!isMobile && <EnvironmentControl />}
              <ProjectLinks
                github="nocoo/zhe"
                hexly="zhe"
                name="Zhe"
                githubLabel="GitHub"
                hexlyLabel="Zhe on hexly.ai"
                newTabLabel=""
              />
              <ThemeToggle
                aria-label="切换主题"
                labels={{
                  light: "切换为浅色主题",
                  dark: "切换为深色主题",
                  system: "跟随系统主题",
                }}
              />
            </>
          }
        />
        <div className="flex min-h-0 flex-1 flex-col px-basalt-space-lg pb-basalt-space-lg md:px-basalt-layout-sm md:pb-basalt-layout-sm">
          <ContentIsland className="pb-basalt-layout-xl md:pb-basalt-layout-xl">
            {children}
          </ContentIsland>
        </div>
        <GlobalCreateAction />
      </AppMain>
    </BasaltAppShell>
  );
}
