'use client';

import { useState } from 'react';
import { Copy, ExternalLink, Trash2, Check, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatNumber, copyToClipboard } from '@/lib/utils';
import { deleteLink, getAnalyticsStats } from '@/actions/links';
import type { Link } from '@/lib/db/schema';

interface AnalyticsStats {
  totalClicks: number;
  uniqueCountries: string[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
}

interface LinkCardProps {
  link: Link;
  siteUrl: string;
  onDelete: (id: number) => void;
}

export function LinkCard({ link, siteUrl, onDelete }: LinkCardProps) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsStats, setAnalyticsStats] = useState<AnalyticsStats | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  const shortUrl = `${siteUrl}/${link.slug}`;

  const handleToggleAnalytics = async () => {
    const newShowState = !showAnalytics;
    setShowAnalytics(newShowState);

    // Load analytics if expanding and not already loaded
    if (newShowState && !analyticsStats && !isLoadingAnalytics) {
      setIsLoadingAnalytics(true);
      try {
        const result = await getAnalyticsStats(link.id);
        if (result.success && result.data) {
          setAnalyticsStats(result.data);
        }
      } catch (error) {
        console.error('Failed to load analytics:', error);
      } finally {
        setIsLoadingAnalytics(false);
      }
    }
  };

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
            <button 
              onClick={handleToggleAnalytics}
              className="flex items-center gap-1 hover:text-gray-400 transition-colors"
            >
              <BarChart3 className="w-3 h-3" />
              <span>{formatNumber(link.clicks ?? 0)} clicks</span>
              {showAnalytics ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
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

      {/* Analytics Panel */}
      {showAnalytics && analyticsStats && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {/* Countries */}
            <div>
              <h4 className="text-gray-500 text-xs uppercase tracking-wide mb-2">Countries</h4>
              {analyticsStats.uniqueCountries.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {analyticsStats.uniqueCountries.slice(0, 5).map((country) => (
                    <span
                      key={country}
                      className="bg-gray-800 px-2 py-0.5 rounded text-gray-300 text-xs"
                    >
                      {country}
                    </span>
                  ))}
                  {analyticsStats.uniqueCountries.length > 5 && (
                    <span className="text-gray-500 text-xs">
                      +{analyticsStats.uniqueCountries.length - 5} more
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-gray-600 text-xs">No data</span>
              )}
            </div>

            {/* Devices */}
            <div>
              <h4 className="text-gray-500 text-xs uppercase tracking-wide mb-2">Devices</h4>
              {Object.keys(analyticsStats.deviceBreakdown).length > 0 ? (
                <div className="space-y-1">
                  {Object.entries(analyticsStats.deviceBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([device, count]) => (
                      <div key={device} className="flex justify-between text-xs">
                        <span className="text-gray-400 capitalize">{device}</span>
                        <span className="text-gray-500">{count}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <span className="text-gray-600 text-xs">No data</span>
              )}
            </div>

            {/* Browsers */}
            <div>
              <h4 className="text-gray-500 text-xs uppercase tracking-wide mb-2">Browsers</h4>
              {Object.keys(analyticsStats.browserBreakdown).length > 0 ? (
                <div className="space-y-1">
                  {Object.entries(analyticsStats.browserBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([browser, count]) => (
                      <div key={browser} className="flex justify-between text-xs">
                        <span className="text-gray-400">{browser}</span>
                        <span className="text-gray-500">{count}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <span className="text-gray-600 text-xs">No data</span>
              )}
            </div>

            {/* OS */}
            <div>
              <h4 className="text-gray-500 text-xs uppercase tracking-wide mb-2">Operating Systems</h4>
              {Object.keys(analyticsStats.osBreakdown).length > 0 ? (
                <div className="space-y-1">
                  {Object.entries(analyticsStats.osBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([os, count]) => (
                      <div key={os} className="flex justify-between text-xs">
                        <span className="text-gray-400">{os}</span>
                        <span className="text-gray-500">{count}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <span className="text-gray-600 text-xs">No data</span>
              )}
            </div>
          </div>
        </div>
      )}

      {showAnalytics && !analyticsStats && !isLoadingAnalytics && (
        <div className="mt-4 pt-4 border-t border-gray-800 text-center text-gray-500 text-sm">
          No analytics data available yet
        </div>
      )}

      {showAnalytics && isLoadingAnalytics && (
        <div className="mt-4 pt-4 border-t border-gray-800 text-center text-gray-500 text-sm">
          Loading analytics...
        </div>
      )}
    </div>
  );
}
