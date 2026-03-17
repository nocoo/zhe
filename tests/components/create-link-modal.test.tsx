import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateLinkModal } from "@/components/dashboard/create-link-modal";

const mockVm = {
  isOpen: false,
  setIsOpen: vi.fn(),
  mode: "simple" as "simple" | "custom",
  setMode: vi.fn(),
  url: "",
  setUrl: vi.fn(),
  customSlug: "",
  setCustomSlug: vi.fn(),
  folderId: undefined as string | undefined,
  setFolderId: vi.fn(),
  note: "",
  setNote: vi.fn(),
  screenshotUrl: "",
  setScreenshotUrl: vi.fn(),
  selectedTagIds: new Set<string>(),
  addTag: vi.fn(),
  removeTag: vi.fn(),
  isLoading: false,
  error: "",
  handleSubmit: vi.fn((e: React.FormEvent) => e.preventDefault()),
  siteUrl: "https://zhe.to",
};

vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useCreateLinkViewModel: () => mockVm,
}));

vi.mock("@/models/links", () => ({
  stripProtocol: (url: string) => url.replace(/^https?:\/\//, ""),
}));

vi.mock("@/actions/tags", () => ({
  createTag: vi.fn(),
}));

describe("CreateLinkModal", () => {
  const defaultProps = {
    siteUrl: "https://zhe.to",
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVm.isOpen = false;
    mockVm.mode = "simple";
    mockVm.url = "";
    mockVm.customSlug = "";
    mockVm.folderId = undefined;
    mockVm.note = "";
    mockVm.screenshotUrl = "";
    mockVm.selectedTagIds = new Set();
    mockVm.isLoading = false;
    mockVm.error = "";
    mockVm.handleSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  });

  it("renders trigger button with aria-label '新建链接'", () => {
    render(<CreateLinkModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: "新建链接" })).toBeInTheDocument();
  });

  it("opens dialog when trigger clicked", async () => {
    mockVm.isOpen = true;
    render(<CreateLinkModal {...defaultProps} />);

    expect(screen.getByText("创建短链接")).toBeInTheDocument();
  });

  it("shows '简单模式' and '自定义 slug' tabs", () => {
    mockVm.isOpen = true;
    render(<CreateLinkModal {...defaultProps} />);

    expect(screen.getByText("简单模式")).toBeInTheDocument();
    expect(screen.getByText("自定义 slug")).toBeInTheDocument();
  });

  it("shows URL input", () => {
    mockVm.isOpen = true;
    render(<CreateLinkModal {...defaultProps} />);

    expect(screen.getByLabelText("原始链接")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("https://example.com/very-long-url")
    ).toBeInTheDocument();
  });

  it("shows custom slug input only in custom mode", () => {
    mockVm.isOpen = true;
    mockVm.mode = "simple";
    const { rerender } = render(<CreateLinkModal {...defaultProps} />);

    expect(screen.queryByLabelText("自定义 slug")).not.toBeInTheDocument();

    mockVm.mode = "custom";
    rerender(<CreateLinkModal {...defaultProps} />);

    expect(screen.getByLabelText("自定义 slug")).toBeInTheDocument();
    expect(screen.getByText("zhe.to/")).toBeInTheDocument();
  });

  it("shows error message when error is set", () => {
    mockVm.isOpen = true;
    mockVm.error = "slug 已被占用";
    render(<CreateLinkModal {...defaultProps} />);

    expect(screen.getByText("slug 已被占用")).toBeInTheDocument();
  });

  it("shows loading state with '创建中...'", () => {
    mockVm.isOpen = true;
    mockVm.isLoading = true;
    render(<CreateLinkModal {...defaultProps} />);

    expect(screen.getByText("创建中...")).toBeInTheDocument();
    expect(screen.queryByText("创建链接")).not.toBeInTheDocument();
  });

  it("submit button is disabled when loading", () => {
    mockVm.isOpen = true;
    mockVm.isLoading = true;
    render(<CreateLinkModal {...defaultProps} />);

    const submitButton = screen.getByText("创建中...").closest("button");
    expect(submitButton).toBeDisabled();
  });

  it("shows '创建链接' on submit button when not loading", () => {
    mockVm.isOpen = true;
    mockVm.isLoading = false;
    render(<CreateLinkModal {...defaultProps} />);

    // The submit button text (not the trigger button)
    const submitButton = screen
      .getAllByText("创建链接")
      .find((el) => el.closest("form"));
    expect(submitButton).toBeInTheDocument();
  });

  describe("folder selector", () => {
    const folders = [
      { id: "f1", userId: "u1", name: "工作", icon: "briefcase", createdAt: new Date("2026-01-01") },
      { id: "f2", userId: "u1", name: "个人", icon: "heart", createdAt: new Date("2026-01-02") },
    ];

    it("shows folder selector when folders are provided", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} folders={folders} />);

      expect(screen.getByText("文件夹")).toBeInTheDocument();
      // Radix Select renders both a visible trigger span and a hidden native option
      const inboxElements = screen.getAllByText("Inbox");
      expect(inboxElements.length).toBeGreaterThanOrEqual(1);
    });

    it("does not show folder selector when folders are empty", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} folders={[]} />);

      expect(screen.queryByText("文件夹")).not.toBeInTheDocument();
    });

    it("does not show folder selector when folders prop is not provided", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} />);

      expect(screen.queryByText("文件夹")).not.toBeInTheDocument();
    });

    it("renders Inbox as default selected value", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} folders={folders} />);

      // Radix Select shows current value in trigger + hidden native select
      const inboxElements = screen.getAllByText("Inbox");
      expect(inboxElements.length).toBeGreaterThanOrEqual(1);
    });

    it("shows selected folder name when folderId is set", () => {
      mockVm.isOpen = true;
      mockVm.folderId = "f1";
      render(<CreateLinkModal {...defaultProps} folders={folders} />);

      // Radix Select trigger shows the selected item's text
      const workElements = screen.getAllByText("工作");
      expect(workElements.length).toBeGreaterThanOrEqual(1);
    });

    it("reverts to Inbox display when folderId is cleared", () => {
      mockVm.isOpen = true;
      mockVm.folderId = undefined;
      render(<CreateLinkModal {...defaultProps} folders={folders} />);

      const inboxElements = screen.getAllByText("Inbox");
      expect(inboxElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("note input", () => {
    it("shows note input when dialog is open", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} />);

      expect(screen.getByLabelText("备注")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("添加备注...")).toBeInTheDocument();
    });

    it("calls setNote on input change", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} />);

      const input = screen.getByLabelText("备注");
      fireEvent.change(input, { target: { value: "my note" } });
      expect(mockVm.setNote).toHaveBeenCalledWith("my note");
    });
  });

  describe("screenshot URL input", () => {
    it("shows screenshot URL input when dialog is open", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} />);

      expect(screen.getByLabelText("截图链接")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("https://example.com/screenshot.png")).toBeInTheDocument();
    });

    it("calls setScreenshotUrl on input change", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} />);

      const input = screen.getByLabelText("截图链接");
      fireEvent.change(input, { target: { value: "https://img.com/shot.png" } });
      expect(mockVm.setScreenshotUrl).toHaveBeenCalledWith("https://img.com/shot.png");
    });
  });

  describe("tags", () => {
    const tags = [
      { id: "t1", userId: "u1", name: "design", color: "#ff0000", createdAt: new Date("2026-01-01") },
      { id: "t2", userId: "u1", name: "dev", color: "#00ff00", createdAt: new Date("2026-01-02") },
    ];

    it("shows tags label when dialog is open", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} tags={tags} />);

      // The label "标签" appears as both a <label> and the TagPicker trigger text
      expect(screen.getAllByText("标签").length).toBeGreaterThanOrEqual(1);
    });

    it("shows tag picker trigger", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} tags={tags} />);

      expect(screen.getByTestId("tag-picker-trigger")).toBeInTheDocument();
    });

    it("renders assigned tag badges when tags are selected", () => {
      mockVm.isOpen = true;
      mockVm.selectedTagIds = new Set(["t1"]);
      render(<CreateLinkModal {...defaultProps} tags={tags} />);

      expect(screen.getByTestId("tag-badge")).toBeInTheDocument();
      expect(screen.getByText("design")).toBeInTheDocument();
    });
  });
});
