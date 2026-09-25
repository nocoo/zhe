// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { XBookmark } from "@/lib/connector/jobs";
import { makeLink } from "../fixtures";

vi.mock("@/actions/connector", () => ({
  loadXBookmarks: async () => ({ success: true, data: [] }),
  retryXBookmarkAction: async () => ({ success: true }),
}));

vi.mock("next/image", () => ({
  default: (props: { alt?: string; src?: string }) => <img alt={props.alt} src={props.src} />,
}));

import { ListView } from "@/components/dashboard/link-card-parts/list-view";

const xBookmark: XBookmark = {
  linkId: 1,
  tweet: null,
  state: "complete",
  errorCode: null,
  updatedAt: 1,
};

function baseProps() {
  return {
    link: makeLink({ id: 1 }),
    titleText: "Example link",
    showFaviconImage: false,
    shortUrl: "https://zhe.to/abc123",
    screenshotUrl: null as string | null,
    faviconUrl: null as string | null,
    cardTags: [],
    copied: false,
    copiedOriginalUrl: false,
    isEditing: false,
    canDeleteScreenshot: false,
    isDeletingScreenshot: false,
    isRefreshingMetadata: false,
    showAnalytics: false,
    onFaviconError: vi.fn(),
    onCopy: vi.fn(),
    onCopyOriginalUrl: vi.fn(),
    onDeleteScreenshot: vi.fn(),
    onToggleEdit: vi.fn(),
    onToggleAnalytics: vi.fn(),
    onRefreshMetadata: vi.fn(),
  };
}

describe("ListView", () => {
  it("falls back to the X icon when a captured post has no screenshot", async () => {
    render(<ListView {...baseProps()} onOpenDetails={vi.fn()} xBookmark={xBookmark} />);
    expect(screen.getByRole("button", { name: "查看 X 帖子" })).toBeInTheDocument();
    expect(screen.queryByAltText("X 帖子预览")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "更多收藏操作" }));
    expect(screen.getByRole("menuitem", { name: "查看帖子详情" })).toBeInTheDocument();
  });

  it("renders zero clicks for links without click data", () => {
    render(<ListView {...baseProps()} link={makeLink({ id: 2, clicks: null })} />);
    expect(screen.getByTestId("click-count")).toHaveTextContent("0");
  });

  it("explains the missing AI configuration on the disabled suggest control", async () => {
    const onSuggest = vi.fn();
    const user = userEvent.setup();
    render(<ListView {...baseProps()} onSuggest={onSuggest} suggestDisabled={true} />);
    await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
    const suggest = screen.getByRole("menuitem", { name: /AI 整理/ });
    expect(suggest).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("请先在设置中配置 AI")).toBeInTheDocument();
    expect(onSuggest).not.toHaveBeenCalled();
  });

  it("keeps the suggest control available when no AI flag was supplied", async () => {
    const onSuggest = vi.fn();
    const user = userEvent.setup();
    render(<ListView {...baseProps()} onSuggest={onSuggest} />);
    await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
    const suggest = screen.getByRole("menuitem", { name: /AI 整理/ });
    expect(suggest).toBeEnabled();
    await user.click(suggest);
    expect(onSuggest).toHaveBeenCalledTimes(1);
    expect(within(document.body).queryByText("请先在设置中配置 AI")).not.toBeInTheDocument();
  });
});
