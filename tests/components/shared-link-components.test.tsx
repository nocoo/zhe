import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagPicker, CopyUrlButton } from "@/components/dashboard/shared-link-components";
import type { Tag } from "@/models/types";

vi.mock("@/models/tags", () => ({
  getTagStyles: (name: string) => ({
    badge: { backgroundColor: `mock-bg-${name}`, color: `mock-color-${name}` },
    dot: { backgroundColor: `mock-dot-${name}` },
  }),
}));

const mockCopyToClipboard = vi.fn();
vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return {
    ...actual,
    copyToClipboard: (...args: unknown[]) => mockCopyToClipboard(...args),
  };
});

const sampleTags: Tag[] = [
  { id: "t1", userId: "u1", name: "Work", color: "blue", createdAt: new Date() },
  { id: "t2", userId: "u1", name: "Personal", color: "green", createdAt: new Date() },
  { id: "t3", userId: "u1", name: "Design", color: "purple", createdAt: new Date() },
];

describe("shared-link-components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================================================================
  // TagPicker
  // ==================================================================

  describe("TagPicker", () => {
    it("calls onSelectTag when a tag is selected", async () => {
      const user = userEvent.setup();
      const onSelectTag = vi.fn();
      const onCreateTag = vi.fn();

      render(
        <TagPicker
          allTags={sampleTags}
          assignedTagIds={new Set(["t1"])}
          onSelectTag={onSelectTag}
          onCreateTag={onCreateTag}
        />,
      );

      // Open picker
      await user.click(screen.getByTestId("tag-picker-trigger"));

      // Select an unassigned tag
      await user.click(screen.getByText("Personal"));

      expect(onSelectTag).toHaveBeenCalledWith("t2");
    });

    it("calls onCreateTag when creating a new tag", async () => {
      const user = userEvent.setup();
      const onSelectTag = vi.fn();
      const onCreateTag = vi.fn();

      render(
        <TagPicker
          allTags={sampleTags}
          assignedTagIds={new Set()}
          onSelectTag={onSelectTag}
          onCreateTag={onCreateTag}
        />,
      );

      // Open picker
      await user.click(screen.getByTestId("tag-picker-trigger"));

      // Type a new tag name
      const input = screen.getByPlaceholderText("搜索或创建标签...");
      await user.type(input, "NewTag");

      // Click the create option
      await user.click(screen.getByTestId("tag-create-option"));

      expect(onCreateTag).toHaveBeenCalledWith("NewTag");
    });

    it("does not call onCreateTag with empty search", async () => {
      const user = userEvent.setup();
      const onCreateTag = vi.fn();

      render(
        <TagPicker
          allTags={[]}
          assignedTagIds={new Set()}
          onSelectTag={vi.fn()}
          onCreateTag={onCreateTag}
        />,
      );

      // Open picker — no create option with empty search
      await user.click(screen.getByTestId("tag-picker-trigger"));

      expect(screen.queryByTestId("tag-create-option")).not.toBeInTheDocument();
      expect(onCreateTag).not.toHaveBeenCalled();
    });
  });

  // ==================================================================
  // CopyUrlButton
  // ==================================================================

  describe("CopyUrlButton", () => {
    it("copies URL to clipboard on click", async () => {
      mockCopyToClipboard.mockResolvedValue(true);
      const user = userEvent.setup();

      render(<CopyUrlButton url="https://example.com" />);

      await user.click(screen.getByLabelText("Copy original URL"));

      expect(mockCopyToClipboard).toHaveBeenCalledWith("https://example.com");
    });

    it("shows check icon after successful copy", async () => {
      mockCopyToClipboard.mockResolvedValue(true);
      const user = userEvent.setup();

      render(<CopyUrlButton url="https://example.com" />);

      await user.click(screen.getByLabelText("Copy original URL"));

      // After copy, the Check icon should appear (success class)
      const btn = screen.getByLabelText("Copy original URL");
      const checkIcon = btn.querySelector(".text-success");
      expect(checkIcon).toBeInTheDocument();
    });

    it("resets check icon after timeout", async () => {
      vi.useFakeTimers();
      mockCopyToClipboard.mockResolvedValue(true);

      render(<CopyUrlButton url="https://example.com" />);

      // Click using fireEvent since userEvent doesn't work well with fake timers
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Copy original URL"));
      });

      // Check icon appears
      let btn = screen.getByLabelText("Copy original URL");
      expect(btn.querySelector(".text-success")).toBeInTheDocument();

      // Advance past the 800ms timeout
      act(() => {
        vi.advanceTimersByTime(900);
      });

      btn = screen.getByLabelText("Copy original URL");
      expect(btn.querySelector(".text-success")).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it("does not show check icon when copy fails", async () => {
      mockCopyToClipboard.mockResolvedValue(false);
      const user = userEvent.setup();

      render(<CopyUrlButton url="https://example.com" />);

      await user.click(screen.getByLabelText("Copy original URL"));

      const btn = screen.getByLabelText("Copy original URL");
      const checkIcon = btn.querySelector(".text-success");
      expect(checkIcon).not.toBeInTheDocument();
    });
  });
});
