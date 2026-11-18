"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nocoo/basalt/components/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nocoo/basalt/components/dialog";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import type { BookmarkCardViewModel } from "@/viewmodels/useBookmarkCardViewModel";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { AnalyticsPanel } from "./link-card-parts/analytics-panel";
import { CardEditDialog } from "./link-card-parts/card-edit-dialog";

export function BookmarkCardDialogs({
  vm,
  link,
  tags,
  linkTags,
  folders,
  editCallbacks,
  animated = true,
}: {
  vm: BookmarkCardViewModel;
  link: Link;
  tags: Tag[];
  linkTags: LinkTag[];
  folders: Folder[];
  editCallbacks?: EditLinkCallbacks | undefined;
  animated?: boolean;
}) {
  const restoreFocus = () => vm.menuTrigger.current?.focus({ preventScroll: true });
  return (
    <>
      {vm.editing && editCallbacks && (
        <CardEditDialog
          source={vm.card}
          trigger={vm.menuTrigger}
          link={link}
          tags={tags}
          linkTags={linkTags}
          folders={folders}
          editCallbacks={editCallbacks}
          animated={animated}
          onClose={() => vm.setEditing(false)}
        />
      )}
      <Dialog
        open={vm.showAnalytics}
        onOpenChange={(open) => {
          if (!open) void vm.handleToggleAnalytics();
        }}
      >
        <DialogContent
          size="lg"
          className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
        >
          <DialogHeader>
            <DialogTitle>访问统计</DialogTitle>
            <DialogDescription>本站短链接的访问情况</DialogDescription>
          </DialogHeader>
          <AnalyticsPanel
            showAnalytics
            analyticsStats={vm.analyticsStats}
            isLoadingAnalytics={vm.isLoadingAnalytics}
            className="border-0 bg-transparent p-0"
          />
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={vm.confirmDelete}
        onOpenChange={(open) => {
          if (!vm.isDeleting) vm.setConfirmDelete(open);
        }}
      >
        <AlertDialogContent
          className="flex flex-col gap-4"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
          onEscapeKeyDown={(event) => {
            if (vm.isDeleting) event.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>删除收藏？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，将删除这条收藏及其已归档附件。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-words text-sm">{link.title || link.metaTitle || link.originalUrl}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={vm.isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={vm.isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void vm.handleDelete();
              }}
              className="bg-basalt-destructive text-basalt-destructive-foreground hover:bg-basalt-destructive/90"
            >
              {vm.isDeleting ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
