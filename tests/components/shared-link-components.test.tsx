// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagPicker } from "@/components/dashboard/shared-link-components";
import type { Tag } from "@/models/types";

vi.mock("@/models/tags", () => ({
  getTagStyles: (name: string) => ({
    badge: { backgroundColor: `mock-bg-${name}`, color: `mock-color-${name}` },
    dot: { backgroundColor: `mock-dot-${name}` },
  }),
}));

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
      fireEvent.change(input, { target: { value: "NewTag" } });

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

});