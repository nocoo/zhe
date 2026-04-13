import { describe, it, expect } from "vitest";
import { filterIdeas } from "@/models/ideas";
import type { IdeaListItem } from "@/lib/db/scoped";
import type { Tag } from "@/models/types";

// Helper to create test ideas
const createIdea = (overrides: Partial<IdeaListItem> = {}): IdeaListItem => ({
  id: 1,
  title: "Test Idea",
  excerpt: "This is a test excerpt",
  tagIds: [],
  createdAt: new Date("2026-01-15T10:00:00Z"),
  updatedAt: new Date("2026-01-15T12:00:00Z"),
  ...overrides,
});

// Helper to create test tags
const createTag = (overrides: Partial<Tag> = {}): Tag => ({
  id: "tag-1",
  userId: "user-1",
  name: "Work",
  color: "#ff0000",
  createdAt: new Date("2026-01-01"),
  ...overrides,
});

describe("filterIdeas", () => {
  describe("basic filtering", () => {
    it("returns empty array for empty query", () => {
      const ideas = [createIdea()];
      expect(filterIdeas(ideas, "")).toEqual([]);
      expect(filterIdeas(ideas, "   ")).toEqual([]);
    });

    it("matches title (case-insensitive)", () => {
      const ideas = [
        createIdea({ id: 1, title: "React Hooks Guide" }),
        createIdea({ id: 2, title: "TypeScript Tips" }),
      ];

      const result = filterIdeas(ideas, "react");
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(1);
    });

    it("matches excerpt (case-insensitive)", () => {
      const ideas = [
        createIdea({ id: 1, title: "Idea 1", excerpt: "Contains react patterns" }),
        createIdea({ id: 2, title: "Idea 2", excerpt: "About typescript" }),
      ];

      const result = filterIdeas(ideas, "REACT");
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(1);
    });

    it("handles null title", () => {
      const ideas = [
        createIdea({ id: 1, title: null, excerpt: "Some content" }),
      ];

      const result = filterIdeas(ideas, "content");
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(1);

      const noMatch = filterIdeas(ideas, "title");
      expect(noMatch).toHaveLength(0);
    });

    it("handles null excerpt", () => {
      const ideas = [
        createIdea({ id: 1, title: "My Idea", excerpt: null }),
      ];

      const result = filterIdeas(ideas, "idea");
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(1);

      const noMatch = filterIdeas(ideas, "excerpt");
      expect(noMatch).toHaveLength(0);
    });
  });

  describe("tag filtering", () => {
    it("matches tag names when context is provided", () => {
      const tags = [
        createTag({ id: "tag-1", name: "Frontend" }),
        createTag({ id: "tag-2", name: "Backend" }),
      ];
      const ideas = [
        createIdea({ id: 1, title: "API Design", tagIds: ["tag-2"] }),
        createIdea({ id: 2, title: "UI Components", tagIds: ["tag-1"] }),
      ];

      const result = filterIdeas(ideas, "frontend", { tags });
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(2);
    });

    it("does not match tags when context is not provided", () => {
      const ideas = [
        createIdea({ id: 1, title: "API Design", tagIds: ["tag-1"] }),
      ];

      // Without context, tag search won't work
      const result = filterIdeas(ideas, "frontend");
      expect(result).toHaveLength(0);
    });

    it("handles multiple tags on a single idea", () => {
      const tags = [
        createTag({ id: "tag-1", name: "React" }),
        createTag({ id: "tag-2", name: "Testing" }),
      ];
      const ideas = [
        createIdea({ id: 1, title: "Component Tests", tagIds: ["tag-1", "tag-2"] }),
      ];

      // Should match either tag
      expect(filterIdeas(ideas, "react", { tags })).toHaveLength(1);
      expect(filterIdeas(ideas, "testing", { tags })).toHaveLength(1);
    });

    it("handles ideas with empty tagIds", () => {
      const tags = [createTag({ id: "tag-1", name: "Important" })];
      const ideas = [
        createIdea({ id: 1, title: "Untagged Idea", tagIds: [] }),
      ];

      // Should not crash on empty tagIds
      const result = filterIdeas(ideas, "important", { tags });
      expect(result).toHaveLength(0);
    });

    it("handles tagIds referencing non-existent tags", () => {
      const tags = [createTag({ id: "tag-1", name: "Known" })];
      const ideas = [
        createIdea({ id: 1, title: "Orphan Tags", tagIds: ["tag-unknown"] }),
      ];

      // Should not crash on unknown tag IDs
      const result = filterIdeas(ideas, "unknown", { tags });
      expect(result).toHaveLength(0);
    });
  });

  describe("combined matching", () => {
    it("matches any field (title, excerpt, or tag)", () => {
      const tags = [createTag({ id: "tag-1", name: "DevOps" })];
      const ideas = [
        createIdea({ id: 1, title: "React Guide", excerpt: null, tagIds: [] }),
        createIdea({ id: 2, title: "Idea 2", excerpt: "Contains react code", tagIds: [] }),
        createIdea({ id: 3, title: "CI Pipeline", excerpt: "Build process", tagIds: ["tag-1"] }),
      ];

      // Match by title
      const byTitle = filterIdeas(ideas, "react", { tags });
      expect(byTitle).toHaveLength(2); // Ideas 1 and 2

      // Match by excerpt
      const byExcerpt = filterIdeas(ideas, "build", { tags });
      expect(byExcerpt).toHaveLength(1);
      expect(byExcerpt[0]?.id).toBe(3);

      // Match by tag
      const byTag = filterIdeas(ideas, "devops", { tags });
      expect(byTag).toHaveLength(1);
      expect(byTag[0]?.id).toBe(3);
    });
  });
});
