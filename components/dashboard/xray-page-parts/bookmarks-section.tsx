"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookmarkIcon, Loader2, Plus, Check, RefreshCw, AlertTriangle } from "lucide-react";
import { type XrayViewModel } from "@/viewmodels/useXrayViewModel";
import { TweetCard } from "./tweet-card";

export function BookmarksSection({ vm }: { vm: XrayViewModel }) {
  return (
    <Card>
      <CardHeader className="px-4 py-3 md:px-5 md:py-4">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
              <BookmarkIcon className="h-4 w-4 text-warning" strokeWidth={1.5} />
            </div>
            <span>我的书签</span>
            {vm.bookmarks.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {vm.bookmarks.length}
              </Badge>
            )}
          </div>
          <Button
            onClick={vm.handleFetchBookmarks}
            disabled={!vm.isConfigured || vm.isFetchingBookmarks}
            variant="outline"
            size="sm"
          >
            {vm.isFetchingBookmarks ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {vm.isFetchingBookmarks ? "加载中" : "加载书签"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
        {!vm.isConfigured ? (
          <p className="text-sm text-muted-foreground">
            请先在上方配置 xray API，然后即可加载您的 X 书签。
          </p>
        ) : vm.bookmarksError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
            <p className="text-sm text-destructive">
              {vm.bookmarksError}
            </p>
          </div>
        ) : vm.bookmarks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            点击「加载书签」获取您的 X 书签列表。
          </p>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
            {vm.bookmarks.map((tweet) => (
              <div key={tweet.id} className="mb-4 break-inside-avoid">
                <TweetCard
                  tweet={tweet}
                  action={
                    <BookmarkAddButton
                      tweetId={tweet.id}
                      tweetUrl={tweet.url}
                      isAdding={vm.addingBookmarkIds.has(tweet.id)}
                      isAdded={vm.addedBookmarkIds.has(tweet.id)}
                      onAdd={vm.handleAddBookmark}
                    />
                  }
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bookmark add button — handles adding a tweet to the link system
// ---------------------------------------------------------------------------

function BookmarkAddButton({
  tweetId,
  tweetUrl,
  isAdding,
  isAdded,
  onAdd,
}: {
  tweetId: string;
  tweetUrl: string;
  isAdding: boolean;
  isAdded: boolean;
  onAdd: (tweetUrl: string, tweetId: string) => void;
}) {
  if (isAdded) {
    return (
      <Button variant="ghost" size="sm" disabled className="text-success">
        <Check className="mr-1.5 h-4 w-4" />
        已收录
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isAdding}
      onClick={() => onAdd(tweetUrl, tweetId)}
    >
      {isAdding ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <Plus className="mr-1.5 h-4 w-4" />
      )}
      {isAdding ? "收录中" : "收录"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Tweet card — renders a single tweet with author, text, media, metrics
// ---------------------------------------------------------------------------

