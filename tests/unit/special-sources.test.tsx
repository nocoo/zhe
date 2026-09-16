// @vitest-environment happy-dom
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLinksListFilters } from "@/components/dashboard/links-list-parts/useLinksListFilters";
import {
  SPECIAL_SOURCES_KEY,
  useSpecialSources,
} from "@/components/dashboard/links-list-parts/useSpecialSources";
import { SpecialSourceFilter } from "@/components/dashboard/special-source-filter";
import {
  DEFAULT_SPECIAL_SOURCES,
  getSpecialSource,
  matchesSpecialSources,
  suggestedFoldersForSource,
} from "@/models/special-sources";
import { makeFolder, makeLink } from "../fixtures";

let folder: string | null = null;
vi.mock("next/navigation", () => ({ useSearchParams: () => ({ get: () => folder }) }));
beforeEach(() => {
  localStorage.clear();
  folder = null;
  vi.restoreAllMocks();
});

describe("shared special-source rules", () => {
  it.each([
    "https://x.com/user/status/123",
    "https://twitter.com/user",
    "https://mobile.twitter.com/user/status/123",
    "https://x.com/i/article/123",
    "https://www.x.com/user/status/123/photo/1",
  ])("excludes all X URL forms by default: %s", (url) => {
    expect(getSpecialSource(url)).toBe("x");
    expect(matchesSpecialSources(url, DEFAULT_SPECIAL_SOURCES)).toBe(false);
    expect(matchesSpecialSources(url, { github: false, x: true })).toBe(true);
  });
  it.each(["https://github.com/a/b", "https://www.github.com/a/b/issues/1"])(
    "includes GitHub by default and allows excluding it: %s",
    (url) => {
      expect(matchesSpecialSources(url, DEFAULT_SPECIAL_SOURCES)).toBe(true);
      expect(matchesSpecialSources(url, { github: false, x: false })).toBe(false);
    },
  );
  it.each(["https://example.com/x.com", "https://x.com.evil.test/post", "not a URL"])(
    "preserves ordinary bookmarks: %s",
    (url) => {
      expect(getSpecialSource(url)).toBeNull();
      expect(matchesSpecialSources(url, { github: false, x: false })).toBe(true);
    },
  );
  it("keeps posts/articles eligible for AI organization without suggesting media folders for X", () => {
    const folders = ["视频", "图片", "Posts", "文章", "开发", " Photos "].map((name) => ({ name }));
    expect(
      suggestedFoldersForSource("https://x.com/user/status/1", folders).map((item) => item.name),
    ).toEqual(["Posts", "文章", "开发"]);
    expect(suggestedFoldersForSource("https://example.com/video", folders)).toBe(folders);
  });
  it("applies source, folder and tag filters as an intersection", () => {
    folder = "f1";
    const links = [
      makeLink({ id: 1, folderId: "f1", originalUrl: "https://x.com/i/article/1" }),
      makeLink({ id: 2, folderId: "f1", originalUrl: "https://github.com/a/b" }),
      makeLink({ id: 3, folderId: "f2" }),
    ];
    const { result } = renderHook(() =>
      useLinksListFilters({
        links,
        folders: [makeFolder({ id: "f1" })],
        linkTags: [
          { linkId: 1, tagId: "t" },
          { linkId: 2, tagId: "t" },
        ],
      }),
    );
    expect(result.current.filteredLinks.map((item) => item.id)).toEqual([2]);
    act(() => result.current.specialSources.toggle("x"));
    act(() => result.current.handleToggleFilterTag("t"));
    expect(result.current.filteredLinks.map((item) => item.id)).toEqual([1, 2]);
    act(() => result.current.specialSources.toggle("github"));
    expect(result.current.filteredLinks.map((item) => item.id)).toEqual([1]);
    act(() => result.current.handleClearFilters());
    expect(result.current.filteredLinks.map((item) => item.id)).toEqual([2]);
    expect(result.current.hasActiveFilters).toBe(false);
  });
});

describe("source preference controls", () => {
  it("offers accessible checkboxes, saves selections and restores defaults", async () => {
    function Harness() {
      const { sources, toggle, reset } = useSpecialSources();
      return <SpecialSourceFilter sources={sources} onToggle={toggle} onReset={reset} />;
    }
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "特殊来源" }));
    expect(screen.getByRole("checkbox", { name: "GitHub" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "X（全部内容）" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "X（全部内容）" }));
    expect(JSON.parse(localStorage.getItem(SPECIAL_SOURCES_KEY) ?? "null")).toEqual({
      github: true,
      x: true,
    });
    await user.click(screen.getByRole("button", { name: "恢复默认" }));
    expect(screen.getByRole("checkbox", { name: "X（全部内容）" })).not.toBeChecked();
  });
  it("synchronizes across mounted pages, reloads and browser storage events", () => {
    const first = renderHook(() => useSpecialSources());
    const second = renderHook(() => useSpecialSources());
    act(() => first.result.current.toggle("x"));
    expect(second.result.current.sources.x).toBe(true);
    expect(renderHook(() => useSpecialSources()).result.current.sources.x).toBe(true);
    act(() => {
      localStorage.removeItem(SPECIAL_SOURCES_KEY);
      window.dispatchEvent(new Event("storage"));
    });
    expect(first.result.current.sources).toEqual(DEFAULT_SPECIAL_SOURCES);
    expect(second.result.current.sources).toEqual(DEFAULT_SPECIAL_SOURCES);
  });
  it.each(["broken json", '{"x":true}', '{"github":"true","x":true}'])(
    "recovers safely from invalid stored preference: %s",
    (stored) => {
      localStorage.setItem(SPECIAL_SOURCES_KEY, stored);
      expect(renderHook(() => useSpecialSources()).result.current.sources).toEqual(
        DEFAULT_SPECIAL_SOURCES,
      );
    },
  );
  it("still works when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useSpecialSources());
    act(() => result.current.toggle("x"));
    expect(result.current.sources.x).toBe(true);
  });
});
