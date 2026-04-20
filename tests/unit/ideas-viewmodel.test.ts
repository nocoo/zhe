// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { IdeaDetail } from "@/lib/db/scoped";
import { unwrap } from "../test-utils";
import { makeIdea, makeTag } from "../fixtures";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetIdeas = vi.fn();
const mockCreateIdea = vi.fn();
const mockUpdateIdea = vi.fn();
const mockDeleteIdea = vi.fn();

vi.mock("@/actions/ideas", () => ({
  getIdeas: (...args: unknown[]) => mockGetIdeas(...args),
  createIdea: (...args: unknown[]) => mockCreateIdea(...args),
  updateIdea: (...args: unknown[]) => mockUpdateIdea(...args),
  deleteIdea: (...args: unknown[]) => mockDeleteIdea(...args),
}));

const mockTags = [
  makeTag({ id: "tag-1", name: "Work", color: "#ff0000" }),
  makeTag({ id: "tag-2", name: "Personal", color: "#00ff00" }),
];

const mockHandleIdeaCreated = vi.fn();
const mockHandleIdeaUpdated = vi.fn();
const mockHandleIdeaDeleted = vi.fn();

vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardState: () => ({ tags: mockTags }),
  useDashboardActions: () => ({
    handleIdeaCreated: mockHandleIdeaCreated,
    handleIdeaUpdated: mockHandleIdeaUpdated,
    handleIdeaDeleted: mockHandleIdeaDeleted,
  }),
}));

