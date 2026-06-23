"use client";

import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import type { ApiKeyListItem } from "@/viewmodels/useApiKeysViewModel";

function formatDate(date: Date | null): string {
  if (!date) return "从未使用";
  return new Date(date).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface ApiKeyRowProps {
  apiKey: ApiKeyListItem;
  onRevoke: (id: string) => unknown | Promise<unknown>;
}

function RevokeButton({
  id,
  onRevoke,
}: {
  id: string;
  onRevoke: (id: string) => unknown | Promise<unknown>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          data-testid={`revoke-key-${id}`}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          撤销
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>撤销 API Key</AlertDialogTitle>
          <AlertDialogDescription>
            确定要撤销此 API Key 吗？此操作不可撤消，使用此密钥的所有应用将立即失去访问权限。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onRevoke(id)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid={`confirm-revoke-${id}`}
          >
            撤销
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ApiKeyRow({ apiKey, onRevoke }: ApiKeyRowProps) {
  return (
    <div
      key={apiKey.id}
      className="flex items-center justify-between rounded-card bg-background p-3"
      data-testid={`key-item-${apiKey.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{apiKey.name}</span>
          <code className="text-xs text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
            {apiKey.prefix}...
          </code>
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {apiKey.scopes.split(",").map((scope) => (
            <Badge key={scope} variant="secondary" className="text-[10px]">
              {scope}
            </Badge>
          ))}
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span>创建于 {formatDate(apiKey.createdAt)}</span>
          <span>
            最后使用 {apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : "从未使用"}
          </span>
        </div>
      </div>

      <RevokeButton id={apiKey.id} onRevoke={onRevoke} />
    </div>
  );
}
