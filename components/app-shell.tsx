"use client";

import { Sidebar } from "@/components/sidebar";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { DashboardServiceProvider } from "@/contexts/dashboard-service";
import { SidebarProvider, useSidebar } from "@/components/sidebar-context";
import { Menu, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
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

export function AppShell({
  children,
  user,
  signOutAction,
  initialFolders = [],
}: AppShellProps) {
  return (
    <DashboardServiceProvider initialFolders={initialFolders}>
      <TooltipProvider>
        <SidebarProvider>
          <AppShellInner user={user} signOutAction={signOutAction}>
            {children}
          </AppShellInner>
        </SidebarProvider>
      </TooltipProvider>
    </DashboardServiceProvider>
  );
}

/** Inner shell that can consume useSidebar() context */
function AppShellInner({
  children,
  user,
  signOutAction,
}: {
  children: React.ReactNode;
  user?: AppShellProps["user"];
  signOutAction: () => Promise<void>;
}) {
  const { isMobile, mobileOpen, setMobileOpen, toggle } = useSidebar();

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sidebar
          {...(user ? { user } : {})}
          signOutAction={signOutAction}
        />
      )}

      {/* Mobile sidebar — Sheet drawer with slide animation */}
      {isMobile && (
        <Sheet
          open={mobileOpen}
          onOpenChange={(open) => !open && setMobileOpen(false)}
        >
          <SheetContent
            side="left"
            className="w-[260px] p-0 border-0 [&>button:last-child]:hidden"
          >
            <VisuallyHidden.Root>
              <SheetTitle>Navigation</SheetTitle>
            </VisuallyHidden.Root>
            <Sidebar
              {...(user ? { user } : {})}
              signOutAction={signOutAction}
            />
          </SheetContent>
        </Sheet>
      )}

      <main className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Header */}
        <header className="flex h-14 items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button
                onClick={toggle}
                aria-label="Open menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Menu className="h-5 w-5" strokeWidth={1.5} />
              </button>
            )}
            <Breadcrumbs />
          </div>
          <div className="flex items-center gap-1">
            <a
              href="https://github.com/nocoo/zhe"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="GitHub"
            >
              <Github className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </a>
            <ThemeToggle />
          </div>
        </header>

        {/* Content panel — Basalt B-2 rounded panel */}
        <div className={cn("flex-1 px-2 pb-2 md:px-3 md:pb-3")}>
          <div className="h-full rounded-[16px] md:rounded-[20px] bg-card p-3 md:p-5 overflow-y-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
