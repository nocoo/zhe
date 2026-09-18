// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SuggestLinkOrgDialog } from "@/components/dashboard/suggest-link-org-dialog";
import type { SuggestLinkOrgViewModel } from "@/viewmodels/useSuggestLinkOrgViewModel";

vi.mock("@/actions/links", () => ({ updateLink: vi.fn() }));
vi.mock("@/actions/tags", () => ({ ensureTagOnLink: vi.fn() }));

afterEach(() => cleanup());

function makeVm(overrides: Partial<SuggestLinkOrgViewModel> = {}): SuggestLinkOrgViewModel {
  return {
    open: true,
    draftTitle: "整理标题",
    setDraftTitle: vi.fn(),
    stage: "ready",
    supplied: ["URL"],
    notices: ["README 未收录"],
    history: null,
    log: [],
    ready: true,
    addTag: vi.fn(),
    creatingTag: false,
    tagError: "",
    regenerate: vi.fn(),
    loading: false,
    applying: false,
    error: "",
    folders: [{ folderId: "f1", name: "工作", reason: "适合工作", source: "ai" }],
    selectedFolderId: "f1",
    setSelectedFolderId: vi.fn(),
    newTagSuggestions: [{ name: "知识管理", reason: "可复用的主题" }],
    tags: [
      {
        tagId: "t1",
        name: "文档",
        reason: "已有标签",
        checked: true,
        source: "ai",
      },
    ],
    draftNote: "工作文档入口",
    setDraftNote: vi.fn(),
    openForLink: vi.fn(),
    close: vi.fn(),
    toggleTag: vi.fn(),
    apply: vi.fn(),
    prompt: 'url: https://example.com\n{"hello":true}',
    rawText: '{"folders":[{"folderId":"f1"}],"tags":[]}',
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    durationMs: 16600,
    failedStep: null,
    ...overrides,
  };
}

describe("SuggestLinkOrgDialog", () => {
  it("shows actual request progress without an invented percent", () => {
    render(<SuggestLinkOrgDialog vm={makeVm({ loading: true, ready: false, stage: "request" })} />);
    expect(screen.getByTestId("suggest-step-request")).toHaveAttribute("data-state", "current");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByTestId("suggest-apply")).toBeDisabled();
    expect(screen.getByTestId("suggest-step-caption")).toHaveTextContent("已等待");
  });
  it("provides editable title and multiline note, with selectable tags", () => {
    const vm = makeVm();
    render(<SuggestLinkOrgDialog vm={vm} />);
    fireEvent.change(screen.getByRole("textbox", { name: "标题" }), {
      target: { value: "新标题" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "备注" }), {
      target: { value: "用户备注" },
    });
    const tagButton = screen.getAllByRole("button", { name: "文档" })[0];
    if (!tagButton) throw new Error("Missing recommended tag");
    fireEvent.click(tagButton);
    expect(vm.setDraftTitle).toHaveBeenCalledWith("新标题");
    expect(vm.setDraftNote).toHaveBeenCalledWith("用户备注");
    expect(vm.toggleTag).toHaveBeenCalledWith(0);
    expect(screen.getByRole("textbox", { name: "备注" }).tagName).toBe("TEXTAREA");
    expect(
      screen.getAllByRole("region").map((section) => section.getAttribute("aria-label")),
    ).toEqual(["1 标题", "2 备注", "3 分类", "4 标签"]);
    expect(screen.getByText("推荐理由：适合工作")).toBeVisible();
    expect(screen.getByText("推荐理由：已有标签")).toBeVisible();
    expect(screen.getByTestId("suggest-apply")).toHaveTextContent("确认保存");
    expect(screen.queryByText(/AI 建议|\/32|字数/)).not.toBeInTheDocument();
  });
  it("uses badges and creates a suggested new tag only when clicked", () => {
    const vm = makeVm();
    render(<SuggestLinkOrgDialog vm={vm} />);
    const existing = screen.getAllByRole("button", { name: "文档" })[0];
    expect(existing).toHaveAttribute("aria-pressed", "true");
    expect(existing?.querySelector("span")).toHaveClass("rounded-full");
    const create = screen.getByRole("button", { name: "创建标签 知识管理" });
    expect(create).not.toHaveAttribute("aria-pressed");
    expect(create.querySelector("span")).toHaveClass("border-dashed");
    expect(vm.addTag).not.toHaveBeenCalled();
    fireEvent.click(create);
    expect(vm.addTag).toHaveBeenCalledWith("知识管理");
    expect(vm.apply).not.toHaveBeenCalled();
  });
  it("keeps run details folded and missing README informational", () => {
    render(<SuggestLinkOrgDialog vm={makeVm()} />);
    const summary = screen.getByText("运行详情");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("README 未收录")).toBeVisible();
    expect(screen.getByTestId("suggest-apply")).toBeEnabled();
  });
  it("shows errors and disables a title that is too long", () => {
    render(
      <SuggestLinkOrgDialog
        vm={makeVm({ error: "格式错误", draftTitle: "字".repeat(33), failedStep: "parse" })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("格式错误");
    expect(screen.getByTestId("suggest-apply")).toBeDisabled();
  });
  it("uses the same apply and regenerate actions", () => {
    const vm = makeVm();
    render(<SuggestLinkOrgDialog vm={vm} />);
    fireEvent.click(screen.getByTestId("suggest-apply"));
    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
    expect(vm.apply).toHaveBeenCalled();
    expect(vm.regenerate).toHaveBeenCalled();
  });
});
