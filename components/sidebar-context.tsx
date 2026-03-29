"use client";

import { createContext, useContext } from "react";
import { useDashboardLayoutViewModel } from "@/viewmodels/useDashboardLayoutViewModel";

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
  isMobile: boolean;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const vm = useDashboardLayoutViewModel();
  return (
    <SidebarContext.Provider
      value={{
        collapsed: vm.collapsed,
        toggle: vm.toggleSidebar,
        setCollapsed: () => {
          /* reserved — toggle handles both directions */
        },
        isMobile: vm.isMobile,
        mobileOpen: vm.mobileOpen,
        setMobileOpen: (open: boolean) => {
          if (!open) vm.closeMobileSidebar();
          else vm.toggleSidebar();
        },
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
