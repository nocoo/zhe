"use client";

import { Plus } from "lucide-react";
import { forwardRef, useEffect, useRef } from "react";
import { CreateLinkModal } from "@/components/dashboard/create-link-modal";
import { IconAction } from "@/components/dashboard/icon-action";
import type { ButtonProps } from "@/components/ui/button";
import { useCurrentCreateAction } from "@/contexts/create-action";
import { useDashboardService } from "@/contexts/dashboard-service";

const CreateFab = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(
  function CreateFab(props, ref) {
    return (
      <IconAction
        {...props}
        ref={ref}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          props.onClick?.(event);
        }}
        variant="default"
        size="icon"
        data-testid="global-create"
        aria-keyshortcuts="Meta+Shift+K Control+Shift+K"
        shortcut="⌘⇧K / Ctrl+Shift+K"
        className="global-create-fab fixed z-30 size-14 rounded-full shadow-lg transition-[transform,opacity] duration-200 hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:transform-none [&_svg]:size-6 data-[state=open]:[&_svg]:rotate-45 aria-expanded:[&_svg]:rotate-45"
      >
        <Plus
          aria-hidden
          className="transition-transform duration-200 motion-reduce:transition-none"
        />
      </IconAction>
    );
  },
);

export function GlobalCreateAction() {
  const trigger = useRef<HTMLButtonElement>(null);
  const action = useCurrentCreateAction();
  const { siteUrl, folders, tags, handleLinkCreated, handleTagCreated } = useDashboardService();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        !(event.metaKey || event.ctrlKey) ||
        !event.shiftKey ||
        event.altKey ||
        event.isComposing ||
        event.repeat ||
        event.defaultPrevented ||
        trigger.current?.disabled ||
        trigger.current?.getAttribute("aria-expanded") === "true" ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      ) {
        return;
      }
      event.preventDefault();
      trigger.current?.click();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return action ? (
    <CreateFab
      ref={trigger}
      label={action.label}
      onClick={action.onClick}
      disabled={action.disabled}
      aria-expanded={action.expanded}
    />
  ) : (
    <CreateLinkModal
      siteUrl={siteUrl}
      folders={folders}
      tags={tags}
      onSuccess={handleLinkCreated}
      onTagCreated={handleTagCreated}
      trigger={<CreateFab ref={trigger} label="新建链接" />}
    />
  );
}
