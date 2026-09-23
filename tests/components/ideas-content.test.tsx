// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IdeasContent } from "@/components/dashboard/ideas-page-parts/ideas-content";
import type { BulkDeleteState } from "@/viewmodels/useBulkDelete";
import type { IdeasViewModel } from "@/viewmodels/useIdeasViewModel";
import { makeIdea } from "../fixtures";

const activeSelection = {
  active: true,
  selected: new Set<number>(),
  toggle: vi.fn(),
} as unknown as BulkDeleteState;

function makeVm(overrides: Partial<IdeasViewModel>): IdeasViewModel {
  return {
    loading: false,
    ideas: [],
    viewMode: "grid",
    tags: [],
    searchQuery: "",
    selectedTagId: null,
    setIsCreateModalOpen: vi.fn(),
    confirmDelete: vi.fn(),
    ...overrides,
  } as unknown as IdeasViewModel;
}

describe("IdeasContent", () => {
  it("shows the filtered empty state without a create action", () => {
    render(
      <IdeasContent
        vm={makeVm({ searchQuery: "no-match" })}
        selection={activeSelection}
        onNavigateToIdea={vi.fn()}
      />,
    );
    expect(screen.getByText("未找到想法")).toBeInTheDocument();
    expect(screen.getByText("试试调整筛选条件")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新想法" })).not.toBeInTheDocument();
  });

  it.each(["grid", "list"] as const)(
    "labels untitled cards by excerpt or placeholder in %s view",
    (viewMode) => {
      const ideas = [
        makeIdea({ id: 11, title: null, excerpt: "Excerpt copy" }),
        makeIdea({ id: 12, title: null, excerpt: null }),
      ];
      render(
        <IdeasContent
          vm={makeVm({ ideas, viewMode })}
          selection={activeSelection}
          onNavigateToIdea={vi.fn()}
        />,
      );
      expect(screen.getByRole("checkbox", { name: "选择 Excerpt copy" })).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "选择 未命名想法" })).toBeInTheDocument();
    },
  );
});
