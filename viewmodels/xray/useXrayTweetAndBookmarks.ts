"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchTweet, fetchBookmarks } from "@/actions/xray";
import { createLink } from "@/actions/links";
import { extractTweetId, type XrayTweetResponse, type XrayTweetData } from "@/models/xray";

/** Tweet test state — input, extracted ID, fetch result, raw-JSON toggle. */
export function useXrayTweetTest() {
  const [tweetInput, setTweetInput] = useState("");
  const [extractedId, setExtractedId] = useState<string | null>(null);
  const [tweetResult, setTweetResult] = useState<XrayTweetResponse | null>(null);
  const [isMockResult, setIsMockResult] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setExtractedId(extractTweetId(tweetInput));
  }, [tweetInput]);

  const handleFetchTweet = useCallback(async () => {
    setIsFetching(true);
    setFetchError(null);
    setTweetResult(null);
    setIsMockResult(false);
    try {
      const result = await fetchTweet(tweetInput);
      if (!result.success) {
        setFetchError(result.error ?? "获取失败");
        return;
      }
      if (result.data) {
        setTweetResult(result.data);
        setIsMockResult(result.mock ?? false);
      }
    } finally {
      setIsFetching(false);
    }
  }, [tweetInput]);

  const toggleRawJson = useCallback(() => setShowRawJson((prev) => !prev), []);

  return {
    tweetInput, setTweetInput,
    extractedId,
    tweetResult,
    isMockResult,
    showRawJson,
    isFetching,
    fetchError,
    handleFetchTweet,
    toggleRawJson,
  };
}

/** Bookmarks state — fetch list + add-to-links per-tweet. */
export function useXrayBookmarks() {
  const [bookmarks, setBookmarks] = useState<XrayTweetData[]>([]);
  const [isFetchingBookmarks, setIsFetchingBookmarks] = useState(false);
  const [bookmarksError, setBookmarksError] = useState<string | null>(null);
  const [addingBookmarkIds, setAddingBookmarkIds] = useState<Set<string>>(new Set());
  const [addedBookmarkIds, setAddedBookmarkIds] = useState<Set<string>>(new Set());

  const handleFetchBookmarks = useCallback(async () => {
    setIsFetchingBookmarks(true);
    setBookmarksError(null);
    try {
      const result = await fetchBookmarks();
      if (!result.success) {
        setBookmarksError(result.error ?? "获取书签失败");
        return;
      }
      if (result.data) setBookmarks(result.data.data);
    } finally {
      setIsFetchingBookmarks(false);
    }
  }, []);

  const handleAddBookmark = useCallback(async (tweetUrl: string, tweetId: string) => {
    setAddingBookmarkIds((prev) => new Set(prev).add(tweetId));
    try {
      const result = await createLink({ originalUrl: tweetUrl });
      if (result.success) {
        setAddedBookmarkIds((prev) => new Set(prev).add(tweetId));
      }
    } finally {
      setAddingBookmarkIds((prev) => {
        const next = new Set(prev);
        next.delete(tweetId);
        return next;
      });
    }
  }, []);

  return {
    bookmarks,
    isFetchingBookmarks,
    bookmarksError,
    addingBookmarkIds,
    addedBookmarkIds,
    handleFetchBookmarks,
    handleAddBookmark,
  };
}
