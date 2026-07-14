// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock tag actions
vi.mock("@/actions/tags", () => ({
  createTag: vi.fn(),
  addTagToLink: vi.fn(),
  removeTagFromLink: vi.fn(),
}));

import type { LinkTag, Tag } from "@/models/types";
import { useLinkMutations } from "@/viewmodels/useLinkMutations";

describe("useLinkMutations — getUnassignedTags", () => {
  const now = new Date();
  const allTags: Tag[] = [
    { id: "tag-1", name: "React", color: "#f00", userId: "u1", createdAt: now },
    { id: "tag-2", name: "Vue", color: "#0f0", userId: "u1", createdAt: now },
    { id: "tag-3", name: "Svelte", color: "#00f", userId: "u1", createdAt: now },
  ];

  const allLinkTags: LinkTag[] = [{ linkId: 1, tagId: "tag-1" }];

  const callbacks = {
    onLinkUpdated: vi.fn(),
    onTagCreated: vi.fn(),
    onLinkTagAdded: vi.fn(),
    onLinkTagRemoved: vi.fn(),
  };

  it("returns tags not assigned to a given link", () => {
    const { result } = renderHook(() => useLinkMutations(allTags, allLinkTags, callbacks));

    const unassigned = result.current.getUnassignedTags(1);

    expect(unassigned).toHaveLength(2);
    expect(unassigned.map((t) => t.id)).toEqual(["tag-2", "tag-3"]);
  });
});
