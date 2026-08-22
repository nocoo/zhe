// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TagsPage } from "@/components/dashboard/tags-page";

const mockVm = {
  rows: [] as {
    id: string;
    name: string;
    color: string;
    linkCount: number;
    ideaCount: number;
  }[],
  creating: false,
  savingId: null as string | null,
  startCreate: vi.fn(),
  cancelCreate: vi.fn(),
  handleCreate: vi.fn(),
  handleRename: vi.fn(),
  handleRecolor: vi.fn(),
  handleDelete: vi.fn(),
};

vi.mock("@/viewmodels/useTagsViewModel", () => ({
  useTagsViewModel: () => mockVm,
}));

describe("TagsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVm.rows = [];
    mockVm.creating = false;
    mockVm.savingId = null;
    mockVm.handleCreate.mockResolvedValue({ success: true });
    mockVm.handleRename.mockResolvedValue({ success: true });
    mockVm.handleRecolor.mockResolvedValue({ success: true });
    mockVm.handleDelete.mockResolvedValue({ success: true });
  });

  it("shows an empty state when there are no tags", () => {
    render(<TagsPage />);
    expect(screen.getByTestId("tags-empty")).toBeInTheDocument();
    expect(screen.getByText("共 0 个")).toBeInTheDocument();
  });

  it("opens the create form from the header action", () => {
    render(<TagsPage />);
    fireEvent.click(screen.getByTestId("tag-create-btn"));
    expect(mockVm.startCreate).toHaveBeenCalled();
  });

  it("creates a tag with a picked color", async () => {
    mockVm.creating = true;
    render(<TagsPage />);

    fireEvent.change(screen.getByLabelText("新标签名"), { target: { value: "work" } });
    fireEvent.click(screen.getByTestId("tag-color-red"));
    fireEvent.click(screen.getByTestId("tag-create-submit"));

    await waitFor(() => {
      expect(mockVm.handleCreate).toHaveBeenCalledWith("work", "red");
    });
  });

  it("lists tags with usage and lets the user recolor", async () => {
    mockVm.rows = [{ id: "t1", name: "work", color: "sky", linkCount: 2, ideaCount: 1 }];
    render(<TagsPage />);

    expect(screen.getByTestId("tag-badge")).toHaveTextContent("work");
    expect(screen.getByTestId("tag-usage")).toHaveTextContent("2 链接 · 1 想法");

    fireEvent.click(screen.getByTestId("tag-color-red"));
    await waitFor(() => {
      expect(mockVm.handleRecolor).toHaveBeenCalledWith("t1", "red");
    });
  });

  it("renames a tag on blur when the name changed", async () => {
    mockVm.rows = [{ id: "t1", name: "work", color: "sky", linkCount: 0, ideaCount: 0 }];
    render(<TagsPage />);

    const input = screen.getByLabelText("重命名 work");
    fireEvent.change(input, { target: { value: "office" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockVm.handleRename).toHaveBeenCalledWith("t1", "office");
    });
  });

  it("does not rename when the draft is unchanged", async () => {
    mockVm.rows = [{ id: "t1", name: "work", color: "sky", linkCount: 0, ideaCount: 0 }];
    render(<TagsPage />);

    fireEvent.blur(screen.getByLabelText("重命名 work"));
    expect(mockVm.handleRename).not.toHaveBeenCalled();
  });

  it("cancels create from the form button", () => {
    mockVm.creating = true;
    render(<TagsPage />);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(mockVm.cancelCreate).toHaveBeenCalled();
  });

  it("submits create on Enter and cancels on Escape", async () => {
    mockVm.creating = true;
    render(<TagsPage />);
    const input = screen.getByLabelText("新标签名");
    fireEvent.change(input, { target: { value: "work" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(mockVm.handleCreate).toHaveBeenCalled();
    });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockVm.cancelCreate).toHaveBeenCalled();
  });

  it("commits rename on Enter and restores the draft on Escape", () => {
    mockVm.rows = [{ id: "t1", name: "work", color: "sky", linkCount: 0, ideaCount: 0 }];
    render(<TagsPage />);
    const input = screen.getByLabelText("重命名 work");
    fireEvent.change(input, { target: { value: "office" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("work");
    fireEvent.change(input, { target: { value: "office" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockVm.handleRename).toHaveBeenCalledWith("t1", "office");
  });

  it("deletes a tag after confirmation", async () => {
    mockVm.rows = [{ id: "t1", name: "work", color: "sky", linkCount: 0, ideaCount: 0 }];
    render(<TagsPage />);

    fireEvent.click(screen.getByTestId("tag-delete-btn"));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(mockVm.handleDelete).toHaveBeenCalledWith("t1");
    });
  });
});
