"use client";

import {
  DialogContent as BasaltDialogContent,
  DialogDescription as BasaltDialogDescription,
  DialogTitle as BasaltDialogTitle,
} from "@nocoo/basalt/components/dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from "@nocoo/basalt/components/dialog";

export function DialogContent({ className, ...props }: ComponentProps<typeof BasaltDialogContent>) {
  return <BasaltDialogContent className={cn("flex flex-col gap-4", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof BasaltDialogTitle>) {
  return (
    <BasaltDialogTitle className={cn("text-lg leading-6 font-semibold", className)} {...props} />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof BasaltDialogDescription>) {
  return <BasaltDialogDescription className={cn("text-sm leading-5", className)} {...props} />;
}
