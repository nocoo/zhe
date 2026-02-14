"use client";

import type { LucideProps } from "lucide-react";
import {
  Folder,
  FolderOpen,
  Star,
  Heart,
  Bookmark,
  Tag,
  Zap,
  Flame,
  Rocket,
  Globe,
  Briefcase,
  Code,
  Coffee,
  Music,
  Image,
  Film,
  Book,
  GraduationCap,
  Gamepad2,
  Palette,
  ShoppingBag,
  Gift,
  Megaphone,
  Lightbulb,
} from "lucide-react";
import type { FolderIconName } from "@/models/folders";

/** Synchronous map from kebab-case icon name to Lucide component */
const ICON_MAP: Record<FolderIconName, React.ComponentType<LucideProps>> = {
  folder: Folder,
  "folder-open": FolderOpen,
  star: Star,
  heart: Heart,
  bookmark: Bookmark,
  tag: Tag,
  zap: Zap,
  flame: Flame,
  rocket: Rocket,
  globe: Globe,
  briefcase: Briefcase,
  code: Code,
  coffee: Coffee,
  music: Music,
  image: Image,
  film: Film,
  book: Book,
  "graduation-cap": GraduationCap,
  "gamepad-2": Gamepad2,
  palette: Palette,
  "shopping-bag": ShoppingBag,
  gift: Gift,
  megaphone: Megaphone,
  lightbulb: Lightbulb,
};

interface FolderIconProps extends LucideProps {
  /** Kebab-case icon name from FOLDER_ICONS */
  name: string;
}

/** Render a Lucide icon by its kebab-case name. Falls back to Folder icon. */
export function FolderIcon({ name, ...props }: FolderIconProps) {
  const Icon = ICON_MAP[name as FolderIconName] ?? Folder;
  return <Icon {...props} />;
}
