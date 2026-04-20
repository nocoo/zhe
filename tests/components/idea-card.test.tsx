// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { IdeaCard, IdeaRow } from "@/components/dashboard/idea-card";
import { makeIdea, makeTag } from "../fixtures";

// Mock tag styles
vi.mock("@/models/tags", () => ({
  getTagStyles: (color: string) => ({
    badge: { backgroundColor: `mock-bg-${color}`, color: `mock-color-${color}` },
    dot: { backgroundColor: `mock-dot-${color}` },
  }),
}));

// Test helpers

import type { Tag } from "@/models/types";

describe("IdeaCard", () => {
  const defaultProps = {
    idea: makeIdea(),
    tags: [] as Tag[],
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("rendering", () => {
    it("renders idea title", () => {
      render(<IdeaCard {...defaultProps} />);
      expect(screen.getByText("Test Idea")).toBeInTheDocument();
    });

    it("renders timestamp when title is null", () => {
      render(
        <IdeaCard
          {...defaultProps}
          idea={makeIdea({ title: null })}
        />
      );
      // IdeaCard renders the title in an h3, check it contains formatted date
      const titleElement = screen.getByRole("heading", { level: 3 });
      expect(titleElement.textContent).toMatch(/Jan 15, 2026/);
    });

    it("renders excerpt when available", () => {
      render(
        <IdeaCard
          {...defaultProps}
          idea={makeIdea({ excerpt: "My test excerpt" })}
        />
      );
      expect(screen.getByText("My test excerpt")).toBeInTheDocument();
    });

    it("does not render excerpt section when null", () => {
      render(
        <IdeaCard
          {...defaultProps}
          idea={makeIdea({ excerpt: null })}
        />
      );
      expect(screen.queryByText("This is a test excerpt")).not.toBeInTheDocument();
    });

    it("renders relative date for recently updated ideas", () => {
      // Idea updated 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      render(
        <IdeaCard
          {...defaultProps}
          idea={makeIdea({ updatedAt: twoHoursAgo })}
        />
      );
      expect(screen.getByText("2h ago")).toBeInTheDocument();
    });

    it("renders 'Just now' for ideas updated less than a minute ago", () => {
      const justNow = new Date(Date.now() - 30 * 1000);
      render(
        <IdeaCard
          {...defaultProps}
          idea={makeIdea({ updatedAt: justNow })}
        />
      );
      expect(screen.getByText("Just now")).toBeInTheDocument();
    });

    it("renders 'Yesterday' for ideas updated yesterday", () => {
      const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
      render(
        <IdeaCard
          {...defaultProps}
          idea={makeIdea({ updatedAt: yesterday })}
        />
      );
      expect(screen.getByText("Yesterday")).toBeInTheDocument();
    });
  });

  describe("tags", () => {
    it("renders tag badges when idea has tags", () => {
      const tags = [
        makeTag({ id: "t1", name: "Work" }),
        makeTag({ id: "t2", name: "Personal" }),
      ];
      render(
        <IdeaCard
          {...defaultProps}
          idea={makeIdea({ tagIds: ["t1", "t2"] })}
          tags={tags}
        />
      );
      expect(screen.getByText("Work")).toBeInTheDocument();
      expect(screen.getByText("Personal")).toBeInTheDocument();
    });

    it("limits visible tags to 3 with overflow indicator", () => {
      const tags = [
        makeTag({ id: "t1", name: "Tag1" }),
        makeTag({ id: "t2", name: "Tag2" }),
        makeTag({ id: "t3", name: "Tag3" }),
        makeTag({ id: "t4", name: "Tag4" }),
      ];
      render(
        <IdeaCard
          {...defaultProps}
          idea={makeIdea({ tagIds: ["t1", "t2", "t3", "t4"] })}
          tags={tags}
        />
      );
      expect(screen.getByText("Tag1")).toBeInTheDocument();
      expect(screen.getByText("Tag2")).toBeInTheDocument();
      expect(screen.getByText("Tag3")).toBeInTheDocument();
      expect(screen.queryByText("Tag4")).not.toBeInTheDocument();
      expect(screen.getByText("+1")).toBeInTheDocument();
    });

    it("does not render tags section when idea has no tags", () => {
      render(
        <IdeaCard
          {...defaultProps}
          idea={makeIdea({ tagIds: [] })}
          tags={[makeTag()]}
        />
      );
      expect(screen.queryByText("Work")).not.toBeInTheDocument();
    });
  });

  describe("actions", () => {
    it("calls onClick when card is clicked", () => {
      const onClick = vi.fn();
      render(<IdeaCard {...defaultProps} onClick={onClick} />);
      fireEvent.click(screen.getByText("Test Idea"));
      expect(onClick).toHaveBeenCalledWith(defaultProps.idea);
    });

    it("calls onEdit when edit button is clicked", () => {
      const onEdit = vi.fn();
      render(<IdeaCard {...defaultProps} onEdit={onEdit} />);
      fireEvent.click(screen.getByLabelText("编辑想法"));
      expect(onEdit).toHaveBeenCalledWith(defaultProps.idea);
    });

    it("calls onDelete when delete button is clicked", () => {
      const onDelete = vi.fn();
      render(<IdeaCard {...defaultProps} onDelete={onDelete} />);
      fireEvent.click(screen.getByLabelText("删除想法"));
      expect(onDelete).toHaveBeenCalledWith(defaultProps.idea);
    });

    it("does not trigger onClick when edit button is clicked", () => {
      const onClick = vi.fn();
      render(<IdeaCard {...defaultProps} onClick={onClick} />);
      fireEvent.click(screen.getByLabelText("编辑想法"));
      expect(onClick).not.toHaveBeenCalled();
    });

    it("does not trigger onClick when delete button is clicked", () => {
      const onClick = vi.fn();
      render(<IdeaCard {...defaultProps} onClick={onClick} />);
      fireEvent.click(screen.getByLabelText("删除想法"));
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});

describe("IdeaRow", () => {
  const defaultProps = {
    idea: makeIdea(),
    tags: [] as Tag[],
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("rendering", () => {
    it("renders idea title", () => {
      render(<IdeaRow {...defaultProps} />);
      expect(screen.getByText("Test Idea")).toBeInTheDocument();
    });

    it("renders timestamp when title is null", () => {
      render(
        <IdeaRow
          {...defaultProps}
          idea={makeIdea({ title: null })}
        />
      );
      // IdeaRow renders the title in an h3, check it contains formatted date
      const titleElement = screen.getByRole("heading", { level: 3 });
      expect(titleElement.textContent).toMatch(/Jan 15, 2026/);
    });

    it("renders excerpt when available", () => {
      render(
        <IdeaRow
          {...defaultProps}
          idea={makeIdea({ excerpt: "Row excerpt" })}
        />
      );
      expect(screen.getByText("Row excerpt")).toBeInTheDocument();
    });

    it("does not render excerpt section when null", () => {
      render(
        <IdeaRow
          {...defaultProps}
          idea={makeIdea({ excerpt: null })}
        />
      );
      expect(screen.queryByText("This is a test excerpt")).not.toBeInTheDocument();
    });
  });

  describe("tags", () => {
    it("renders tag dots when idea has tags", () => {
      const tags = [
        makeTag({ id: "t1", name: "Work", color: "#ff0000" }),
        makeTag({ id: "t2", name: "Personal", color: "#00ff00" }),
      ];
      const { container } = render(
        <IdeaRow
          {...defaultProps}
          idea={makeIdea({ tagIds: ["t1", "t2"] })}
          tags={tags}
        />
      );
      // Check for colored dots (rendered as span with rounded-full class)
      const dots = container.querySelectorAll(".rounded-full.h-2.w-2");
      expect(dots.length).toBe(2);
    });

    it("limits visible tag dots to 2 with overflow count", () => {
      const tags = [
        makeTag({ id: "t1", name: "Tag1" }),
        makeTag({ id: "t2", name: "Tag2" }),
        makeTag({ id: "t3", name: "Tag3" }),
      ];
      render(
        <IdeaRow
          {...defaultProps}
          idea={makeIdea({ tagIds: ["t1", "t2", "t3"] })}
          tags={tags}
        />
      );
      expect(screen.getByText("+1")).toBeInTheDocument();
    });
  });

  describe("actions", () => {
    it("calls onClick when row is clicked", () => {
      const onClick = vi.fn();
      render(<IdeaRow {...defaultProps} onClick={onClick} />);
      fireEvent.click(screen.getByText("Test Idea"));
      expect(onClick).toHaveBeenCalledWith(defaultProps.idea);
    });

    it("calls onEdit when edit button is clicked", () => {
      const onEdit = vi.fn();
      render(<IdeaRow {...defaultProps} onEdit={onEdit} />);
      fireEvent.click(screen.getByLabelText("编辑想法"));
      expect(onEdit).toHaveBeenCalledWith(defaultProps.idea);
    });

    it("calls onDelete when delete button is clicked", () => {
      const onDelete = vi.fn();
      render(<IdeaRow {...defaultProps} onDelete={onDelete} />);
      fireEvent.click(screen.getByLabelText("删除想法"));
      expect(onDelete).toHaveBeenCalledWith(defaultProps.idea);
    });

    it("does not trigger onClick when action buttons are clicked", () => {
      const onClick = vi.fn();
      render(<IdeaRow {...defaultProps} onClick={onClick} />);

      fireEvent.click(screen.getByLabelText("编辑想法"));
      fireEvent.click(screen.getByLabelText("删除想法"));

      expect(onClick).not.toHaveBeenCalled();
    });
  });
});