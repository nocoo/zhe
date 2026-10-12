// @vitest-environment happy-dom
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil } from "lucide-react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookmarkActions } from "@/components/dashboard/bookmark-actions";
import { BookmarkCardDialogs } from "@/components/dashboard/bookmark-card-dialogs";
import { BookmarkCardFooter } from "@/components/dashboard/bookmark-card-footer";
import { useBookmarkCardViewModel } from "@/viewmodels/useBookmarkCardViewModel";
import { makeLink, makeTag } from "../fixtures";

const { vm, openEnrichment, deleted, destroy } = vi.hoisted(() => ({
  vm: {
    shortUrl: "https://zhe.to/test",
    copied: false,
    copiedOriginalUrl: false,
    isDeleting: false,
    showAnalytics: false,
    analyticsStats: null,
    isLoadingAnalytics: false,
    isSavingVisibility: false,
    handleCopy: vi.fn(),
    handleCopyOriginalUrl: vi.fn(),
    handleToggleHidden: vi.fn(),
    handleToggleAnalytics: vi.fn(),
    handleDelete: vi.fn(),
  },
  openEnrichment: vi.fn(),
  deleted: { current: async () => {} },
  destroy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/contexts/enrichment", () => ({ useOpenEnrichment: () => openEnrichment }));
vi.mock("@/lib/motion", () => ({ destroyCard: destroy }));
vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useLinkCardViewModel: (_link: unknown, _site: unknown, onDelete: () => Promise<void>) => {
    deleted.current = onDelete;
    return vm;
  },
}));
vi.mock("@/components/dashboard/link-card-parts/card-edit-dialog", () => ({
  CardEditDialog: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      关闭修改
    </button>
  ),
}));

const link = makeLink({ id: 7, createdAt: new Date("2026-10-13T02:00:00Z"), isHidden: false });
const onDelete = vi.fn();
const onSuggest = vi.fn();
const options = {
  link,
  siteUrl: "https://zhe.to",
  onUpdate: vi.fn(),
  onDelete,
  onSuggest,
  editable: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(vm, {
    copied: false,
    copiedOriginalUrl: false,
    isDeleting: false,
    showAnalytics: false,
    isSavingVisibility: false,
    isLoadingAnalytics: false,
  });
});

function Harness({
  hidden = false,
  aiDisabled = false,
}: {
  hidden?: boolean;
  aiDisabled?: boolean;
}) {
  const card = useBookmarkCardViewModel({
    ...options,
    link: { ...link, isHidden: hidden },
    suggestDisabled: aiDisabled,
  });
  return (
    <div ref={card.card}>
      <BookmarkCardFooter
        link={link}
        folder="A very long folder name"
        tags={[makeTag({ id: "one", name: "First" }), makeTag({ id: "two", name: "Second" })]}
        actions={card.actions}
        triggerRef={card.menuTrigger}
      />
      <BookmarkCardDialogs
        vm={card}
        link={link}
        tags={[]}
        linkTags={[]}
        folders={[]}
        editCallbacks={{
          onLinkUpdated: vi.fn(),
          onTagCreated: vi.fn(),
          onLinkTagAdded: vi.fn(),
          onLinkTagRemoved: vi.fn(),
        }}
      />
    </div>
  );
}

