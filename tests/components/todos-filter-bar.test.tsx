// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodosFilterBar } from "@/components/dashboard/todos-page-parts/todos-filter-bar";

afterEach(() => cleanup());

const baseProps = {
  searchQuery: "",
  onSearchQueryChange: vi.fn(),
  showDone: true,
  onShowDoneChange: vi.fn(),
  selectedTagName: null,
  onSelectedTagNameChange: vi.fn(),
  tagFilterOptions: ["home", "work"],
  dueFilter: "all" as const,
  onDueFilterChange: vi.fn(),
  onClearFilters: vi.fn(),
};

describe("TodosFilterBar", () => {
  it("hides the Clear button at rest and shows it once a facet becomes dirty", () => {
    const { rerender } = render(<TodosFilterBar {...baseProps} />);
    expect(screen.queryByRole("button", { name: /清除/ })).toBeNull();

    rerender(<TodosFilterBar {...baseProps} searchQuery="milk" />);
    expect(screen.getByRole("button", { name: /清除/ })).toBeTruthy();
  });

  it("forwards search input to onSearchQueryChange", () => {
    const onSearchQueryChange = vi.fn();
    render(<TodosFilterBar {...baseProps} onSearchQueryChange={onSearchQueryChange} />);
    fireEvent.change(screen.getByLabelText("Search todos"), {
      target: { value: "milk" },
    });
    expect(onSearchQueryChange).toHaveBeenCalledWith("milk");
  });

  it("toggles showDone via the checkbox", () => {
    const onShowDoneChange = vi.fn();
    render(<TodosFilterBar {...baseProps} showDone onShowDoneChange={onShowDoneChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onShowDoneChange).toHaveBeenCalledWith(false);
  });

  it("Clear button routes to onClearFilters", () => {
    const onClearFilters = vi.fn();
    render(<TodosFilterBar {...baseProps} searchQuery="milk" onClearFilters={onClearFilters} />);
    fireEvent.click(screen.getByRole("button", { name: /清除/ }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
