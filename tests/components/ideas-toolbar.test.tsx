// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdeasToolbar } from "@/components/dashboard/ideas-page-parts/ideas-toolbar";
import type { IdeasViewModel } from "@/viewmodels/useIdeasViewModel";

function vmStub(overrides: Partial<Record<string, unknown>> = {}): IdeasViewModel {
  return {
    searchQuery: "",
    setSearchQuery: vi.fn(),
    tagFilterOptions: [],
    selectedTagId: null,
    setSelectedTagId: vi.fn(),
    sortBy: "updatedAt",
    setSortBy: vi.fn(),
    viewMode: "grid",
    setViewMode: vi.fn(),
    ideas: [{ id: 1 }],
    allIdeas: [{ id: 1 }, { id: 2 }, { id: 3 }],
    clearFilters: vi.fn(),
    setIsCreateModalOpen: vi.fn(),
    ...overrides,
  } as unknown as IdeasViewModel;
}

describe("IdeasToolbar", () => {
  it("shows the unfiltered count without a clear action", () => {
    render(<IdeasToolbar vm={vmStub()} />);
    expect(screen.getByText("共 3 条想法")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "清除" })).not.toBeInTheDocument();
  });

  it("types a search query and clears it from the input", async () => {
    const vm = vmStub();
    const user = userEvent.setup();
    const { rerender } = render(<IdeasToolbar vm={vm} />);
    await user.type(screen.getByPlaceholderText("搜索想法..."), "ag");
    expect(vm.setSearchQuery).toHaveBeenLastCalledWith("g");
    const filtered = vmStub({ searchQuery: "agent" });
    rerender(<IdeasToolbar vm={filtered} />);
    const clear = within(
      screen.getByPlaceholderText("搜索想法...").parentElement as HTMLElement,
    ).getByRole("button");
    await user.click(clear);
    expect(filtered.setSearchQuery).toHaveBeenCalledWith("");
    rerender(<IdeasToolbar vm={vmStub()} />);
    expect(
      within(screen.getByPlaceholderText("搜索想法...").parentElement as HTMLElement).queryByRole(
        "button",
      ),
    ).not.toBeInTheDocument();
  });

  it("describes the filtered subset and clears all filters", async () => {
    const vm = vmStub({ searchQuery: "agent", ideas: [{ id: 1 }] });
    const user = userEvent.setup();
    render(<IdeasToolbar vm={vm} />);
    expect(screen.getByText("1 / 3 条想法")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除" }));
    expect(vm.clearFilters).toHaveBeenCalledOnce();
  });

  it("omits the tag filter when no tags exist and filters by tag otherwise", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<IdeasToolbar vm={vmStub()} />);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);

    const vm = vmStub({
      tagFilterOptions: [
        { id: "t1", name: "产品", color: null },
        { id: "t2", name: "阅读", color: "#ff0000" },
      ],
      selectedTagId: "t2",
    });
    rerender(<IdeasToolbar vm={vm} />);
    const selects = screen.getAllByRole("combobox");
    const tagSelect = selects[0];
    const sortSelect = selects[1];
    if (!tagSelect || !sortSelect) throw new Error("expected two comboboxes");
    expect(tagSelect).toHaveTextContent("阅读");
    await user.click(tagSelect);
    await user.click(screen.getByRole("option", { name: "产品" }));
    expect(vm.setSelectedTagId).toHaveBeenCalledWith("t1");
    const currentSelects = screen.getAllByRole("combobox");
    const currentTagSelect = currentSelects[0];
    if (!currentTagSelect) throw new Error("expected tag combobox");
    await user.click(currentTagSelect);
    await user.click(screen.getByRole("option", { name: "所有标签" }));
    expect(vm.setSelectedTagId).toHaveBeenCalledWith(null);

    await user.click(sortSelect);
    await user.click(screen.getByRole("option", { name: "创建时间" }));
    expect(vm.setSortBy).toHaveBeenCalledWith("createdAt");
  });

  it("switches view modes and opens the create modal", async () => {
    const vm = vmStub({ viewMode: "list" });
    const user = userEvent.setup();
    render(<IdeasToolbar vm={vm} />);
    await user.click(screen.getByRole("button", { name: "Grid view" }));
    expect(vm.setViewMode).toHaveBeenCalledWith("grid");
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(vm.setViewMode).toHaveBeenCalledWith("list");
    await user.click(screen.getByRole("button", { name: "新想法" }));
    expect(vm.setIsCreateModalOpen).toHaveBeenCalledWith(true);
  });

  it("replaces the toolbar with selection actions while selecting", () => {
    render(
      <IdeasToolbar
        vm={vmStub()}
        selecting
        selectionActions={<button type="button">全选</button>}
      />,
    );
    expect(screen.queryByPlaceholderText("搜索想法...")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新想法" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全选" })).toBeInTheDocument();
  });
});
