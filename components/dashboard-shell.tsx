"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDashboardLayoutViewModel } from "@/viewmodels/useDashboardLayoutViewModel";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

interface DashboardShellProps {
  children: React.ReactNode;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  signOutAction: () => Promise<void>;
}

export function DashboardShell({
  children,
  user,
  signOutAction,
}: DashboardShellProps) {
  const { collapsed, isMobile, mobileOpen, toggleSidebar, closeMobileSidebar } =
    useDashboardLayoutViewModel();

  return (
    <TooltipProvider>
      <div className="flex min-h-screen w-full bg-background">
        {/* Desktop sidebar */}
        {!isMobile && (
          <AppSidebar
            collapsed={collapsed}
            onToggle={toggleSidebar}
            user={user}
            signOutAction={signOutAction}
          />
        )}

        {/* Mobile overlay */}
        {isMobile && mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={closeMobileSidebar}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-[260px]">
              <AppSidebar
                collapsed={false}
                onToggle={closeMobileSidebar}
                user={user}
                signOutAction={signOutAction}
              />
            </div>
          </>
        )}

        <main className="flex-1 flex flex-col min-h-screen min-w-0">
          {/* Header */}
          <header className="flex h-14 items-center justify-between px-4 md:px-6 shrink-0">
            <div className="flex items-center gap-3">
              {isMobile && (
                <button
                  onClick={toggleSidebar}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Menu className="h-5 w-5" strokeWidth={1.5} />
                </button>
              )}
              <h1 className="text-lg md:text-xl font-semibold text-foreground">
                链接管理
              </h1>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
            </div>
          </header>

          {/* Content panel — Basalt L1 rounded panel */}
          <div className={cn("flex-1 px-2 pb-2 md:px-3 md:pb-3")}>
            <div className="h-full rounded-[16px] md:rounded-[20px] bg-card p-3 md:p-5 overflow-y-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
