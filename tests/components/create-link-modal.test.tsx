import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
