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
    loading: false,
    applying: false,
    error: "",
    folders: [{ folderId: "f1", name: "工作", reason: "适合工作" }],
    selectedFolderId: "f1",
    setSelectedFolderId: vi.fn(),
    tags: [{ tagId: "t1", name: "文档", reason: "已有标签", checked: true, draftName: "文档" }],
    hasAiKey: true,
    refreshHasAiKey: vi.fn(),
    openForLink: vi.fn(),
    close: vi.fn(),
    toggleTag: vi.fn(),
    renameTag: vi.fn(),
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
  it("uses a wide dialog and marks the request step while loading", () => {
    render(<SuggestLinkOrgDialog vm={makeVm({ loading: true, folders: [], tags: [] })} />);
    const dialog = screen.getByTestId("suggest-link-org-dialog");
    expect(dialog.className).toContain("max-w-3xl");
    expect(screen.getByTestId("suggest-step-request")).toHaveAttribute("data-state", "current");
    expect(screen.getByTestId("suggest-step-caption")).toHaveTextContent("正在调用模型");
  });

  it("keeps transcripts collapsed until expanded", () => {
    render(<SuggestLinkOrgDialog vm={makeVm()} />);
    expect(screen.queryByTestId("suggest-prompt-body")).not.toBeInTheDocument();
    expect(screen.queryByTestId("suggest-raw-body")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("suggest-prompt-toggle"));
    expect(screen.getByTestId("suggest-prompt-body")).toHaveTextContent("https://example.com");

    fireEvent.click(screen.getByTestId("suggest-raw-toggle"));
    expect(screen.getByTestId("suggest-raw-body")).toHaveTextContent('"folderId": "f1"');
  });

  it("marks the failed parse step and still offers the raw reply", () => {
    render(
      <SuggestLinkOrgDialog
        vm={makeVm({
          error: "模型返回不是有效 JSON",
          failedStep: "parse",
          folders: [],
          tags: [],
          rawText: "{",
        })}
      />,
    );
    expect(screen.getByTestId("suggest-step-parse")).toHaveAttribute("data-state", "error");
    expect(screen.getByTestId("suggest-error")).toHaveTextContent("模型返回不是有效 JSON");
    fireEvent.click(screen.getByTestId("suggest-raw-toggle"));
    expect(screen.getByTestId("suggest-raw-body")).toHaveTextContent("{");
  });
});
