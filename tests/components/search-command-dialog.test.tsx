// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SearchCommandDialog } from "@/components/search-command-dialog";
import { buildSearchDocument, type SearchResponse, toSearchHit } from "@/models/search";
import { withTheme } from "../test-utils";

const { push, useSearch, retry } = vi.hoisted(() => ({
  push: vi.fn(),
  useSearch: vi.fn(),
  retry: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/viewmodels/useSearch", () => ({ useSearch }));
vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardState: () => ({ siteUrl: "https://zhe.to" }),
}));
const closed = vi.fn();
function show() {
  return render(withTheme(<SearchCommandDialog open onOpenChange={closed} />));
}
const response: SearchResponse = {
  query: "needle",
  items: [],
  total: 0,
  offset: 0,
  limit: 20,
  counts: { web: 0, x: 0, github: 0, idea: 0, todo: 0 },
};
beforeEach(() => {
  vi.clearAllMocks();
  useSearch.mockReturnValue({ data: response, loading: false, retry });
});
afterEach(cleanup);
it("opens with input focus and launcher actions; empty query has no resource results", async () => {
  show();
  await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
  expect(screen.getByText("输入关键词搜索")).toBeInTheDocument();
  expect(screen.getByText("切换到浅色主题")).toBeInTheDocument();
});
it("uses server results, shows match context, selects arriving first hit and preserves Enter original URL", async () => {
  const view = show();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "needle" } });
  const hit = toSearchHit(
    buildSearchDocument({
      kind: "link",
      id: 1,
      createdAt: 1,
      url: "https://github.com/a/b",
      title: "Repository",
      slug: "repo",
      repository: { readme: "needle", stars: 42 },
    }),
    "needle",
  );
  useSearch.mockReturnValue({
    data: { ...response, items: [hit], total: 1 },
    loading: false,
    retry,
  });
  view.rerender(withTheme(<SearchCommandDialog open onOpenChange={closed} />));
  await waitFor(() =>
    expect(document.querySelector('[data-value="repo"]')).toHaveAttribute("aria-selected", "true"),
  );
  expect(screen.getByText("README")).toBeInTheDocument();
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
  expect(open).toHaveBeenCalledWith("https://github.com/a/b", "_blank", "noopener,noreferrer");
  expect(closed).toHaveBeenCalledWith(false);
  open.mockRestore();
});
it("distinguishes loading/error/empty states and supports retry/view-all navigation", () => {
  useSearch.mockReturnValue({ loading: true, retry });
  const view = show();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "%_" } });
  expect(screen.getByRole("status")).toHaveTextContent("正在搜索");
  useSearch.mockReturnValue({ loading: false, error: "网络不可用", retry });
  view.rerender(withTheme(<SearchCommandDialog open onOpenChange={closed} />));
  fireEvent.click(screen.getByText("重试"));
  expect(retry).toHaveBeenCalledOnce();
  useSearch.mockReturnValue({ data: response, loading: false, retry });
  view.rerender(withTheme(<SearchCommandDialog open onOpenChange={closed} />));
  expect(screen.getByText("没有找到匹配的结果")).toBeInTheDocument();
  fireEvent.click(screen.getByText("查看全部搜索结果 →"));
  expect(push).toHaveBeenCalledWith("/dashboard/search?q=%25_");
});
it("does not activate a result during IME composition", () => {
  show();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "needle" } });
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter", isComposing: true });
  expect(push).not.toHaveBeenCalled();
});
it("retains copy and folder actions without opening the original link", async () => {
  const hit = toSearchHit(
    buildSearchDocument({
      kind: "link",
      id: 1,
      createdAt: 1,
      url: "https://example.com",
      title: "needle",
      slug: "copy",
      folderId: "f",
      folderName: "Work",
    }),
    "needle",
  );
  useSearch.mockReturnValue({
    data: { ...response, items: [hit], total: 1 },
    loading: false,
    retry,
  });
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: copy }, configurable: true });
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  show();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "needle" } });
  fireEvent.click(screen.getByLabelText("复制短链接 copy"));
  await waitFor(() => expect(copy).toHaveBeenCalledWith("https://zhe.to/copy"));
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("打开分类 Work"));
  expect(push).toHaveBeenCalledWith("/dashboard?folder=f");
  open.mockRestore();
});
