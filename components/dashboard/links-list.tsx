'use client';

import { useState } from 'react';
import { LinkCard } from './link-card';
import { CreateLinkModal } from './create-link-modal';
import { Button } from '@/components/ui/button';
import { Plus, Link2 } from 'lucide-react';
import type { Link } from '@/lib/db/schema';

interface LinksListProps {
  initialLinks: Link[];
  siteUrl: string;
}

export function LinksList({ initialLinks, siteUrl }: LinksListProps) {
  const [links, setLinks] = useState<Link[]>(initialLinks);

  const handleLinkCreated = (newLink: Link) => {
    setLinks((prev) => [newLink, ...prev]);
  };

  const handleLinkDeleted = (linkId: number) => {
    setLinks((prev) => prev.filter((link) => link.id !== linkId));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Links</h1>
          <p className="text-muted-foreground text-sm mt-1">
            共 {links.length} 条链接
          </p>
        </div>
        <CreateLinkModal siteUrl={siteUrl} onSuccess={handleLinkCreated} />
      </div>

      {links.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <Link2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground mb-4">暂无链接</p>
          <p className="text-muted-foreground/70 text-sm mb-4">
            点击上方按钮创建您的第一个短链接
          </p>
          <CreateLinkModal siteUrl={siteUrl} onSuccess={handleLinkCreated} />
        </div>
      ) : (
        <div className="space-y-3">
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
