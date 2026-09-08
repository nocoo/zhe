// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateIdeaModal } from "@/components/dashboard/ideas-page-parts/dialogs";
import type { IdeasViewModel } from "@/viewmodels/useIdeasViewModel";

afterEach(() => cleanup());

function stubVm(overrides: Partial<IdeasViewModel> = {}): IdeasViewModel {
  return {
    isCreateModalOpen: true,
    setIsCreateModalOpen: vi.fn(),
    isSaving: false,
    tags: [],
    ...overrides,
  } as IdeasViewModel;
}

describe("CreateIdeaModal density", () => {
  it("uses lg size for the title field and primary actions", () => {
    render(
      <CreateIdeaModal
        vm={stubVm()}
        newTitle=""
        setNewTitle={vi.fn()}
        newContent="draft"
        setNewContent={vi.fn()}
        newTagIds={[]}
        toggleTag={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("标题 (可选)").className).toMatch(/\bh-10\b/);
    expect(screen.getByRole("button", { name: "创建" }).className).toMatch(/\bh-10\b/);
    expect(screen.getByRole("button", { name: "取消" }).className).toMatch(/\bh-10\b/);
  });
});
