// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  CreateIdeaModal,
  DeleteIdeaConfirm,
  ErrorToast,
} from "@/components/dashboard/ideas-page-parts/dialogs";
import type { IdeasViewModel } from "@/viewmodels/useIdeasViewModel";

function mockVm(overrides: Partial<Record<string, unknown>> = {}): IdeasViewModel {
  return {
    isCreateModalOpen: true,
    setIsCreateModalOpen: vi.fn(),
    isDeleteConfirmOpen: true,
    cancelDelete: vi.fn(),
    executeDelete: vi.fn(),
    isSaving: false,
    isDeleting: false,
    tags: [
      { id: "t1", name: "产品", color: "#111111", userId: "u", createdAt: new Date() },
      { id: "t2", name: "灵感", color: "#222222", userId: "u", createdAt: new Date() },
    ],
    ...overrides,
  } as unknown as IdeasViewModel;
}

describe("CreateIdeaModal", () => {
  it("edits fields, selects tags, and submits when content is present", async () => {
    const user = userEvent.setup();
    const vm = mockVm();
    const setNewTitle = vi.fn();
    const setNewContent = vi.fn();
    const toggleTag = vi.fn();
    const onCreate = vi.fn();

    const { rerender } = render(
      <CreateIdeaModal
        vm={vm}
        newTitle="Initial title"
        setNewTitle={setNewTitle}
        newContent=""
        setNewContent={setNewContent}
        newTagIds={["t1"]}
        toggleTag={toggleTag}
        onCreate={onCreate}
      />,
    );

    const titleInput = screen.getByPlaceholderText("为您的想法添加标题...");
    fireEvent.change(titleInput, { target: { value: "New Title" } });
    expect(setNewTitle).toHaveBeenCalledWith("New Title");

    const contentInput = screen.getByPlaceholderText("在这里写下您的想法... (支持 Markdown)");
    fireEvent.change(contentInput, { target: { value: "Idea content" } });
    expect(setNewContent).toHaveBeenCalledWith("Idea content");

    await user.click(screen.getByText("灵感"));
    expect(toggleTag).toHaveBeenCalledWith("t2");

    const createBtn = screen.getByRole("button", { name: "创建" });
    expect(createBtn).toBeDisabled();

    rerender(
      <CreateIdeaModal
        vm={vm}
        newTitle="New Title"
        setNewTitle={setNewTitle}
        newContent="Idea content"
        setNewContent={setNewContent}
        newTagIds={["t1"]}
        toggleTag={toggleTag}
        onCreate={onCreate}
      />,
    );
    expect(screen.getByRole("button", { name: "创建" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "创建" }));
    expect(onCreate).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(vm.setIsCreateModalOpen).toHaveBeenCalledWith(false);
  });
});

describe("DeleteIdeaConfirm", () => {
  it("confirms or cancels deletion", async () => {
    const user = userEvent.setup();
    const vm = mockVm();
    const { rerender } = render(<DeleteIdeaConfirm vm={vm} />);

    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(vm.executeDelete).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(vm.cancelDelete).toHaveBeenCalledOnce();

    rerender(<DeleteIdeaConfirm vm={mockVm({ isDeleting: true })} />);
    expect(screen.getByRole("button", { name: /删除/ })).toBeDisabled();
  });
});

describe("ErrorToast", () => {
  it("renders message and triggers clear callback", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<ErrorToast message="Something went wrong" onClear={onClear} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
