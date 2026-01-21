'use client';

import { useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Create Link
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">Create New Link</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('simple')}
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                mode === 'simple'
                  ? 'bg-white text-black'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setMode('custom')}
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                mode === 'custom'
                  ? 'bg-white text-black'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Custom Slug
            </button>
          </div>

          {/* URL input */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Destination URL
            </label>
            <Input
              type="url"
              placeholder="https://example.com/very-long-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          {/* Custom slug input */}
          {mode === 'custom' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Custom Slug
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">
                  {siteUrl.replace(/^https?:\/\//, '')}/
                </span>
                <Input
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
            <p className="text-sm text-red-500">{error}</p>
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
                Creating...
              </>
            ) : (
              'Create Link'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