describe("unified bookmark action contract", () => {
  it("declares stable placement, labels and behavior independently of card type", async () => {
    const { result, rerender } = renderHook((props) => useBookmarkCardViewModel(props), {
      initialProps: options,
    });
    expect(result.current.actions.map(({ id, placement }) => [id, placement])).toEqual([
      ["organize", "toolbar"],
      ["copy-original", "copy"],
      ["copy-short", "copy"],
      ["edit", "menu"],
      ["enrichment", "menu"],
      ["analytics", "menu"],
      ["visibility", "menu"],
      ["delete", "menu"],
    ]);
    for (const id of [
      "organize",
      "copy-original",
      "copy-short",
      "enrichment",
      "analytics",
      "visibility",
    ])
      act(() => {
        result.current.actions.find((action) => action.id === id)?.run();
      });
    expect(onSuggest).toHaveBeenCalledOnce();
    expect(vm.handleCopy).toHaveBeenCalledOnce();
    expect(vm.handleCopyOriginalUrl).toHaveBeenCalledOnce();
    expect(vm.handleToggleAnalytics).toHaveBeenCalledOnce();
    expect(vm.handleToggleHidden).toHaveBeenCalledOnce();
    expect(openEnrichment).toHaveBeenCalledWith({ linkId: 7 });
    Object.assign(vm, {
      copied: true,
      copiedOriginalUrl: true,
      isSavingVisibility: true,
      isDeleting: true,
    });
    rerender({ ...options, link: { ...link, isHidden: true }, editable: false });
    expect(result.current.actions.find((a) => a.id === "copy-original")?.label).toBe(
      "已复制原链接",
    );
    expect(result.current.actions.find((a) => a.id === "copy-short")?.label).toBe("已复制短链接");
    expect(result.current.actions.find((a) => a.id === "visibility")).toMatchObject({
      label: "取消隐藏",
      pending: true,
      disabled: true,
    });
    expect(result.current.actions.find((a) => a.id === "edit")?.disabled).toBe(true);
    expect(result.current.actions.find((a) => a.id === "delete")?.disabled).toBe(true);
  });

  it("always exposes organize, copy and more, with stable metadata and read-only full tags", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toolbar = document.querySelector("[data-bookmark-actions]") as HTMLElement;
    expect(
      within(toolbar)
        .getAllByRole("button")
        .map((el) => el.getAttribute("aria-label")),
    ).toEqual(["AI 整理", "复制链接", "更多收藏操作"]);
    expect(screen.queryByRole("button", { name: "修改收藏" })).not.toBeInTheDocument();
    expect(document.querySelector("time")?.textContent).toContain("2026-10-13");
    expect(document.querySelector("time")?.getAttribute("title")).toContain("收藏于");
    await user.click(screen.getByRole("button", { name: "查看全部标签" }));
    expect(screen.getByText("Second")).toBeVisible();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "AI 整理" }));
    expect(onSuggest).toHaveBeenCalledOnce();
  });

  it("groups both copy variants and restores keyboard focus after selection", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "复制链接" });
    for (const [label, handler] of [
      ["复制原链接", vm.handleCopyOriginalUrl],
      ["复制短链接", vm.handleCopy],
    ] as const) {
      await user.click(trigger);
      expect(screen.getAllByRole("menuitem")).toHaveLength(2);
      await user.click(screen.getByRole("menuitem", { name: label }));
      await waitFor(() => expect(handler).toHaveBeenCalledOnce());
      expect(trigger).toHaveFocus();
    }
  });

  it("opens the editor from more and confirms deletion separately without deleting on cancel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const more = screen.getByRole("button", { name: "更多收藏操作" });
    await user.click(more);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "修改收藏",
      "数据采集",
      "访问统计",
      "隐藏帖子",
      "删除收藏",
    ]);
    expect(screen.getByRole("separator")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "修改收藏" }));
    await user.click(await screen.findByRole("button", { name: "关闭修改" }));
    await user.click(more);
    await user.click(screen.getByRole("menuitem", { name: "删除收藏" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(vm.handleDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(more).toHaveFocus());
    await user.click(more);
    await user.click(screen.getByRole("menuitem", { name: "删除收藏" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /^删除$/,
      }),
    );
    expect(vm.handleDelete).toHaveBeenCalledOnce();
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });

  it("keeps unavailable AI in its slot with an explanation", async () => {
    render(<Harness aiDisabled />);
    expect(screen.getByRole("button", { name: "AI 整理" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "AI 整理" })).toHaveAttribute(
      "aria-description",
      "请先在设置中配置 AI",
    );
    const { result } = renderHook(() =>
      useBookmarkCardViewModel({ ...options, onSuggest: undefined }),
    );
    expect(result.current.actions[0]?.disabled).toBe(true);
    act(() => result.current.actions[0]?.run());
    expect(onSuggest).not.toHaveBeenCalled();
  });

  it("blocks dismissal and repeated confirmation while deletion is pending", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness hidden />);
    await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
    expect(screen.getByRole("menuitem", { name: "取消隐藏" })).toBeVisible();
    await user.click(screen.getByRole("menuitem", { name: "删除收藏" }));
    await screen.findByRole("alertdialog");
    vm.isDeleting = true;
    rerender(<Harness hidden />);
    expect(screen.getByRole("button", { name: "删除中..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });

  it("shows analytics in a separate dialog and returns focus when closed", async () => {
    vm.showAnalytics = true;
    render(<Harness />);
    expect(await screen.findByRole("dialog", { name: "访问统计" })).toBeVisible();
    expect(screen.getByText("暂无分析数据")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(vm.handleToggleAnalytics).toHaveBeenCalledOnce();
  });

  it("renders future actions from descriptors, including pending and disabled menu items", async () => {
    const run = vi.fn();
    render(
      <BookmarkActions
        triggerRef={createRef()}
        actions={[
          {
            id: "future",
            label: "Future",
            icon: Pencil,
            placement: "toolbar",
            run,
            destructive: true,
          },
          {
            id: "pending",
            label: "Pending",
            icon: Pencil,
            placement: "menu",
            run,
            pending: true,
            disabled: true,
            description: "Wait",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Future" }));
    expect(run).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Future" })).toHaveClass("text-destructive");
    await userEvent.click(screen.getByRole("button", { name: "更多收藏操作" }));
    expect(screen.getByRole("menuitem", { name: /Pending/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("Wait")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  });

  it("animates successful removal before notifying the parent and focuses the next card", async () => {
    const { result } = renderHook(() => useBookmarkCardViewModel(options));
    const wrapper = document.createElement("div");
    wrapper.innerHTML =
      '<div data-card-layout-item><div id="current"></div></div><div data-card-layout-item><button aria-label="更多收藏操作">More</button></div>';
    document.body.append(wrapper);
    result.current.card.current = wrapper.querySelector("#current");
    await act(async () => deleted.current());
    expect(destroy).toHaveBeenCalledWith(result.current.card.current);
    expect(onDelete).toHaveBeenCalledWith(7);
    expect(wrapper.querySelector("button")).toHaveFocus();
    wrapper.remove();
    result.current.card.current = null;
    await act(async () => deleted.current());
  });
});
