'use client';

import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createLink } from '@/actions/links';
import type { Link } from '@/lib/db/schema';

interface CreateLinkModalProps {
  siteUrl: string;
  onSuccess: (link: Link) => void;
}

export function CreateLinkModal({ siteUrl, onSuccess }: CreateLinkModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'simple' | 'custom'>('simple');
  const [url, setUrl] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await createLink({
      originalUrl: url,
      customSlug: mode === 'custom' ? customSlug : undefined,
    });

    setIsLoading(false);

    if (result.success && result.data) {
      onSuccess(result.data);
      setUrl('');
      setCustomSlug('');
      setIsOpen(false);
    } else {
      setError(result.error || 'Failed to create link');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          新建链接
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>创建短链接</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('simple')}
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                mode === 'simple'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              简单模式
            </button>
            <button
              type="button"
              onClick={() => setMode('custom')}
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                mode === 'custom'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              自定义 slug
            </button>
          </div>

          {/* URL input */}
          <div className="space-y-2">
            <Label htmlFor="url">原始链接</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com/very-long-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          {/* Custom slug input */}
          {mode === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="slug">自定义 slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  {siteUrl.replace(/^https?:\/\//, '')}/
                </span>
                <Input
                  id="slug"
                  type="text"
                  placeholder="my-custom-link"
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  pattern="^[a-zA-Z0-9_-]+$"
                  title="Only letters, numbers, hyphens, and underscores"
                  required={mode === 'custom'}
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Submit button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                创建中...
              </>
            ) : (
              '创建链接'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
