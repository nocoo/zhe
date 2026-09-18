// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { usePathname, useSearchParams } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardLoading from "@/app/(dashboard)/dashboard/loading";
import { CardListSkeleton } from "@/components/ui/card-skeleton";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(), useSearchParams: vi.fn() }));
afterEach(() => localStorage.clear());

describe("collection loading layouts", () => {
  it.each([
    ["/dashboard", "", "grid", "card-grid", 12],
    ["/dashboard", "folder=saved", "list", "card-list", 6],
    ["/dashboard", "folder=uncategorized", "grid", "card-grid", 12],
    ["/dashboard/github", "", "list", "card-grid", 8],
    ["/dashboard/x", "", "list", "card-grid", 12],
    ["/dashboard/ideas", "", "list", "card-grid", 12],
  ])("matches %s?%s with the %s preference", (path, query, view, testId, count) => {
    vi.mocked(usePathname).mockReturnValue(path);
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams(query) as ReturnType<typeof useSearchParams>,
    );
    localStorage.setItem("zhe_links_view_mode", view);
    render(<DashboardLoading />);
    const skeleton = screen.getByTestId(testId);
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveAccessibleName(/正在加载/);
    expect(skeleton.children).toHaveLength(count);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("falls back to a list when browser storage is unavailable", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as ReturnType<typeof useSearchParams>,
    );
    const storage = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    try {
      render(<DashboardLoading />);
      expect(screen.getByTestId("card-list")).toBeVisible();
    } finally {
      storage.mockRestore();
    }
  });

  it("uses icon rows for ideas and uploads instead of link preview thumbnails", () => {
    const { rerender } = render(<CardListSkeleton variant="idea" rows={2} />);
    expect(screen.getByRole("status").querySelectorAll(".size-10")).toHaveLength(2);
    rerender(<CardListSkeleton variant="upload" rows={4} />);
    expect(screen.getByRole("status").querySelectorAll(".size-10")).toHaveLength(4);
  });
});
