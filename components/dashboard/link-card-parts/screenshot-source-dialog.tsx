"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, ImageIcon } from "lucide-react";
import type { ScreenshotSource } from "@/models/links";

/** Modal for picking which provider to call when refreshing the screenshot. */
export function ScreenshotSourceDialog({
  open,
  onOpenChange,
  onSelect,
  isFetching,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (source: ScreenshotSource) => void;
  isFetching: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>选择截图来源</DialogTitle>
          <DialogDescription>
            选择一个服务来抓取网页预览截图
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Button
            variant="outline"
            className="justify-start gap-3 h-auto py-3 px-4"
            onClick={() => onSelect("microlink")}
            disabled={isFetching}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent shrink-0">
              <Camera className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Microlink</p>
              <p className="text-xs text-muted-foreground">
                通用截图服务，支持大部分网站
              </p>
            </div>
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-3 h-auto py-3 px-4"
            onClick={() => onSelect("screenshotDomains")}
            disabled={isFetching}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent shrink-0">
              <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Screenshot Domains</p>
              <p className="text-xs text-muted-foreground">
                基于域名的截图服务
              </p>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
