"use client";

import { AlertDialogContent as BasaltAlertDialogContent } from "@nocoo/basalt/components/alert-dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@nocoo/basalt/components/alert-dialog";

export function AlertDialogContent({
  className,
  ...props
}: ComponentProps<typeof BasaltAlertDialogContent>) {
  return <BasaltAlertDialogContent className={cn("flex flex-col gap-4", className)} {...props} />;
}
