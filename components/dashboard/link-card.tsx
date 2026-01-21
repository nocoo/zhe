'use client';

import { useState } from 'react';
import { Copy, ExternalLink, Trash2, Check, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
    <Card className="group hover:shadow-md transition-all duration-200 border-border/50 hover:border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <a
                href={shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground font-medium hover:underline truncate"
              >
                {shortUrl.replace(/^https?:\/\//, '')}
              </a>
              {link.isCustom && (
                <Badge variant="secondary" className="shrink-0 text-xs">
                  custom
                </Badge>
              )}
            </div>

            <a
              href={link.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground truncate block"
            >
              {link.originalUrl}
            </a>

            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <button
                onClick={handleToggleAnalytics}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <BarChart3 className="w-3 h-3" />
                <span>{formatNumber(link.clicks ?? 0)} 次点击</span>
                {showAnalytics ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
              <span>{formatDate(link.createdAt)}</span>
              {link.expiresAt && (
                <span className="text-destructive">
                  Expires {formatDate(link.expiresAt)}
                </span>
              )}
            </div>
          </div>

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
              className="h-10 w-10 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Open link"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  删除链接
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {showAnalytics && analyticsStats && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <h4 className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Countries</h4>
                {analyticsStats.uniqueCountries.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {analyticsStats.uniqueCountries.slice(0, 5).map((country) => (
                      <span
                        key={country}
                        className="bg-secondary px-2 py-0.5 rounded text-xs"
                      >
                        {country}
                      </span>
                    ))}
                    {analyticsStats.uniqueCountries.length > 5 && (
                      <span className="text-muted-foreground text-xs">
                        +{analyticsStats.uniqueCountries.length - 5} more
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">No data</span>
                )}
              </div>

              <div>
                <h4 className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Devices</h4>
                {Object.keys(analyticsStats.deviceBreakdown).length > 0 ? (
                  <div className="space-y-1">
                    {Object.entries(analyticsStats.deviceBreakdown)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 3)
                      .map(([device, count]) => (
                        <div key={device} className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize">{device}</span>
                          <span className="text-muted-foreground/70">{count}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">No data</span>
                )}
              </div>

              <div>
                <h4 className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Browsers</h4>
                {Object.keys(analyticsStats.browserBreakdown).length > 0 ? (
                  <div className="space-y-1">
                    {Object.entries(analyticsStats.browserBreakdown)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 3)
                      .map(([browser, count]) => (
                        <div key={browser} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{browser}</span>
                          <span className="text-muted-foreground/70">{count}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">No data</span>
                )}
              </div>

              <div>
                <h4 className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Operating Systems</h4>
                {Object.keys(analyticsStats.osBreakdown).length > 0 ? (
                  <div className="space-y-1">
                    {Object.entries(analyticsStats.osBreakdown)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 3)
                      .map(([os, count]) => (
                        <div key={os} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{os}</span>
                          <span className="text-muted-foreground/70">{count}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">No data</span>
                )}
              </div>
            </div>
          </div>
        )}

        {showAnalytics && !analyticsStats && !isLoadingAnalytics && (
          <div className="mt-4 pt-4 border-t border-border text-center text-muted-foreground text-sm">
            No analytics data available yet
          </div>
        )}

        {showAnalytics && isLoadingAnalytics && (
          <div className="mt-4 pt-4 border-t border-border text-center text-muted-foreground text-sm">
            Loading analytics...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
