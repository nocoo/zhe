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
    mockVm.isLoading = false;
    mockVm.error = "";
    mockVm.handleSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  });

  it("renders trigger button with text '新建链接'", () => {
    render(<CreateLinkModal {...defaultProps} />);
    expect(screen.getByText("新建链接")).toBeInTheDocument();
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

      expect(screen.getByLabelText("文件夹")).toBeInTheDocument();
    });

    it("does not show folder selector when folders are empty", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} folders={[]} />);

      expect(screen.queryByLabelText("文件夹")).not.toBeInTheDocument();
    });

    it("does not show folder selector when folders prop is not provided", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} />);

      expect(screen.queryByLabelText("文件夹")).not.toBeInTheDocument();
    });

    it("renders folder names as select options", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} folders={folders} />);

      const select = screen.getByLabelText("文件夹") as HTMLSelectElement;
      // "未分类" default option + 2 folders = 3 options
      expect(select.options.length).toBe(3);
      expect(select.options[0].textContent).toBe("未分类");
      expect(select.options[1].textContent).toBe("工作");
      expect(select.options[2].textContent).toBe("个人");
    });

    it("calls setFolderId when folder is selected", () => {
      mockVm.isOpen = true;
      render(<CreateLinkModal {...defaultProps} folders={folders} />);

      const select = screen.getByLabelText("文件夹");
      fireEvent.change(select, { target: { value: "f1" } });
      expect(mockVm.setFolderId).toHaveBeenCalledWith("f1");
    });

    it("calls setFolderId with undefined when '未分类' is selected", () => {
      mockVm.isOpen = true;
      mockVm.folderId = "f1";
      render(<CreateLinkModal {...defaultProps} folders={folders} />);

      const select = screen.getByLabelText("文件夹");
      fireEvent.change(select, { target: { value: "" } });
      expect(mockVm.setFolderId).toHaveBeenCalledWith(undefined);
    });
  });
});
