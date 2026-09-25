"use client";

import { useRef } from "react";

export function useDialogReturnFocus() {
  const trigger = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      trigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (event: Event) => {
      if (trigger.current?.isConnected) {
        event.preventDefault();
        trigger.current.focus();
      }
    },
  };
}
