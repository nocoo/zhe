"use client";

import { DialogContent as BasaltDialogContent } from "@nocoo/basalt/components/dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@nocoo/basalt/components/dialog";

export function DialogContent({ className, ...props }: ComponentProps<typeof BasaltDialogContent>) {
  return <BasaltDialogContent className={cn("flex flex-col gap-4", className)} {...props} />;
}
