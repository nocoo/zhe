"use client";

/**
 * Confirm-and-cascade delete dialog. Doc rule (`docs/21-todos-feature.md`
 * — "Row hover: 3-dot menu"): the body must state the subtree count when
 * N > 0 so the user understands cascade delete before hitting the
 * destructive action.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface TodoDeleteConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todoTitle: string | null;
  descendantCount: number;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function TodoDeleteConfirm({
  open,
  onOpenChange,
  todoTitle,
  descendantCount,
  onConfirm,
  isDeleting,
}: TodoDeleteConfirmProps) {
  const label = todoTitle ?? "Untitled";
  const message =
    descendantCount > 0
      ? `Delete “${label}” and its ${descendantCount} descendant${
          descendantCount === 1 ? "" : "s"
        }? This cannot be undone.`
      : `Delete “${label}”? This cannot be undone.`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete todo</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Prevent AlertDialog's default close-then-run so the caller
              // gets a chance to keep the dialog open on error.
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
