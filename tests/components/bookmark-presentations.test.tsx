// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { BookmarkCardFooter } from "@/components/dashboard/bookmark-card-footer";
import { makeLink, makeTag } from "../fixtures";

const link = makeLink();

describe("bounded bookmark content", () => {
  it("keeps empty metadata and long tags in the same fixed footer slots", () => {
    const { rerender } = render(
      <BookmarkCardFooter
        link={link}
        folder="未分类"
        tags={[]}
        actions={[]}
        triggerRef={createRef()}
        compact
      />,
    );
    expect(screen.getByText("未分类")).toBeVisible();
    expect(screen.queryByRole("list", { name: "收藏标签" })).not.toBeInTheDocument();
    rerender(
      <BookmarkCardFooter
        link={link}
        folder="Long folder"
        tags={[makeTag({ name: "long-tag".repeat(40) })]}
        actions={[]}
        triggerRef={createRef()}
      />,
    );
    const tags = screen.getByRole("list", { name: "收藏标签" });
    expect(tags).toHaveTextContent("long-tag".repeat(40));
    expect(tags).toHaveClass("min-w-0", "overflow-x-auto");
    expect(screen.getByRole("listitem")).toHaveClass("shrink-0");
    expect(document.querySelector("[data-bookmark-classification]")).toHaveClass("h-10");
    expect(tags).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(tags, { key: "ArrowRight" });
    expect(tags.scrollLeft).toBe(40);
    fireEvent.keyDown(tags, { key: "ArrowLeft" });
    expect(tags.scrollLeft).toBe(0);
    expect(fireEvent.keyDown(tags, { key: "Tab" })).toBe(true);
    expect(tags.scrollLeft).toBe(0);
  });

  it("omits classification without dropping the saved timestamp", () => {
    render(
      <BookmarkCardFooter
        link={link}
        folder="Hidden folder"
        tags={[makeTag({ name: "Hidden tag" })]}
        actions={[]}
        triggerRef={createRef()}
        showClassification={false}
      />,
    );
    expect(document.querySelector("[data-bookmark-classification]")).toBeNull();
    expect(screen.queryByText("Hidden folder")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden tag")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制收藏时间" })).toBeVisible();
  });
});
