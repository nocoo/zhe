"use client";

import { useCallback, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

/** ViewModel for the dashboard layout — manages sidebar collapse and mobile drawer */
export function useDashboardLayoutViewModel() {
  const [collapsed, setCollapsedState] = useState(false);
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  const setCollapsed = useCallback((next: boolean) => setCollapsedState(next), []);
  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
    } else {
      setCollapsedState((prev) => !prev);
    }
  }, [isMobile]);

  const closeMobileSidebar = useCallback(() => {
    setMobileOpen(false);
  }, []);
  const setMobileOpenState = useCallback((open: boolean) => {
    setMobileOpen(open);
  }, []);

  return {
    collapsed,
    setCollapsed,
    isMobile,
    mobileOpen,
    toggleSidebar,
    closeMobileSidebar,
    setMobileOpen: setMobileOpenState,
  };
}