import { useIdeasViewModel } from "@/viewmodels/useIdeasViewModel";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeIdeaDetail = (overrides: Partial<IdeaDetail> = {}): IdeaDetail => ({
  ...makeIdea(overrides),
  content: "# Test Idea\n\nThis is the full content.",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useIdeasViewModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdeas.mockResolvedValue({ success: true, data: [] });
  });

  // ================================================================
  // Initialization
  // ================================================================

  describe("initialization", () => {
    it("fetches ideas on mount", async () => {
      const ideas = [makeIdea({ id: 1 }), makeIdea({ id: 2, title: "Second" })];
      mockGetIdeas.mockResolvedValue({ success: true, data: ideas });

      const { result } = renderHook(() => useIdeasViewModel());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(mockGetIdeas).toHaveBeenCalledTimes(1);
      expect(result.current.ideas).toHaveLength(2);
    });

    it("handles fetch error gracefully", async () => {
      mockGetIdeas.mockResolvedValue({ success: false, error: "Network error" });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.ideas).toEqual([]);
    });

    it("starts with default view settings", async () => {
      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.viewMode).toBe("grid");
      expect(result.current.sortBy).toBe("updatedAt");
      expect(result.current.searchQuery).toBe("");
      expect(result.current.selectedTagId).toBeNull();
    });
  });

  // ================================================================
  // Filtering
  // ================================================================

  describe("filtering", () => {
    it("filters ideas by search query", async () => {
      const ideas = [
        makeIdea({ id: 1, title: "React hooks", excerpt: "About hooks" }),
        makeIdea({ id: 2, title: "TypeScript tips", excerpt: "Type safety" }),
      ];
      mockGetIdeas.mockResolvedValue({ success: true, data: ideas });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      act(() => {
        result.current.setSearchQuery("react");
      });

      expect(result.current.ideas).toHaveLength(1);
      expect(unwrap(result.current.ideas[0]).title).toBe("React hooks");
    });

    it("filters ideas by tag", async () => {
      const ideas = [
        makeIdea({ id: 1, tagIds: ["tag-1"] }),
        makeIdea({ id: 2, tagIds: ["tag-2"] }),
        makeIdea({ id: 3, tagIds: [] }),
      ];
      mockGetIdeas.mockResolvedValue({ success: true, data: ideas });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      act(() => {
        result.current.setSelectedTagId("tag-1");
      });

      expect(result.current.ideas).toHaveLength(1);
      expect(unwrap(result.current.ideas[0]).id).toBe(1);
    });

    it("clears filters", async () => {
      const ideas = [makeIdea({ id: 1 }), makeIdea({ id: 2 })];
      mockGetIdeas.mockResolvedValue({ success: true, data: ideas });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      act(() => {
        result.current.setSearchQuery("test");
        result.current.setSelectedTagId("tag-1");
      });

      act(() => {
        result.current.clearFilters();
      });

      expect(result.current.searchQuery).toBe("");
      expect(result.current.selectedTagId).toBeNull();
    });

    it("computes tagFilterOptions from ideas", async () => {
      const ideas = [
        makeIdea({ id: 1, tagIds: ["tag-1"] }),
        makeIdea({ id: 2, tagIds: ["tag-1", "tag-2"] }),
      ];
      mockGetIdeas.mockResolvedValue({ success: true, data: ideas });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.tagFilterOptions).toHaveLength(2);
    });
  });

  // ================================================================
  // Sorting
  // ================================================================

  describe("sorting", () => {
    it("sorts by updatedAt descending by default", async () => {
      const ideas = [
        makeIdea({ id: 1, updatedAt: new Date("2026-01-10") }),
        makeIdea({ id: 2, updatedAt: new Date("2026-01-20") }),
      ];
      mockGetIdeas.mockResolvedValue({ success: true, data: ideas });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(unwrap(result.current.ideas[0]).id).toBe(2);
      expect(unwrap(result.current.ideas[1]).id).toBe(1);
    });

    it("sorts by createdAt when selected", async () => {
      const ideas = [
        makeIdea({ id: 1, createdAt: new Date("2026-01-20"), updatedAt: new Date("2026-01-10") }),
        makeIdea({ id: 2, createdAt: new Date("2026-01-10"), updatedAt: new Date("2026-01-20") }),
      ];
      mockGetIdeas.mockResolvedValue({ success: true, data: ideas });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      act(() => {
        result.current.setSortBy("createdAt");
      });

      expect(unwrap(result.current.ideas[0]).id).toBe(1);
      expect(unwrap(result.current.ideas[1]).id).toBe(2);
    });
  });

  // ================================================================
  // View Mode
  // ================================================================

  describe("view mode", () => {
    it("toggles view mode", async () => {
      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.viewMode).toBe("grid");

      act(() => {
        result.current.setViewMode("list");
      });

      expect(result.current.viewMode).toBe("list");
    });
  });

  // ================================================================
  // CRUD Operations
  // ================================================================

  describe("create idea", () => {
    it("creates idea and updates local state", async () => {
      const newIdea = makeIdeaDetail({ id: 100, title: "New Idea" });
      mockCreateIdea.mockResolvedValue({ success: true, data: newIdea });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleCreateIdea({
          content: "# New Idea\n\nContent",
          title: "New Idea",
        });
      });

      expect(success).toBe(true);
      expect(result.current.ideas).toHaveLength(1);
      expect(unwrap(result.current.ideas[0]).id).toBe(100);
      expect(mockHandleIdeaCreated).toHaveBeenCalled();
      expect(result.current.isCreateModalOpen).toBe(false);
    });

    it("handles create error", async () => {
      mockCreateIdea.mockResolvedValue({ success: false, error: "Failed to create" });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleCreateIdea({ content: "Test" });
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Failed to create");
    });
  });

  describe("update idea", () => {
    it("updates idea and local state", async () => {
      const existingIdea = makeIdea({ id: 1 });
      const updatedIdea = makeIdeaDetail({ id: 1, title: "Updated Title" });
      mockGetIdeas.mockResolvedValue({ success: true, data: [existingIdea] });
      mockUpdateIdea.mockResolvedValue({ success: true, data: updatedIdea });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleUpdateIdea(1, { title: "Updated Title" });
      });

      expect(success).toBe(true);
      expect(unwrap(result.current.ideas[0]).title).toBe("Updated Title");
      expect(mockHandleIdeaUpdated).toHaveBeenCalled();
    });

    it("handles update error", async () => {
      mockUpdateIdea.mockResolvedValue({ success: false, error: "Not found" });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleUpdateIdea(999, { title: "New" });
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Not found");
    });
  });

  describe("delete idea", () => {
    it("deletes idea and updates local state", async () => {
      const ideas = [makeIdea({ id: 1 }), makeIdea({ id: 2 })];
      mockGetIdeas.mockResolvedValue({ success: true, data: ideas });
      mockDeleteIdea.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.ideas).toHaveLength(2);

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleDeleteIdea(1);
      });

      expect(success).toBe(true);
      expect(result.current.ideas).toHaveLength(1);
      expect(unwrap(result.current.ideas[0]).id).toBe(2);
      expect(mockHandleIdeaDeleted).toHaveBeenCalledWith(1);
    });

    it("handles delete error", async () => {
      mockDeleteIdea.mockResolvedValue({ success: false, error: "Cannot delete" });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleDeleteIdea(1);
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Cannot delete");
    });
  });

  describe("delete confirmation flow", () => {
    it("opens and cancels delete confirmation", async () => {
      const idea = makeIdea({ id: 1 });
      mockGetIdeas.mockResolvedValue({ success: true, data: [idea] });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      act(() => {
        result.current.confirmDelete(idea);
      });

      expect(result.current.isDeleteConfirmOpen).toBe(true);
      expect(result.current.ideaToDelete).toEqual(idea);

      act(() => {
        result.current.cancelDelete();
      });

      expect(result.current.isDeleteConfirmOpen).toBe(false);
      expect(result.current.ideaToDelete).toBeNull();
    });

    it("executes delete from confirmation", async () => {
      const idea = makeIdea({ id: 1 });
      mockGetIdeas.mockResolvedValue({ success: true, data: [idea] });
      mockDeleteIdea.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      act(() => {
        result.current.confirmDelete(idea);
      });

      await act(async () => {
        await result.current.executeDelete();
      });

      expect(result.current.ideas).toHaveLength(0);
      expect(result.current.isDeleteConfirmOpen).toBe(false);
    });
  });

  // ================================================================
  // Exception handling (thrown errors, not error responses)
  // ================================================================

  describe("exception handling", () => {
    it("handles fetch exception gracefully", async () => {
      mockGetIdeas.mockRejectedValue(new Error("Network failure"));

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.ideas).toEqual([]);
    });

    it("ignores fetch result after unmount (cancelled)", async () => {
      let resolve: ((v: unknown) => void) | undefined;
      mockGetIdeas.mockImplementation(
        () => new Promise((r) => { resolve = r; }),
      );

      const { result, unmount } = renderHook(() => useIdeasViewModel());
      expect(result.current.loading).toBe(true);

      // Unmount before fetch resolves
      unmount();

      // Resolve after unmount — should not throw
      if (resolve) resolve({ success: true, data: [makeIdea({ id: 99 })] });
      // No assertion needed; just verifying no crash
    });

    it("handles create idea exception", async () => {
      mockCreateIdea.mockRejectedValue(new Error("Server down"));

      const { result } = renderHook(() => useIdeasViewModel());
      await waitFor(() => expect(result.current.loading).toBe(false), { interval: 5 });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleCreateIdea({ content: "Test" });
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Failed to create idea");
      expect(result.current.isSaving).toBe(false);
    });

    it("handles update idea exception", async () => {
      mockUpdateIdea.mockRejectedValue(new Error("Server down"));

      const { result } = renderHook(() => useIdeasViewModel());
      await waitFor(() => expect(result.current.loading).toBe(false), { interval: 5 });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleUpdateIdea(1, { title: "X" });
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Failed to update idea");
      expect(result.current.isSaving).toBe(false);
    });

    it("handles delete idea exception", async () => {
      mockDeleteIdea.mockRejectedValue(new Error("Server down"));

      const { result } = renderHook(() => useIdeasViewModel());
      await waitFor(() => expect(result.current.loading).toBe(false), { interval: 5 });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleDeleteIdea(1);
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Failed to delete idea");
      expect(result.current.isDeleting).toBe(false);
    });
  });

  // ================================================================
  // Helpers
  // ================================================================

  describe("helpers", () => {
    it("gets tag by ID", async () => {
      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      const tag = result.current.getTagById("tag-1");
      expect(tag?.name).toBe("Work");

      const notFound = result.current.getTagById("nonexistent");
      expect(notFound).toBeUndefined();
    });

    it("clears error", async () => {
      mockCreateIdea.mockResolvedValue({ success: false, error: "Error" });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      await act(async () => {
        await result.current.handleCreateIdea({ content: "test" });
      });

      expect(result.current.error).toBe("Error");

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });

    it("refreshes ideas", async () => {
      mockGetIdeas.mockResolvedValue({ success: true, data: [] });

      const { result } = renderHook(() => useIdeasViewModel());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      const newIdeas = [makeIdea({ id: 100 })];
      mockGetIdeas.mockResolvedValue({ success: true, data: newIdeas });

      await act(async () => {
        await result.current.refreshIdeas();
      });

      expect(result.current.allIdeas).toHaveLength(1);
      expect(unwrap(result.current.allIdeas[0]).id).toBe(100);
    });
  });
});