"use client";

import { useState, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

/** ViewModel for the dashboard layout — manages sidebar collapse and mobile drawer */
export function useDashboardLayoutViewModel() {
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
    } else {
      setCollapsed((prev) => !prev);
    }
  }, [isMobile]);

  const closeMobileSidebar = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return {
    collapsed,
    isMobile,
    mobileOpen,
    toggleSidebar,
    closeMobileSidebar,
  };
}
