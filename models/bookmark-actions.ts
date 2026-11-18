import type { LucideIcon } from "@nocoo/basalt/icons";

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
