// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListView } from "@/components/dashboard/link-card-parts/list-view";
import { makeLink } from "../fixtures";

function props(overrides: Partial<React.ComponentProps<typeof ListView>> = {}) {
  return {
    link: makeLink({ id: 1 }),
    titleText: "Example link",
    showFaviconImage: false,
    shortUrl: "https://zhe.to/abc123",
    screenshotUrl: null,
    faviconUrl: null,
    onFaviconError: vi.fn(),
    ...overrides,
  };
}

describe("ListView", () => {
  it("renders source and short links plus the description preview", () => {
    render(<ListView {...props()} />);
    expect(screen.getByRole("link", { name: "打开原链接" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getByRole("link", { name: "/abc123" })).toHaveAttribute(
      "href",
      "https://zhe.to/abc123",
    );
    expect(screen.getByRole("button", { name: "查看收藏内容" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更多收藏操作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制链接" })).not.toBeInTheDocument();
  });

  it("opens captured X details without embedding card actions", () => {
    const onOpenDetails = vi.fn();
    render(<ListView {...props({ onOpenDetails })} />);
    screen.getByRole("button", { name: "查看帖子详情" }).click();
    expect(onOpenDetails).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "更多收藏操作" })).not.toBeInTheDocument();
  });

  it("uses screenshot then favicon as the preview image", () => {
    const { rerender } = render(
      <ListView {...props({ faviconUrl: "https://cdn.test/favicon.png" })} />,
    );
    expect(screen.getByAltText("链接预览")).toHaveAttribute("src", "https://cdn.test/favicon.png");
    rerender(
      <ListView
        {...props({
          faviconUrl: "https://cdn.test/favicon.png",
          screenshotUrl: "https://cdn.test/shot.png",
        })}
      />,
    );
    expect(screen.getByAltText("链接预览")).toHaveAttribute("src", "https://cdn.test/shot.png");
  });
});
