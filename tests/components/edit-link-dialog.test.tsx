import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditLinkDialog } from "@/components/dashboard/edit-link-dialog";
import type { Tag, Folder } from "@/models/types";

vi.mock("@/models/tags", () => ({
  getTagColorClasses: (color: string) => ({
    badge: `mock-badge-${color}`,
    dot: `mock-dot-${color}`,
  }),
}));

const sampleTags: Tag[] = [
  { id: "t1", userId: "u1", name: "Work", color: "blue", createdAt: new Date() },
  { id: "t2", userId: "u1", name: "Personal", color: "emerald", createdAt: new Date() },
  { id: "t3", userId: "u1", name: "Archive", color: "slate", createdAt: new Date() },
];

const sampleFolders: Folder[] = [
  { id: "f1", userId: "u1", name: "工作", icon: "briefcase", createdAt: new Date("2026-01-01") },
  { id: "f2", userId: "u1", name: "个人", icon: "heart", createdAt: new Date("2026-01-02") },
];

describe("EditLinkDialog", () => {
  const defaultProps = {
    isOpen: true,
    onOpenChange: vi.fn(),
    editUrl: "https://example.com",
    setEditUrl: vi.fn(),
    editSlug: "abc123",
    setEditSlug: vi.fn(),
    editFolderId: undefined as string | undefined,
    setEditFolderId: vi.fn(),
    editNote: "",
    setEditNote: vi.fn(),
    editScreenshotUrl: "",
    setEditScreenshotUrl: vi.fn(),
    isSaving: false,
    error: "",
    assignedTags: [] as Tag[],
    allTags: [] as Tag[],
    assignedTagIds: new Set<string>(),
    folders: [] as Folder[],
    onSave: vi.fn(),
    onClose: vi.fn(),
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    onCreateAndAssignTag: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog content when isOpen is true", () => {
    render(<EditLinkDialog {...defaultProps} />);

    expect(screen.getByText("编辑链接")).toBeInTheDocument();
    expect(screen.getByLabelText("目标链接")).toBeInTheDocument();
    expect(screen.getByLabelText("短链接")).toBeInTheDocument();
    expect(screen.getByLabelText("备注")).toBeInTheDocument();
    expect(screen.getByLabelText("截图链接")).toBeInTheDocument();
  });

  it("does not render dialog content when isOpen is false", () => {
    render(<EditLinkDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByText("编辑链接")).not.toBeInTheDocument();
  });

  it("calls setEditUrl when URL input changes", () => {
    render(<EditLinkDialog {...defaultProps} />);

    const input = screen.getByLabelText("目标链接");
    fireEvent.change(input, { target: { value: "https://new-url.com" } });

    expect(defaultProps.setEditUrl).toHaveBeenCalledWith("https://new-url.com");
  });

  it("calls setEditSlug when slug input changes", () => {
    render(<EditLinkDialog {...defaultProps} />);

    const input = screen.getByLabelText("短链接");
    fireEvent.change(input, { target: { value: "new-slug" } });

    expect(defaultProps.setEditSlug).toHaveBeenCalledWith("new-slug");
  });

  it("calls setEditNote when note textarea changes", () => {
    render(<EditLinkDialog {...defaultProps} />);

    const textarea = screen.getByLabelText("备注");
    fireEvent.change(textarea, { target: { value: "my note" } });

    expect(defaultProps.setEditNote).toHaveBeenCalledWith("my note");
  });

  it("calls setEditScreenshotUrl when screenshot URL input changes", () => {
    render(<EditLinkDialog {...defaultProps} />);

    const input = screen.getByLabelText("截图链接");
    fireEvent.change(input, { target: { value: "https://img.com/shot.png" } });

    expect(defaultProps.setEditScreenshotUrl).toHaveBeenCalledWith("https://img.com/shot.png");
  });

  it("calls setEditFolderId when folder selector changes", () => {
    render(<EditLinkDialog {...defaultProps} folders={sampleFolders} />);

    const select = screen.getByLabelText("文件夹");
    fireEvent.change(select, { target: { value: "f1" } });

    expect(defaultProps.setEditFolderId).toHaveBeenCalledWith("f1");
  });

  it("calls setEditFolderId with undefined when Inbox is selected", () => {
    render(
      <EditLinkDialog {...defaultProps} folders={sampleFolders} editFolderId="f1" />,
    );

    const select = screen.getByLabelText("文件夹");
    fireEvent.change(select, { target: { value: "" } });

    expect(defaultProps.setEditFolderId).toHaveBeenCalledWith(undefined);
  });

  it("calls onSave when save button is clicked", () => {
    render(<EditLinkDialog {...defaultProps} />);

    const saveButton = screen.getByRole("button", { name: "保存" });
    fireEvent.click(saveButton);

    expect(defaultProps.onSave).toHaveBeenCalledOnce();
  });

  it("calls onClose when cancel button is clicked", () => {
    render(<EditLinkDialog {...defaultProps} />);

    const cancelButton = screen.getByRole("button", { name: "取消" });
    fireEvent.click(cancelButton);

    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("shows loading state when isSaving is true", () => {
    render(<EditLinkDialog {...defaultProps} isSaving={true} />);

    expect(screen.getByText("保存中...")).toBeInTheDocument();
    expect(screen.queryByText("保存")).not.toBeInTheDocument();
  });

  it("disables buttons when isSaving is true", () => {
    render(<EditLinkDialog {...defaultProps} isSaving={true} />);

    const saveButton = screen.getByText("保存中...").closest("button");
    expect(saveButton).toBeDisabled();

    const cancelButton = screen.getByRole("button", { name: "取消" });
    expect(cancelButton).toBeDisabled();
  });

  it("shows error message when error prop is set", () => {
    render(<EditLinkDialog {...defaultProps} error="slug 已被占用" />);

    expect(screen.getByText("slug 已被占用")).toBeInTheDocument();
  });

  it("does not show error message when error is empty", () => {
    render(<EditLinkDialog {...defaultProps} error="" />);

    expect(screen.queryByText("slug 已被占用")).not.toBeInTheDocument();
  });

  it("shows assigned tags with remove buttons", () => {
    const assignedTags = [sampleTags[0], sampleTags[1]];
    const assignedTagIds = new Set(["t1", "t2"]);

    render(
      <EditLinkDialog
        {...defaultProps}
        assignedTags={assignedTags}
        allTags={sampleTags}
        assignedTagIds={assignedTagIds}
      />,
    );

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove tag Work")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove tag Personal")).toBeInTheDocument();
  });

  it("calls onRemoveTag when tag remove button is clicked", () => {
    const assignedTags = [sampleTags[0]];
    const assignedTagIds = new Set(["t1"]);

    render(
      <EditLinkDialog
        {...defaultProps}
        assignedTags={assignedTags}
        allTags={sampleTags}
        assignedTagIds={assignedTagIds}
      />,
    );

    fireEvent.click(screen.getByLabelText("Remove tag Work"));

    expect(defaultProps.onRemoveTag).toHaveBeenCalledWith("t1");
  });

  it("calls onAddTag when selecting an existing tag from picker", async () => {
    const user = userEvent.setup();
    const assignedTagIds = new Set(["t1"]);

    render(
      <EditLinkDialog
        {...defaultProps}
        assignedTags={[sampleTags[0]]}
        allTags={sampleTags}
        assignedTagIds={assignedTagIds}
      />,
    );

    // Open the tag picker popover
    await user.click(screen.getByLabelText("Add tag"));

    // The unassigned tags should be visible (Personal and Archive)
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();

    // Select an unassigned tag
    await user.click(screen.getByText("Archive"));

    expect(defaultProps.onAddTag).toHaveBeenCalledWith("t3");
  });

  it("calls onCreateAndAssignTag when creating a new tag", async () => {
    const user = userEvent.setup();

    render(
      <EditLinkDialog
        {...defaultProps}
        allTags={sampleTags}
        assignedTagIds={new Set<string>()}
      />,
    );

    // Open the tag picker popover
    await user.click(screen.getByLabelText("Add tag"));

    // Type a new tag name that doesn't exist
    const searchInput = screen.getByPlaceholderText("搜索或创建标签...");
    await user.type(searchInput, "NewTag");

    // The create option should appear
    const createOption = screen.getByText(/创建/);
    expect(createOption).toBeInTheDocument();

    await user.click(createOption);

    expect(defaultProps.onCreateAndAssignTag).toHaveBeenCalledWith("NewTag");
  });

  it("shows folder selector when folders are provided", () => {
    render(<EditLinkDialog {...defaultProps} folders={sampleFolders} />);

    expect(screen.getByLabelText("文件夹")).toBeInTheDocument();
    const select = screen.getByLabelText("文件夹") as HTMLSelectElement;
    expect(select.options.length).toBe(3); // Inbox + 2 folders
    expect(select.options[0].textContent).toBe("Inbox");
    expect(select.options[1].textContent).toBe("工作");
    expect(select.options[2].textContent).toBe("个人");
  });

  it("does NOT show folder selector when folders array is empty", () => {
    render(<EditLinkDialog {...defaultProps} folders={[]} />);

    expect(screen.queryByLabelText("文件夹")).not.toBeInTheDocument();
  });
});
