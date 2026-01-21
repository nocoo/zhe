'use client';

import { useState } from 'react';
import { Copy, ExternalLink, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatNumber, copyToClipboard } from '@/lib/utils';
import { deleteLink } from '@/actions/links';
import type { Link } from '@/lib/db/schema';

interface LinkCardProps {
  link: Link;
  siteUrl: string;
  onDelete: (id: number) => void;
}

export function LinkCard({ link, siteUrl, onDelete }: LinkCardProps) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const shortUrl = `${siteUrl}/${link.slug}`;

  const handleCopy = async () => {
    const success = await copyToClipboard(shortUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this link?')) return;
    
    setIsDeleting(true);
    const result = await deleteLink(link.id);
    if (result.success) {
      onDelete(link.id);
    } else {
      alert(result.error || 'Failed to delete link');
    }
    setIsDeleting(false);
  };

  return (
    <div className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Short URL */}
          <div className="flex items-center gap-2 mb-1">
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white font-medium hover:underline truncate"
            >
              {shortUrl.replace(/^https?:\/\//, '')}
            </a>
            {link.isCustom && (
              <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400">
                custom
              </span>
            )}
          </div>

          {/* Original URL */}
          <a
            href={link.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-gray-400 truncate block"
          >
            {link.originalUrl}
          </a>

          {/* Meta info */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
            <span>{formatNumber(link.clicks ?? 0)} clicks</span>
            <span>{formatDate(link.createdAt)}</span>
            {link.expiresAt && (
              <span className="text-yellow-600">
                Expires {formatDate(link.expiresAt)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            title="Copy link"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
                    <a
            href={link.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 w-10 inline-flex items-center justify-center rounded-md hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            title="Open link"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={isDeleting}
            title="Delete link"
            className="hover:text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
