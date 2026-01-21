'use client';

import { useState } from 'react';
import { LinkCard } from './link-card';
import { CreateLinkModal } from './create-link-modal';
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
          <p className="text-gray-500 text-sm mt-1">
            {links.length} {links.length === 1 ? 'link' : 'links'}
          </p>
        </div>
        <CreateLinkModal siteUrl={siteUrl} onSuccess={handleLinkCreated} />
      </div>

      {links.length === 0 ? (
        <div className="border border-gray-800 border-dashed rounded-lg p-12 text-center">
          <p className="text-gray-500 mb-4">No links yet</p>
          <p className="text-gray-600 text-sm">
            Create your first short link to get started
          </p>
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
