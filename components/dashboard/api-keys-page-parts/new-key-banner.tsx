"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/utils";

async function handleCopy(text: string) {
  const ok = await copyToClipboard(text);
  if (ok) toast.success("已复制到剪贴板");
  else toast.error("复制失败");
}

/** One-time banner shown immediately after a key is created. */
export function NewKeyBanner({
  newKey,
  onDismiss,
}: {
  newKey: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="mb-4 rounded-card bg-warning/10 p-4"
      data-testid="new-key-banner"
    >
      <p className="mb-2 text-sm font-medium text-warning">
        请立即复制此密钥。关闭后将无法再次查看。
      </p>
      <div className="flex items-center gap-2">
        <code
          className="flex-1 rounded bg-accent px-2 py-1 text-xs break-all"
          data-testid="new-key-value"
        >
          {newKey}
        </code>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          onClick={() => handleCopy(newKey)}
          data-testid="copy-new-key-btn"
        >
          <Copy className="h-3.5 w-3.5" />
          复制
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          data-testid="dismiss-new-key-btn"
        >
          关闭
        </Button>
      </div>
    </div>
  );
}
