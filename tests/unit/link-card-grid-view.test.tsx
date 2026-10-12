// @vitest-environment happy-dom
import "../helpers/card-width";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridView } from "@/components/dashboard/link-card-parts/grid-view";
import type { Link } from "@/models/types";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img alt="" {...props} />,
}));

afterEach(cleanup);

const link: Link = {
  id: 1,
  userId: "u1",
  slug: "test-slug",
  originalUrl: "https://example.com/test",
  title: "Test Link",
  note: null,
  folderId: null,
  metaTitle: "Meta Title",
  metaDescription: "Meta Description",
  metaFavicon: "https://example.com/favicon.ico",
  screenshotUrl: null,
  clicks: 42,
  createdAt: new Date(1700000000000),
  expiresAt: null,
  isCustom: false,
  isHidden: false,
};

function renderGridView(overrides: Partial<React.ComponentProps<typeof GridView>> = {}) {
  return render(
    <GridView
      link={link}
      titleText="Test Title"
      showFaviconImage
      shortUrl="https://zhe.to/test-slug"
      screenshotUrl={null}
      faviconUrl={null}
      onFaviconError={vi.fn()}
      {...overrides}
    />,
  );
}

describe("GridView", () => {
  it("renders the preview, short link and description without card actions", () => {
    renderGridView();
    expect(screen.getByRole("link", { name: "打开原链接" })).toHaveAttribute(
      "href",
      link.originalUrl,
    );
    expect(screen.getByRole("link", { name: "/test-slug" })).toHaveAttribute(
      "href",
      "https://zhe.to/test-slug",
    );
    expect(screen.getByRole("button", { name: "查看收藏内容" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI 整理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制链接" })).not.toBeInTheDocument();
  });

  it("opens the original link by clicking the preview", () => {
    renderGridView();
    const anchor = screen.getByRole("link", { name: "打开原链接" });
    expect(anchor).toHaveAttribute("href", link.originalUrl);
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders screenshot before favicon", () => {
    renderGridView({
      screenshotUrl: "https://example.com/shot.png",
      faviconUrl: "https://example.com/favicon.png",
    });
    expect(screen.getByAltText("链接预览")).toHaveAttribute("src", "https://example.com/shot.png");
  });

  it("renders the X details action when supplied", () => {
    const onOpenDetails = vi.fn();
    renderGridView({ onOpenDetails });
    fireEvent.click(screen.getByRole("button", { name: "查看帖子详情" }));
    expect(onOpenDetails).toHaveBeenCalledOnce();
  });
});
