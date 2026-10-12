import type { LucideIcon } from "lucide-react";

export interface BookmarkAction {
  id: string;
  label: string;
  icon: LucideIcon;
  placement: "toolbar" | "copy" | "menu" | "editor";
  run: () => void;
  disabled?: boolean | undefined;
  pending?: boolean | undefined;
  description?: string | undefined;
  destructive?: boolean;
}
