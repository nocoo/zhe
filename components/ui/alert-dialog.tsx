"use client";

import {
  AlertDialogContent as BasaltAlertDialogContent,
  AlertDialogDescription as BasaltAlertDialogDescription,
  AlertDialogTitle as BasaltAlertDialogTitle,
} from "@nocoo/basalt/components/alert-dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
} from "@nocoo/basalt/components/alert-dialog";

export function AlertDialogContent({
  className,
  ...props
}: ComponentProps<typeof BasaltAlertDialogContent>) {
  return <BasaltAlertDialogContent className={cn("flex flex-col gap-4", className)} {...props} />;
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof BasaltAlertDialogTitle>) {
  return (
    <BasaltAlertDialogTitle
      className={cn("text-lg leading-6 font-semibold", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof BasaltAlertDialogDescription>) {
  return <BasaltAlertDialogDescription className={cn("text-sm leading-5", className)} {...props} />;
}
