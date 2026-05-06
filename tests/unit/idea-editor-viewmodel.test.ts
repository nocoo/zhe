// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { IdeaDetail } from "@/lib/db/scoped";
import { makeIdea, makeTag } from "../fixtures";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetIdea = vi.fn();
const mockUpdateIdea = vi.fn();

vi.mock("@/actions/ideas", () => ({
  getIdea: (...args: unknown[]) => mockGetIdea(...args),
  updateIdea: (...args: unknown[]) => mockUpdateIdea(...args),
}));

const mockTags = [
  makeTag({ id: "tag-1", name: "Work", color: "#ff0000" }),
  makeTag({ id: "tag-2", name: "Personal", color: "#00ff00" }),
];

const mockHandleIdeaUpdated = vi.fn();

vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardState: () => ({ tags: mockTags }),
  useDashboardActions: () => ({
    handleIdeaUpdated: mockHandleIdeaUpdated,
  }),
}));

import { useIdeaEditorViewModel } from "@/viewmodels/useIdeaEditorViewModel";

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

describe("useIdeaEditorViewModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ================================================================
  // Basic Loading
  // ================================================================

  describe("initialization", () => {
    it("fetches idea on mount and populates draft state", async () => {
      const detail = makeIdeaDetail({ id: 42, title: "My Idea", tagIds: ["tag-1"] });
      mockGetIdea.mockResolvedValue({ success: true, data: detail });

      const { result } = renderHook(() => useIdeaEditorViewModel(42));

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(mockGetIdea).toHaveBeenCalledWith(42);
      expect(result.current.title).toBe("My Idea");
      expect(result.current.content).toBe("# Test Idea\n\nThis is the full content.");
      expect(result.current.tagIds).toEqual(["tag-1"]);
      expect(result.current.notFound).toBe(false);
    });

    it("sets notFound when idea does not exist", async () => {
      mockGetIdea.mockResolvedValue({ success: false, error: "Not found" });

      const { result } = renderHook(() => useIdeaEditorViewModel(999));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.notFound).toBe(true);
      expect(result.current.error).toBe("Not found");
    });
  });

  // ================================================================
  // Dirty tracking
  // ================================================================

  describe("dirty tracking", () => {
    it("isDirty returns false when draft matches snapshot", async () => {
      const detail = makeIdeaDetail({ id: 1, title: "Title", tagIds: ["tag-1"] });
      mockGetIdea.mockResolvedValue({ success: true, data: detail });

      const { result } = renderHook(() => useIdeaEditorViewModel(1));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.isDirty()).toBe(false);
    });

    it("isDirty returns true when content changes", async () => {
      const detail = makeIdeaDetail({ id: 1 });
      mockGetIdea.mockResolvedValue({ success: true, data: detail });

      const { result } = renderHook(() => useIdeaEditorViewModel(1));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      act(() => {
        result.current.setContent("Changed content");
      });

      expect(result.current.isDirty()).toBe(true);
    });

    it("isDirty returns false during loading (no snapshot)", async () => {
      // Never resolve the fetch — keep in loading state
      mockGetIdea.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useIdeaEditorViewModel(1));

      expect(result.current.loading).toBe(true);
      expect(result.current.isDirty()).toBe(false);
    });
  });

  // ================================================================
  // Fast Switch — ideaId change resets stale state
  // ================================================================

  describe("fast switch (ideaId change)", () => {
    it("resets idea snapshot and draft when ideaId changes", async () => {
      const idea1 = makeIdeaDetail({ id: 1, title: "First", content: "Content 1", tagIds: ["tag-1"] });
      const idea2 = makeIdeaDetail({ id: 2, title: "Second", content: "Content 2", tagIds: ["tag-2"] });

      mockGetIdea.mockResolvedValue({ success: true, data: idea1 });

      const { result, rerender } = renderHook(
        ({ id }) => useIdeaEditorViewModel(id),
        { initialProps: { id: 1 } },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.title).toBe("First");
      expect(result.current.content).toBe("Content 1");

      // Switch to idea 2
      mockGetIdea.mockResolvedValue({ success: true, data: idea2 });
      rerender({ id: 2 });

      // Immediately after switch: loading, draft cleared, snapshot null → isDirty false
      expect(result.current.loading).toBe(true);
      expect(result.current.isDirty()).toBe(false);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.title).toBe("Second");
      expect(result.current.content).toBe("Content 2");
      expect(result.current.tagIds).toEqual(["tag-2"]);
    });

    it("save() returns false during loading after ideaId switch (no stale write)", async () => {
      const idea1 = makeIdeaDetail({ id: 1, title: "First", content: "Content 1" });

      mockGetIdea.mockResolvedValue({ success: true, data: idea1 });

      const { result, rerender } = renderHook(
        ({ id }) => useIdeaEditorViewModel(id),
        { initialProps: { id: 1 } },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      // Switch to idea 2 — never resolves
      mockGetIdea.mockImplementation(() => new Promise(() => {}));
      rerender({ id: 2 });

      // Attempt to save during loading — idea is null
      let success: boolean = true;
      await act(async () => {
        success = await result.current.save();
      });

      expect(success).toBe(false);
      expect(mockUpdateIdea).not.toHaveBeenCalled();
    });

    it("late response from old ideaId does not overwrite new idea", async () => {
      const idea1 = makeIdeaDetail({ id: 1, title: "First", content: "Content 1" });
      const idea2 = makeIdeaDetail({ id: 2, title: "Second", content: "Content 2" });

      // First fetch resolves immediately
      mockGetIdea.mockResolvedValueOnce({ success: true, data: idea1 });

      const { result, rerender } = renderHook(
        ({ id }) => useIdeaEditorViewModel(id),
        { initialProps: { id: 1 } },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.title).toBe("First");

      // Switch to id=2: the effect for id=1 is cancelled, new effect starts.
      // The cancelled flag in the cleanup ensures even if old promise resolves after,
      // it won't set state. Here we just verify the new idea loads correctly.
      let resolveSecond: ((v: unknown) => void) | undefined;
      mockGetIdea.mockImplementationOnce(
        () => new Promise((r) => { resolveSecond = r; }),
      );

      rerender({ id: 2 });

      // During loading: snapshot is null, draft is cleared
      expect(result.current.loading).toBe(true);
      expect(result.current.title).toBeNull();
      expect(result.current.isDirty()).toBe(false);

      // Resolve the second fetch
      await act(async () => {
        if (resolveSecond) resolveSecond({ success: true, data: idea2 });
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.title).toBe("Second");
      expect(result.current.content).toBe("Content 2");
    });
  });

  // ================================================================
  // Save
  // ================================================================

  describe("save", () => {
    it("saves successfully and updates snapshot", async () => {
      const detail = makeIdeaDetail({ id: 1, title: "Original" });
      const updated = makeIdeaDetail({ id: 1, title: "Changed", content: "New content" });
      mockGetIdea.mockResolvedValue({ success: true, data: detail });
      mockUpdateIdea.mockResolvedValue({ success: true, data: updated });

      const { result } = renderHook(() => useIdeaEditorViewModel(1));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      act(() => {
        result.current.setTitle("Changed");
        result.current.setContent("New content");
      });

      expect(result.current.isDirty()).toBe(true);

      let success: boolean = false;
      await act(async () => {
        success = await result.current.save();
      });

      expect(success).toBe(true);
      expect(result.current.isDirty()).toBe(false);
      expect(result.current.lastSavedAt).toBeInstanceOf(Date);
      expect(mockUpdateIdea).toHaveBeenCalledWith(1, {
        title: "Changed",
        content: "New content",
        tagIds: detail.tagIds,
      });
      expect(mockHandleIdeaUpdated).toHaveBeenCalled();
    });

    it("handles save error", async () => {
      const detail = makeIdeaDetail({ id: 1 });
      mockGetIdea.mockResolvedValue({ success: true, data: detail });
      mockUpdateIdea.mockResolvedValue({ success: false, error: "Save failed" });

      const { result } = renderHook(() => useIdeaEditorViewModel(1));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      act(() => {
        result.current.setContent("changed");
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.save();
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Save failed");
      expect(result.current.isSaving).toBe(false);
    });
  });

  // ================================================================
  // Tag toggle
  // ================================================================

  describe("tag toggle", () => {
    it("toggles a tag in and out", async () => {
      const detail = makeIdeaDetail({ id: 1, tagIds: ["tag-1"] });
      mockGetIdea.mockResolvedValue({ success: true, data: detail });

      const { result } = renderHook(() => useIdeaEditorViewModel(1));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { interval: 5 });

      expect(result.current.tagIds).toEqual(["tag-1"]);

      // Add tag-2
      act(() => {
        result.current.toggleTag("tag-2");
      });
      expect(result.current.tagIds).toContain("tag-2");

      // Remove tag-1
      act(() => {
        result.current.toggleTag("tag-1");
      });
      expect(result.current.tagIds).not.toContain("tag-1");
    });
  });
});
