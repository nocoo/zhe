"use client";

import { LinkCard } from "./link-card";
import { CreateLinkModal } from "./create-link-modal";
import { Link2 } from "lucide-react";
import { useLinksViewModel } from "@/viewmodels/useLinksViewModel";
import type { Link, Folder } from "@/models/types";

interface LinksListProps {
  initialLinks: Link[];
  siteUrl: string;
  folders?: Folder[];
}

export function LinksList({ initialLinks, siteUrl, folders = [] }: LinksListProps) {
  const { links, handleLinkCreated, handleLinkDeleted } = useLinksViewModel(
    initialLinks,
    siteUrl
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">全部链接</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            共 {links.length} 条链接
          </p>
        </div>
        <CreateLinkModal siteUrl={siteUrl} onSuccess={handleLinkCreated} folders={folders} />
      </div>

      {/* Content */}
      {links.length === 0 ? (
        <div className="rounded-[14px] border-0 bg-secondary shadow-none p-12 text-center">
          <Link2
            className="w-10 h-10 mx-auto text-muted-foreground mb-4"
            strokeWidth={1.5}
          />
          <p className="text-sm text-muted-foreground mb-2">暂无链接</p>
          <p className="text-xs text-muted-foreground mb-6">
            点击上方按钮创建您的第一个短链接
          </p>
          <CreateLinkModal siteUrl={siteUrl} onSuccess={handleLinkCreated} folders={folders} />
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              siteUrl={siteUrl}
              onDelete={handleLinkDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
