"use client";

import { useXrayConfig, type XrayInitialData, type UrlMode } from "./xray/useXrayConfig";
import { useXrayTweetTest, useXrayBookmarks } from "./xray/useXrayTweetAndBookmarks";

export type { XrayInitialData, UrlMode };
export type XrayViewModel = ReturnType<typeof useXrayViewModel>;

/**
 * xray viewmodel — composed of three concerns: config, tweet test, bookmarks.
 * When `initialData` is provided (SSR prefetch), skips the client-side config fetch.
 */
export function useXrayViewModel(initialData?: XrayInitialData) {
  const config = useXrayConfig(initialData);
  const tweet = useXrayTweetTest();
  const bookmarks = useXrayBookmarks();

  return {
    // Config
    apiUrl: config.apiUrl,
    setApiUrl: config.setApiUrl,
    urlMode: config.urlMode,
    handleUrlModeChange: config.handleUrlModeChange,
    apiToken: config.apiToken,
    setApiToken: config.setApiToken,
    maskedToken: config.maskedToken,
    isConfigured: config.isConfigured,
    isEditing: config.isEditing,

    // Loading
    isLoading: config.isLoading,
    isSaving: config.isSaving,
    isFetching: tweet.isFetching,

    // Test
    tweetInput: tweet.tweetInput,
    setTweetInput: tweet.setTweetInput,
    extractedId: tweet.extractedId,
    tweetResult: tweet.tweetResult,
    isMockResult: tweet.isMockResult,
    showRawJson: tweet.showRawJson,

    // Errors
    error: config.error,
    fetchError: tweet.fetchError,

    // Bookmarks
    bookmarks: bookmarks.bookmarks,
    isFetchingBookmarks: bookmarks.isFetchingBookmarks,
    bookmarksError: bookmarks.bookmarksError,
    addingBookmarkIds: bookmarks.addingBookmarkIds,
    addedBookmarkIds: bookmarks.addedBookmarkIds,

    // Actions
    handleSave: config.handleSave,
    startEditing: config.startEditing,
    cancelEditing: config.cancelEditing,
    handleFetchTweet: tweet.handleFetchTweet,
    toggleRawJson: tweet.toggleRawJson,
    handleFetchBookmarks: bookmarks.handleFetchBookmarks,
    handleAddBookmark: bookmarks.handleAddBookmark,
  };
}
