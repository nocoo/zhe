"use client";

import { Plus } from "lucide-react";
import { forwardRef } from "react";
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
  const action = useCurrentCreateAction();
  const { siteUrl, folders, tags, handleLinkCreated, handleTagCreated } = useDashboardService();
  return action ? (
    <CreateFab
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
      trigger={<CreateFab label="新建链接" />}
    />
  );
}
