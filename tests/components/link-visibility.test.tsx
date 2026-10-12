// @vitest-environment happy-dom
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShowHiddenButton } from "@/components/dashboard/link-visibility";
import { makeLink } from "../fixtures";

const openEnrichment = vi.fn();
const mockLinkVm = vi.hoisted(() => ({
  shortUrl: "https://zhe.to/a",
  copied: false,
  copiedOriginalUrl: false,
  isDeleting: false,
  isSavingVisibility: false,
  showAnalytics: false,
  analyticsStats: null,
  isLoadingAnalytics: false,
  handleCopy: vi.fn(),
  handleCopyOriginalUrl: vi.fn(),
  handleDelete: vi.fn(),
  handleToggleHidden: vi.fn(),
  handleToggleAnalytics: vi.fn(),
  screenshotUrl: null,
  faviconUrl: null,
  faviconError: false,
  handleFaviconError: vi.fn(),
}));
vi.mock("@/contexts/enrichment", () => ({ useOpenEnrichment: () => openEnrichment }));
vi.mock("@/viewmodels/useLinksViewModel", () => ({ useLinkCardViewModel: () => mockLinkVm }));

import { useBookmarkCardViewModel } from "@/viewmodels/useBookmarkCardViewModel";

describe("ShowHiddenButton", () => {
  it("reflects the pressed state and toggles hidden post display", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ShowHiddenButton showHidden={false} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "展示隐藏" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    rerender(<ShowHiddenButton showHidden onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "展示隐藏" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe("unified bookmark actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLinkVm.isSavingVisibility = false;
  });

  it("exposes visibility and enrichment behavior through the bookmark action model", () => {
    const link = makeLink({ id: 7, isHidden: false });
    const { result, rerender } = renderHook(
      ({ currentLink }) =>
        useBookmarkCardViewModel({
          link: currentLink,
          siteUrl: "https://zhe.to",
          onUpdate: vi.fn(),
          onDelete: vi.fn(),
          editable: true,
        }),
      { initialProps: { currentLink: link } },
    );
    const hidden = result.current.actions.find(({ id }) => id === "visibility");
    expect(hidden).toMatchObject({ label: "隐藏帖子", disabled: false });
    hidden?.run();
    result.current.actions.find(({ id }) => id === "enrichment")?.run();
    expect(mockLinkVm.handleToggleHidden).toHaveBeenCalledOnce();
    expect(openEnrichment).toHaveBeenCalledWith({ linkId: 7 });

    mockLinkVm.isSavingVisibility = true;
    rerender({ currentLink: { ...link, isHidden: true } });
    expect(result.current.actions.find(({ id }) => id === "visibility")).toMatchObject({
      label: "取消隐藏",
      disabled: true,
      pending: true,
    });
  });
});
